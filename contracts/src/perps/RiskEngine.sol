// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IFundingEngine } from "./interfaces/IFundingEngine.sol";
import { IMarginAccount } from "./interfaces/IMarginAccount.sol";
import { IPerpsMarketRegistry } from "./interfaces/IPerpsMarketRegistry.sol";
import { IPerpsOracle } from "./interfaces/IPerpsOracle.sol";
import { IPerpsPositionSource } from "./interfaces/IPerpsPositionSource.sol";
import { IRiskEngine } from "./interfaces/IRiskEngine.sol";
import { PerpsTypes } from "./PerpsTypes.sol";

contract RiskEngine is IRiskEngine {
    error InvalidAddress();
    error InvalidPositionSize();
    error MarketNotFound(bytes32 marketId);
    error SourcesAlreadyConfigured();
    error SourcesNotConfigured();
    error Unauthorized();
    error ValueTooLarge();

    event SourcesSet(address indexed positionSource, address indexed fundingEngine);

    uint256 public constant BPS = 10_000;
    uint256 public constant INTERNAL_SCALE = 1e18;
    int256 private constant INTERNAL_SCALE_INT = 1e18;
    uint256 public constant USDG_TO_INTERNAL_SCALE = 1e12;
    uint256 private constant MAX_SIGNED_VALUE = 2 ** 255 - 1;

    IMarginAccount public immutable marginAccount;
    IPerpsMarketRegistry public immutable registry;
    IPerpsOracle public immutable oracle;
    address public immutable admin;
    IPerpsPositionSource public positionSource;
    IFundingEngine public fundingEngine;

    constructor(address admin_, address marginAccount_, address registry_, address oracle_) {
        if (
            admin_ == address(0) || marginAccount_ == address(0) || registry_ == address(0)
                || oracle_ == address(0)
        ) revert InvalidAddress();
        admin = admin_;
        marginAccount = IMarginAccount(marginAccount_);
        registry = IPerpsMarketRegistry(registry_);
        oracle = IPerpsOracle(oracle_);
    }

    function setSources(address positionSource_, address fundingEngine_) external {
        if (msg.sender != admin) revert Unauthorized();
        if (positionSource_ == address(0) || fundingEngine_ == address(0)) revert InvalidAddress();
        if (address(positionSource) != address(0) || address(fundingEngine) != address(0)) {
            revert SourcesAlreadyConfigured();
        }
        positionSource = IPerpsPositionSource(positionSource_);
        fundingEngine = IFundingEngine(fundingEngine_);
        emit SourcesSet(positionSource_, fundingEngine_);
    }

    function crossHealth(address account)
        external
        view
        override
        returns (PerpsTypes.AccountHealth memory health)
    {
        _requireSources();
        bytes32[] memory markets = marginAccount.activeMarkets(account);
        int256 equity = _collateralToInternal(marginAccount.crossCollateral(account));
        uint256 initialMargin = 0;
        uint256 maintenanceMargin = 0;

        for (uint256 i; i < markets.length; ++i) {
            bytes32 marketId = markets[i];
            // The bounded active-market loop intentionally reads canonical account modes.
            // forge-lint: disable-next-line(calls-loop)
            if (marginAccount.marginMode(account, marketId) != PerpsTypes.MarginMode.Cross) {
                continue;
            }
            (int256 contribution, uint256 initial, uint256 maintenance) =
                _positionHealth(account, marketId);
            equity += contribution;
            initialMargin += initial;
            maintenanceMargin += maintenance;
        }

        return _buildHealth(equity, initialMargin, maintenanceMargin);
    }

    function isolatedHealth(address account, bytes32 marketId)
        external
        view
        override
        returns (PerpsTypes.AccountHealth memory health)
    {
        _requireSources();
        if (!registry.marketExists(marketId)) revert MarketNotFound(marketId);
        int256 equity = _collateralToInternal(marginAccount.isolatedMargin(account, marketId));
        (int256 contribution, uint256 initialMargin, uint256 maintenanceMargin) =
            _positionHealth(account, marketId);
        return _buildHealth(equity + contribution, initialMargin, maintenanceMargin);
    }

    function positionMetrics(address account, bytes32 marketId)
        external
        view
        returns (
            int256 unrealizedPnlUsd18,
            int256 fundingOwedUsd18,
            uint256 notionalUsd18,
            uint256 initialMarginUsd18,
            uint256 maintenanceMarginUsd18
        )
    {
        _requireSources();
        PerpsTypes.Position memory position = positionSource.getPosition(account, marketId);
        // State and session are intentionally excluded from pure risk calculation.
        // forge-lint: disable-next-line(unused-return)
        (PerpsTypes.MarketConfig memory config,,) = registry.getMarket(marketId);
        IPerpsOracle.Price memory price = oracle.getPrice(marketId);
        int256 fundingIndex = fundingEngine.currentFundingIndex(marketId);
        (unrealizedPnlUsd18, fundingOwedUsd18, notionalUsd18) =
            _positionValues(position, price.markPriceUsd18, fundingIndex);
        initialMarginUsd18 = _mulDivUp(notionalUsd18, config.initialMarginBps, BPS);
        maintenanceMarginUsd18 = _mulDivUp(notionalUsd18, config.maintenanceMarginBps, BPS);
    }

    function isolatedLiquidationPrice(address account, bytes32 marketId)
        external
        view
        returns (uint256 liquidationPriceUsd18)
    {
        _requireSources();
        PerpsTypes.Position memory position = positionSource.getPosition(account, marketId);
        if (position.size18 == 0) return 0;
        // State and session are intentionally excluded from pure risk calculation.
        // forge-lint: disable-next-line(unused-return)
        (PerpsTypes.MarketConfig memory config,,) = registry.getMarket(marketId);
        int256 fundingIndex = fundingEngine.currentFundingIndex(marketId);
        int256 fundingOwed =
            position.size18 * (fundingIndex - position.lastFundingIndex18) / INTERNAL_SCALE_INT;
        int256 adjustedCollateral =
            _collateralToInternal(marginAccount.isolatedMargin(account, marketId)) - fundingOwed;
        if (position.pendingFeesUsd18 > MAX_SIGNED_VALUE) revert ValueTooLarge();
        // The explicit signed bound check passed above.
        // forge-lint: disable-next-line(unsafe-typecast)
        adjustedCollateral -= int256(position.pendingFeesUsd18);

        uint256 absoluteSize = _absolutePositionSize(position.size18);
        uint256 entryNotional = absoluteSize * position.entryPriceUsd18 / INTERNAL_SCALE;
        if (entryNotional > MAX_SIGNED_VALUE) revert ValueTooLarge();
        // The explicit signed bound check passed above.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 signedEntryNotional = int256(entryNotional);
        if (position.size18 > 0) {
            if (adjustedCollateral >= signedEntryNotional) return 0;
            int256 numeratorSigned = signedEntryNotional - adjustedCollateral;
            // The branch above guarantees a positive numerator.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 numerator = uint256(numeratorSigned);
            uint256 effectiveSize = absoluteSize * (BPS - config.maintenanceMarginBps) / BPS;
            return _mulDivUp(numerator, INTERNAL_SCALE, effectiveSize);
        }

        int256 shortNumeratorSigned = signedEntryNotional + adjustedCollateral;
        if (shortNumeratorSigned <= 0) return 0;
        // The positive branch guarantees a safe conversion.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 shortNumerator = uint256(shortNumeratorSigned);
        uint256 shortEffectiveSize = absoluteSize * (BPS + config.maintenanceMarginBps) / BPS;
        return _mulDivUp(shortNumerator, INTERNAL_SCALE, shortEffectiveSize);
    }

    function _positionHealth(address account, bytes32 marketId)
        private
        view
        returns (int256 equityContribution, uint256 initialMargin, uint256 maintenanceMargin)
    {
        // This read is intentionally used from the bounded active-market loop.
        // forge-lint: disable-next-line(calls-loop)
        PerpsTypes.Position memory position = positionSource.getPosition(account, marketId);
        if (position.size18 == 0) return (0, 0, 0);
        // State and session are intentionally excluded from pure risk calculation.
        // forge-lint: disable-next-line(calls-loop,unused-return)
        (PerpsTypes.MarketConfig memory config,,) = registry.getMarket(marketId);
        // Oracle and funding reads are required inside the bounded active-market loop.
        // forge-lint: disable-next-line(calls-loop)
        IPerpsOracle.Price memory price = oracle.getPrice(marketId);
        // forge-lint: disable-next-line(calls-loop)
        int256 fundingIndex = fundingEngine.currentFundingIndex(marketId);
        (int256 pnl, int256 fundingOwed, uint256 notional) =
            _positionValues(position, price.markPriceUsd18, fundingIndex);

        // This validation remains required inside the bounded active-market loop.
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (position.pendingFeesUsd18 > MAX_SIGNED_VALUE) revert ValueTooLarge();
        // The explicit int256 bound check passed above.
        // forge-lint: disable-next-line(unsafe-typecast)
        equityContribution = pnl - fundingOwed - int256(position.pendingFeesUsd18);
        initialMargin = _mulDivUp(notional, config.initialMarginBps, BPS);
        maintenanceMargin = _mulDivUp(notional, config.maintenanceMarginBps, BPS);
    }

    function _positionValues(
        PerpsTypes.Position memory position,
        uint256 markPriceUsd18,
        int256 fundingIndex18
    ) private pure returns (int256 pnlUsd18, int256 fundingOwedUsd18, uint256 notionalUsd18) {
        // This validation remains required inside the bounded active-market loop.
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (position.size18 == type(int256).min) revert InvalidPositionSize();
        // forge-lint: disable-start(require-revert-in-loop)
        if (markPriceUsd18 > MAX_SIGNED_VALUE || position.entryPriceUsd18 > MAX_SIGNED_VALUE) {
            revert ValueTooLarge();
        }
        // forge-lint: disable-end(require-revert-in-loop)
        // Both prices passed explicit int256 bound checks.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 mark = int256(markPriceUsd18);
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 entry = int256(position.entryPriceUsd18);
        pnlUsd18 = position.size18 * (mark - entry) / INTERNAL_SCALE_INT;
        fundingOwedUsd18 =
            position.size18 * (fundingIndex18 - position.lastFundingIndex18) / INTERNAL_SCALE_INT;
        uint256 absoluteSize =
        // size cannot be int256 minimum because it was rejected above.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256(position.size18 < 0 ? -position.size18 : position.size18);
        notionalUsd18 = absoluteSize * markPriceUsd18 / INTERNAL_SCALE;
    }

    function _buildHealth(int256 equity, uint256 initialMargin, uint256 maintenanceMargin)
        private
        pure
        returns (PerpsTypes.AccountHealth memory health)
    {
        uint256 marginRatio;
        bool liquidatable;
        if (equity <= 0) {
            marginRatio = maintenanceMargin == 0 ? 0 : type(uint256).max;
            liquidatable = maintenanceMargin != 0;
        } else {
            // equity is positive, therefore the conversion is safe.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 positiveEquity = uint256(equity);
            marginRatio = maintenanceMargin * INTERNAL_SCALE / positiveEquity;
            liquidatable = positiveEquity < maintenanceMargin;
        }
        return PerpsTypes.AccountHealth({
            equityUsd18: equity,
            initialMarginUsd18: initialMargin,
            maintenanceMarginUsd18: maintenanceMargin,
            marginRatio18: marginRatio,
            liquidatable: liquidatable
        });
    }

    function _mulDivUp(uint256 value, uint256 numerator, uint256 denominator)
        private
        pure
        returns (uint256)
    {
        if (value == 0 || numerator == 0) return 0;
        return (value * numerator + denominator - 1) / denominator;
    }

    function _collateralToInternal(uint256 collateral6) private pure returns (int256) {
        if (collateral6 > MAX_SIGNED_VALUE / USDG_TO_INTERNAL_SCALE) {
            revert ValueTooLarge();
        }
        // The explicit bound check above guarantees a safe conversion.
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(collateral6 * USDG_TO_INTERNAL_SCALE);
    }

    function _absolutePositionSize(int256 size18) private pure returns (uint256) {
        if (size18 == type(int256).min) revert InvalidPositionSize();
        // int256 minimum was rejected, so its absolute magnitude is representable.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(size18 < 0 ? -size18 : size18);
    }

    function _requireSources() private view {
        if (address(positionSource) == address(0) || address(fundingEngine) == address(0)) {
            revert SourcesNotConfigured();
        }
    }
}
