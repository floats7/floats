// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { OptionsTypes } from "./OptionsTypes.sol";

interface IOptionsSeriesRegistry {
    function getSeries(bytes32 seriesId)
        external
        view
        returns (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state);

    function setSeriesState(bytes32 seriesId, OptionsTypes.SeriesState state) external;
    function getSeriesState(bytes32 seriesId) external view returns (OptionsTypes.SeriesState);
}

interface IOptionsPositionToken {
    function burn(address account, uint256 seriesId, uint256 amount) external;
}

interface IOptionsCollateralVault {
    function reserveCollateral(uint256 amount) external;
    function releaseCollateral(uint256 amount) external;
    function settleCollateral(uint256 maximumLiability, uint256 actualLiability) external;
    function payClaim(address receiver, uint256 amount) external;
    function paySellBack(address receiver, uint256 amount) external;
}

interface ISettlementPriceSource {
    function settlementPrice(address underlying, uint48 expiry)
        external
        view
        returns (uint256 priceUsd18, uint48 observedAt, bool finalObservation);
}

interface ISettlementRiskManager {
    function recordSettlement(bytes32 seriesId, uint256 liability6) external;
}

contract SettlementEngine is ReentrancyGuard {
    using Math for uint256;

    struct PositionAccounting {
        uint256 openSize18;
        uint256 maximumLiability6;
    }

    struct Settlement {
        uint256 priceUsd18;
        uint256 payoffPerUnitUsd18;
        uint256 totalClaimable6;
        uint256 paidClaims6;
        uint256 settledSize18;
        uint256 claimedSize18;
        uint256 settledAt;
        bool manual;
    }

    error InvalidAddress();
    error InvalidAmount();
    error InvalidObservation();
    error Unauthorized();
    error InvalidSeriesState();
    error AlreadySettled();
    error InsufficientOpenInterest();
    error NoPosition();

    event PositionOpened(
        bytes32 indexed seriesId, uint256 size18, uint256 maximumLiability6, uint256 totalOpenSize18
    );
    event PositionClosed(
        bytes32 indexed seriesId,
        uint256 size18,
        uint256 releasedLiability6,
        uint256 totalOpenSize18
    );
    event SeriesSettled(
        bytes32 indexed seriesId,
        uint256 settlementPriceUsd18,
        uint256 payoffPerUnitUsd18,
        uint256 totalClaimable6,
        bool manual
    );
    event PositionClaimed(
        bytes32 indexed seriesId, address indexed account, uint256 size18, uint256 payout6
    );
    event MarketSet(address indexed market);
    event RiskManagerSet(address indexed riskManager);

    uint256 private constant USD18_TO_USDG6_AND_SIZE18 = 1e30;

    address public immutable admin;
    address public market;
    address public riskManager;
    IOptionsSeriesRegistry public immutable registry;
    IOptionsPositionToken public immutable optionToken;
    IOptionsCollateralVault public immutable vault;
    uint48 public immutable maximumObservationDelay;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(bytes32 seriesId => PositionAccounting accounting) public positionAccounting;
    mapping(bytes32 seriesId => Settlement settlement) public settlements;

    constructor(
        address admin_,
        address registry_,
        address optionToken_,
        address vault_,
        uint48 maximumObservationDelay_
    ) {
        if (
            admin_ == address(0) || registry_ == address(0) || optionToken_ == address(0)
                || vault_ == address(0)
        ) revert InvalidAddress();
        if (maximumObservationDelay_ == 0 || maximumObservationDelay_ > 7 days) {
            revert InvalidObservation();
        }
        admin = admin_;
        registry = IOptionsSeriesRegistry(registry_);
        optionToken = IOptionsPositionToken(optionToken_);
        vault = IOptionsCollateralVault(vault_);
        maximumObservationDelay = maximumObservationDelay_;
    }

    function setMarket(address market_) external {
        _requireAdmin();
        if (market_ == address(0)) revert InvalidAddress();
        if (market != address(0)) revert InvalidAddress();
        market = market_;
        emit MarketSet(market_);
    }

    function setRiskManager(address riskManager_) external {
        _requireAdmin();
        if (riskManager_ == address(0)) revert InvalidAddress();
        if (riskManager != address(0)) revert InvalidAddress();
        riskManager = riskManager_;
        emit RiskManagerSet(riskManager_);
    }

    function setKeeper(address keeper, bool allowed) external {
        _requireAdmin();
        if (keeper == address(0)) revert InvalidAddress();
        isKeeper[keeper] = allowed;
    }

    function openPosition(bytes32 seriesId, uint256 size18)
        external
        nonReentrant
        returns (uint256 liability6)
    {
        _requireMarket();
        if (size18 == 0) revert InvalidAmount();
        (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
            registry.getSeries(seriesId);
        if (state != OptionsTypes.SeriesState.Active) revert InvalidSeriesState();

        liability6 = _maximumLiability(terms, size18);
        if (liability6 == 0) revert InvalidAmount();
        PositionAccounting storage accounting = positionAccounting[seriesId];
        accounting.openSize18 += size18;
        accounting.maximumLiability6 += liability6;
        vault.reserveCollateral(liability6);
        emit PositionOpened(seriesId, size18, liability6, accounting.openSize18);
    }

    function closePosition(bytes32 seriesId, uint256 size18, address receiver, uint256 payout6)
        external
        nonReentrant
        returns (uint256 released6)
    {
        _requireMarket();
        if (size18 == 0 || receiver == address(0) || payout6 == 0) revert InvalidAmount();
        OptionsTypes.SeriesState state = registry.getSeriesState(seriesId);
        if (state != OptionsTypes.SeriesState.Active) revert InvalidSeriesState();

        PositionAccounting storage accounting = positionAccounting[seriesId];
        if (size18 > accounting.openSize18) revert InsufficientOpenInterest();
        released6 = Math.mulDiv(accounting.maximumLiability6, size18, accounting.openSize18);
        accounting.openSize18 -= size18;
        accounting.maximumLiability6 -= released6;
        vault.releaseCollateral(released6);
        vault.paySellBack(receiver, payout6);
        emit PositionClosed(seriesId, size18, released6, accounting.openSize18);
    }

    function settle(bytes32 seriesId) external nonReentrant {
        _requireOperator();
        (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
            registry.getSeries(seriesId);
        if (state != OptionsTypes.SeriesState.TradingClosed || block.timestamp < terms.expiry) {
            revert InvalidSeriesState();
        }
        (uint256 priceUsd18, uint48 observedAt, bool finalObservation) = ISettlementPriceSource(
                terms.priceSource
            )
            .settlementPrice(terms.underlying, terms.expiry);
        if (
            !finalObservation || priceUsd18 == 0 || observedAt < terms.expiry
                || observedAt > terms.expiry + maximumObservationDelay
        ) revert InvalidObservation();
        _settle(seriesId, terms, priceUsd18, false);
    }

    function manualSettle(bytes32 seriesId, uint256 priceUsd18) external nonReentrant {
        _requireAdmin();
        if (priceUsd18 == 0) revert InvalidObservation();
        (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
            registry.getSeries(seriesId);
        if (
            state != OptionsTypes.SeriesState.ManualSettlementRequired
                || block.timestamp < terms.expiry
        ) {
            revert InvalidSeriesState();
        }
        _settle(seriesId, terms, priceUsd18, true);
    }

    function claim(bytes32 seriesId, uint256 size18)
        external
        nonReentrant
        returns (uint256 payout6)
    {
        return _claim(seriesId, msg.sender, size18);
    }

    function claimFor(bytes32 seriesId, address account, uint256 size18)
        external
        nonReentrant
        returns (uint256 payout6)
    {
        _requireMarket();
        if (account == address(0)) revert InvalidAddress();
        return _claim(seriesId, account, size18);
    }

    function _claim(bytes32 seriesId, address account, uint256 size18)
        private
        returns (uint256 payout6)
    {
        if (size18 == 0) revert InvalidAmount();
        Settlement storage settlement = settlements[seriesId];
        if (settlement.settledAt == 0) revert NoPosition();
        if (settlement.claimedSize18 + size18 > settlement.settledSize18) revert NoPosition();

        optionToken.burn(account, uint256(seriesId), size18);
        uint256 nextClaimedSize = settlement.claimedSize18 + size18;
        if (nextClaimedSize == settlement.settledSize18) {
            payout6 = settlement.totalClaimable6 - settlement.paidClaims6;
        } else {
            payout6 = Math.mulDiv(settlement.payoffPerUnitUsd18, size18, USD18_TO_USDG6_AND_SIZE18);
        }
        settlement.claimedSize18 = nextClaimedSize;
        settlement.paidClaims6 += payout6;
        if (payout6 != 0) vault.payClaim(account, payout6);
        emit PositionClaimed(seriesId, account, size18, payout6);
    }

    function _settle(
        bytes32 seriesId,
        OptionsTypes.SeriesTerms memory terms,
        uint256 priceUsd18,
        bool manual
    ) private {
        Settlement storage settlement = settlements[seriesId];
        if (settlement.settledAt != 0) revert AlreadySettled();
        PositionAccounting memory accounting = positionAccounting[seriesId];
        uint256 payoffPerUnit = _payoffPerUnit(terms, priceUsd18);
        uint256 totalClaimable =
            Math.mulDiv(payoffPerUnit, accounting.openSize18, USD18_TO_USDG6_AND_SIZE18);

        settlement.priceUsd18 = priceUsd18;
        settlement.payoffPerUnitUsd18 = payoffPerUnit;
        settlement.totalClaimable6 = totalClaimable;
        settlement.settledSize18 = accounting.openSize18;
        settlement.settledAt = block.timestamp;
        settlement.manual = manual;
        delete positionAccounting[seriesId];

        if (accounting.maximumLiability6 != 0) {
            vault.settleCollateral(accounting.maximumLiability6, totalClaimable);
            if (riskManager != address(0)) {
                ISettlementRiskManager(riskManager)
                    .recordSettlement(seriesId, accounting.maximumLiability6);
            }
        }
        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.Settled);
        emit SeriesSettled(seriesId, priceUsd18, payoffPerUnit, totalClaimable, manual);
    }

    function _maximumLiability(OptionsTypes.SeriesTerms memory terms, uint256 size18)
        private
        pure
        returns (uint256)
    {
        uint256 maximumPerUnderlyingUnit = terms.kind == OptionsTypes.OptionKind.CappedCall
            ? terms.capUsd18 - terms.strikeUsd18
            : terms.strikeUsd18;
        uint256 maximumPerOption = Math.mulDiv(maximumPerUnderlyingUnit, terms.contractSize18, 1e18);
        return Math.mulDiv(maximumPerOption, size18, USD18_TO_USDG6_AND_SIZE18);
    }

    function _payoffPerUnit(OptionsTypes.SeriesTerms memory terms, uint256 priceUsd18)
        private
        pure
        returns (uint256)
    {
        if (terms.kind == OptionsTypes.OptionKind.CappedCall) {
            if (priceUsd18 <= terms.strikeUsd18) return 0;
            uint256 callPayoff =
                Math.min(priceUsd18 - terms.strikeUsd18, terms.capUsd18 - terms.strikeUsd18);
            return Math.mulDiv(callPayoff, terms.contractSize18, 1e18);
        }
        uint256 putPayoff = priceUsd18 < terms.strikeUsd18 ? terms.strikeUsd18 - priceUsd18 : 0;
        return Math.mulDiv(putPayoff, terms.contractSize18, 1e18);
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }

    function _requireMarket() private view {
        if (msg.sender != market) revert Unauthorized();
    }

    function _requireOperator() private view {
        if (msg.sender != admin && !isKeeper[msg.sender]) revert Unauthorized();
    }
}
