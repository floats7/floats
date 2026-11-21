// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { FundingEngine } from "./FundingEngine.sol";
import { MarginAccount } from "./MarginAccount.sol";
import { PerpsLiquidityVault } from "./PerpsLiquidityVault.sol";
import { IPerpsMarketRegistry } from "./interfaces/IPerpsMarketRegistry.sol";
import { IPerpsOracle } from "./interfaces/IPerpsOracle.sol";
import { IPerpsPositionSource } from "./interfaces/IPerpsPositionSource.sol";
import { IRiskEngine } from "./interfaces/IRiskEngine.sol";
import { PerpsTypes } from "./PerpsTypes.sol";

contract PerpsMarket is IPerpsPositionSource, ReentrancyGuard {
    error ExposureLimitExceeded();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidPositionChange();
    error MarketNotActive(bytes32 marketId);
    error PositionFlipNotAllowed();
    error SlippageExceeded(uint256 executionPriceUsd18, uint256 acceptablePriceUsd18);
    error UnsafeAccount();
    error UtilizationLimitExceeded();
    error ValueTooLarge();
    error AlreadyConfigured();
    error AdlPositionNotProfitable();
    error Unauthorized();

    event PositionModified(
        address indexed account,
        bytes32 indexed marketId,
        int256 sizeDelta18,
        int256 resultingSize18,
        uint256 executionPriceUsd18,
        int256 realizedPnlUsd18,
        int256 fundingPaymentUsd18,
        uint256 feeUsd6
    );
    event PositionLiquidated(
        address indexed account,
        bytes32 indexed marketId,
        address indexed keeper,
        uint256 closedSize18,
        uint256 markPriceUsd18,
        int256 settlementUsd18,
        uint256 liquidationFee6,
        uint256 badDebt6
    );
    event PerpsFundingSettled(
        address indexed account,
        bytes32 indexed marketId,
        int256 paymentUsd18,
        uint256 transferredAssets6
    );
    event LiquidationEngineSet(address indexed liquidationEngine);
    event PositionAutoDeleveraged(
        address indexed account,
        bytes32 indexed marketId,
        uint256 closedSize18,
        uint256 markPriceUsd18,
        uint256 foregoneProfit6,
        int256 resultingSize18
    );

    uint256 public constant BPS = 10_000;
    uint256 public constant LP_FEE_SHARE_BPS = 7000;
    uint256 public constant INTERNAL_SCALE = 1e18;
    int256 private constant INTERNAL_SCALE_INT = 1e18;
    uint256 public constant USDG_TO_INTERNAL_SCALE = 1e12;
    uint256 public constant MAX_NET_EXPOSURE_BPS = 3000;
    uint256 public constant MAX_UTILIZATION_BPS = 7000;
    uint256 private constant MAX_SIGNED_VALUE = 2 ** 255 - 1;

    struct TradeContext {
        int256 previousSize;
        int256 resultingSize;
        int256 fundingIndex;
        int256 fundingPayment;
        int256 realizedPnl;
        uint256 executionPrice;
        uint256 deltaNotional;
        uint256 feeAssets;
        uint256 previousOi;
        uint256 previousReserve;
        uint256 nextOi;
        uint256 nextReserve;
        bool increasing;
    }

    struct LiquidationContext {
        uint256 previousSize;
        uint256 markPrice;
        uint256 previousOi;
        uint256 previousReserve;
        uint256 releasedOi;
        uint256 releasedReserve;
        uint256 nextOi;
        int256 fundingIndex;
        int256 closePnl;
        int256 settlement;
        int256 resultingSize;
    }

    struct AdlContext {
        int256 previousSize18;
        uint256 previousSize;
        uint256 markPrice;
        int256 closePnlUsd18;
        int256 fundingIndex;
        uint256 previousOi;
        uint256 previousReserve;
        uint256 releasedOi;
        uint256 releasedReserve;
        int256 resultingSize;
        uint256 nextOi;
    }

    struct TradePreview {
        uint256 markPriceUsd18;
        uint256 executionPriceUsd18;
        uint256 spreadBps;
        uint256 feeUsd6;
        uint256 resultingNotionalUsd18;
        uint256 requiredInitialMarginUsd18;
        uint256 liquidationPriceUsd18;
        int256 resultingSize18;
    }

    IPerpsMarketRegistry public immutable registry;
    IPerpsOracle public immutable oracle;
    FundingEngine public immutable fundingEngine;
    IRiskEngine public immutable riskEngine;
    MarginAccount public immutable marginAccount;
    PerpsLiquidityVault public immutable liquidityVault;
    address public immutable admin;
    address public immutable protocolFeeRecipient;
    address public liquidationEngine;

    mapping(address account => mapping(bytes32 marketId => PerpsTypes.Position position)) private
        _positions;
    mapping(address account => mapping(bytes32 marketId => uint256 oiUsd18)) private
        _positionOpenInterest;
    mapping(address account => mapping(bytes32 marketId => uint256 assets6)) private
        _reservedLiability;
    mapping(bytes32 marketId => uint256 oiUsd18) private _longOpenInterest;
    mapping(bytes32 marketId => uint256 oiUsd18) private _shortOpenInterest;

    constructor(
        address admin_,
        address registry_,
        address oracle_,
        address fundingEngine_,
        address riskEngine_,
        address marginAccount_,
        address liquidityVault_,
        address protocolFeeRecipient_
    ) {
        if (
            admin_ == address(0) || registry_ == address(0) || oracle_ == address(0)
                || fundingEngine_ == address(0) || riskEngine_ == address(0)
                || marginAccount_ == address(0) || liquidityVault_ == address(0)
                || protocolFeeRecipient_ == address(0)
        ) revert InvalidAddress();
        admin = admin_;
        registry = IPerpsMarketRegistry(registry_);
        oracle = IPerpsOracle(oracle_);
        fundingEngine = FundingEngine(fundingEngine_);
        riskEngine = IRiskEngine(riskEngine_);
        marginAccount = MarginAccount(marginAccount_);
        liquidityVault = PerpsLiquidityVault(liquidityVault_);
        protocolFeeRecipient = protocolFeeRecipient_;
    }

    function setLiquidationEngine(address liquidationEngine_) external {
        if (msg.sender != admin) revert Unauthorized();
        if (liquidationEngine_ == address(0)) revert InvalidAddress();
        if (liquidationEngine != address(0)) revert AlreadyConfigured();
        liquidationEngine = liquidationEngine_;
        emit LiquidationEngineSet(liquidationEngine_);
    }

    // The entry point is non-reentrant and external accounting mutations revert atomically.
    // forge-lint: disable-start(reentrancy-no-eth,reentrancy-events)
    function modifyPosition(bytes32 marketId, int256 sizeDelta18, uint256 acceptablePriceUsd18)
        external
        nonReentrant
        returns (uint256 executionPriceUsd18)
    {
        if (sizeDelta18 == 0 || sizeDelta18 == type(int256).min) revert InvalidAmount();
        PerpsTypes.Position storage position = _positions[msg.sender][marketId];
        TradeContext memory trade;
        trade.previousSize = position.size18;
        trade.resultingSize = trade.previousSize + sizeDelta18;
        _validatePositionChange(trade.previousSize, sizeDelta18, trade.resultingSize);

        trade.increasing = _absolute(trade.resultingSize) > _absolute(trade.previousSize);
        trade.previousOi = _positionOpenInterest[msg.sender][marketId];
        trade.previousReserve = _reservedLiability[msg.sender][marketId];
        (
            PerpsTypes.MarketConfig memory config,
            PerpsTypes.MarketState marketState,
            PerpsTypes.SessionState session
        ) = registry.getMarket(marketId);
        if (trade.increasing) {
            if (marketState != PerpsTypes.MarketState.Active) revert MarketNotActive(marketId);
            if (session == PerpsTypes.SessionState.Closed) revert MarketNotActive(marketId);
        }

        IPerpsOracle.Price memory price = oracle.getPrice(marketId);
        trade.executionPrice = _executionPrice(
            marketId,
            sizeDelta18,
            trade.previousSize,
            trade.resultingSize,
            trade.previousOi,
            price.markPriceUsd18,
            config,
            session
        );
        _validateSlippage(sizeDelta18, trade.executionPrice, acceptablePriceUsd18);

        trade.fundingIndex = fundingEngine.currentFundingIndex(marketId);
        trade.fundingPayment = _settleFunding(
            msg.sender,
            marketId,
            trade.previousSize,
            position.lastFundingIndex18,
            trade.fundingIndex
        );

        trade.deltaNotional = _absolute(sizeDelta18) * trade.executionPrice / INTERNAL_SCALE;
        trade.feeAssets = _toAssetsUp(_mulDivUp(trade.deltaNotional, config.tradingFeeBps, BPS));
        if (trade.feeAssets != 0) {
            uint256 lpFeeAssets = trade.feeAssets * LP_FEE_SHARE_BPS / BPS;
            uint256 protocolFeeAssets = trade.feeAssets - lpFeeAssets;
            if (lpFeeAssets != 0) {
                marginAccount.payMargin(msg.sender, marketId, address(liquidityVault), lpFeeAssets);
                liquidityVault.recordProtocolRevenue(lpFeeAssets);
            }
            if (protocolFeeAssets != 0) {
                marginAccount.payMargin(
                    msg.sender, marketId, protocolFeeRecipient, protocolFeeAssets
                );
            }
        }

        if (trade.increasing) {
            uint256 reserveDelta = _toAssetsUp(trade.deltaNotional);
            _validateExposure(
                marketId,
                trade.resultingSize,
                trade.previousSize,
                trade.deltaNotional,
                reserveDelta,
                config
            );
            liquidityVault.reserveLiability(reserveDelta);
            trade.nextReserve = trade.previousReserve + reserveDelta;
            trade.nextOi = trade.previousOi + trade.deltaNotional;
            position.entryPriceUsd18 = _weightedEntryPrice(
                trade.previousSize, position.entryPriceUsd18, sizeDelta18, trade.executionPrice
            );
        } else {
            uint256 reducedSize = _absolute(sizeDelta18);
            uint256 previousAbsoluteSize = _absolute(trade.previousSize);
            uint256 releasedOi = trade.previousOi * reducedSize / previousAbsoluteSize;
            uint256 releasedReserve = trade.previousReserve * reducedSize / previousAbsoluteSize;
            trade.nextOi = trade.previousOi - releasedOi;
            trade.nextReserve = trade.previousReserve - releasedReserve;
            if (
                trade.executionPrice > MAX_SIGNED_VALUE
                    || position.entryPriceUsd18 > MAX_SIGNED_VALUE
            ) revert ValueTooLarge();
            // Reduced size and both prices passed explicit signed bounds.
            // forge-lint: disable-start(unsafe-typecast)
            trade.realizedPnl = trade.previousSize > 0
                ? int256(reducedSize)
                    * (int256(trade.executionPrice) - int256(position.entryPriceUsd18))
                    / INTERNAL_SCALE_INT
                : int256(reducedSize)
                    * (int256(position.entryPriceUsd18) - int256(trade.executionPrice))
                    / INTERNAL_SCALE_INT;
            // forge-lint: disable-end(unsafe-typecast)
            _settleRealizedPnl(msg.sender, marketId, trade.realizedPnl, releasedReserve);
            if (trade.resultingSize == 0) position.entryPriceUsd18 = 0;
        }

        _updateOpenInterest(
            marketId, trade.previousSize, trade.resultingSize, trade.previousOi, trade.nextOi
        );
        _positionOpenInterest[msg.sender][marketId] = trade.nextOi;
        _reservedLiability[msg.sender][marketId] = trade.nextReserve;
        position.size18 = trade.resultingSize;
        position.lastFundingIndex18 = trade.fundingIndex;
        position.realizedPnlUsd18 += trade.realizedPnl;
        position.pendingFeesUsd18 = 0;
        marginAccount.setPositionOpen(msg.sender, marketId, trade.resultingSize != 0);

        _requireHealthy(msg.sender, marketId, session, config, trade.increasing);
        emit PositionModified(
            msg.sender,
            marketId,
            sizeDelta18,
            trade.resultingSize,
            trade.executionPrice,
            trade.realizedPnl,
            trade.fundingPayment,
            trade.feeAssets
        );
        return trade.executionPrice;
    }
    // forge-lint: disable-end(reentrancy-no-eth,reentrancy-events)

    function getPosition(address account, bytes32 marketId)
        external
        view
        override
        returns (PerpsTypes.Position memory position)
    {
        return _positions[account][marketId];
    }

    function previewPositionChange(address account, bytes32 marketId, int256 sizeDelta18)
        external
        view
        returns (TradePreview memory preview)
    {
        if (account == address(0)) revert InvalidAddress();
        if (sizeDelta18 == 0 || sizeDelta18 == type(int256).min) revert InvalidAmount();
        PerpsTypes.Position memory position = _positions[account][marketId];
        preview.resultingSize18 = position.size18 + sizeDelta18;
        _validatePositionChange(position.size18, sizeDelta18, preview.resultingSize18);
        bool increasing = _absolute(preview.resultingSize18) > _absolute(position.size18);
        (
            PerpsTypes.MarketConfig memory config,
            PerpsTypes.MarketState marketState,
            PerpsTypes.SessionState session
        ) = registry.getMarket(marketId);
        if (increasing) {
            if (
                marketState != PerpsTypes.MarketState.Active
                    || session == PerpsTypes.SessionState.Closed
            ) revert MarketNotActive(marketId);
        }
        preview.markPriceUsd18 = oracle.getPrice(marketId).markPriceUsd18;
        preview.executionPriceUsd18 = _executionPrice(
            marketId,
            sizeDelta18,
            position.size18,
            preview.resultingSize18,
            _positionOpenInterest[account][marketId],
            preview.markPriceUsd18,
            config,
            session
        );
        preview.spreadBps = preview.executionPriceUsd18 > preview.markPriceUsd18
            ? (preview.executionPriceUsd18 - preview.markPriceUsd18) * BPS / preview.markPriceUsd18
            : (preview.markPriceUsd18 - preview.executionPriceUsd18) * BPS / preview.markPriceUsd18;
        uint256 deltaNotional =
            _absolute(sizeDelta18) * preview.executionPriceUsd18 / INTERNAL_SCALE;
        preview.feeUsd6 = _toAssetsUp(_mulDivUp(deltaNotional, config.tradingFeeBps, BPS));
        preview.resultingNotionalUsd18 =
            _absolute(preview.resultingSize18) * preview.markPriceUsd18 / INTERNAL_SCALE;
        preview.requiredInitialMarginUsd18 =
            _mulDivUp(preview.resultingNotionalUsd18, config.initialMarginBps, BPS);
        preview.liquidationPriceUsd18 = _previewIsolatedLiquidationPrice(
            account,
            marketId,
            position,
            preview.resultingSize18,
            preview.executionPriceUsd18,
            preview.feeUsd6,
            config.maintenanceMarginBps
        );
        if (increasing) {
            _validateExposure(
                marketId,
                preview.resultingSize18,
                position.size18,
                deltaNotional,
                _toAssetsUp(deltaNotional),
                config
            );
        }
    }

    function _previewIsolatedLiquidationPrice(
        address account,
        bytes32 marketId,
        PerpsTypes.Position memory position,
        int256 resultingSize,
        uint256 executionPriceUsd18,
        uint256 feeUsd6,
        uint256 maintenanceMarginBps
    ) private view returns (uint256) {
        if (
            resultingSize == 0
                || marginAccount.marginMode(account, marketId) == PerpsTypes.MarginMode.Cross
        ) return 0;
        uint256 entryPrice = position.entryPriceUsd18;
        if (_absolute(resultingSize) > _absolute(position.size18)) {
            int256 delta = resultingSize - position.size18;
            entryPrice = _weightedEntryPrice(
                position.size18, position.entryPriceUsd18, delta, executionPriceUsd18
            );
        }
        int256 fundingOwed = position.size18
            * (fundingEngine.currentFundingIndex(marketId) - position.lastFundingIndex18)
            / INTERNAL_SCALE_INT;
        uint256 collateral6 = marginAccount.isolatedMargin(account, marketId);
        if (
            collateral6 > MAX_SIGNED_VALUE / USDG_TO_INTERNAL_SCALE
                || feeUsd6 > MAX_SIGNED_VALUE / USDG_TO_INTERNAL_SCALE
                || position.pendingFeesUsd18 > MAX_SIGNED_VALUE
        ) revert ValueTooLarge();
        // All values passed explicit signed bounds.
        // forge-lint: disable-start(unsafe-typecast)
        int256 adjustedCollateral = int256(collateral6 * USDG_TO_INTERNAL_SCALE) - fundingOwed
            - int256(feeUsd6 * USDG_TO_INTERNAL_SCALE) - int256(position.pendingFeesUsd18);
        // forge-lint: disable-end(unsafe-typecast)
        uint256 size = _absolute(resultingSize);
        uint256 entryNotional = size * entryPrice / INTERNAL_SCALE;
        if (entryNotional > MAX_SIGNED_VALUE) revert ValueTooLarge();
        // The bound above makes the conversion safe.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 signedEntryNotional = int256(entryNotional);
        if (resultingSize > 0) {
            if (adjustedCollateral >= signedEntryNotional) return 0;
            // The branch guarantees a positive numerator.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 numerator = uint256(signedEntryNotional - adjustedCollateral);
            uint256 effectiveSize = size * (BPS - maintenanceMarginBps) / BPS;
            return _mulDivUp(numerator, INTERNAL_SCALE, effectiveSize);
        }
        int256 shortNumerator = signedEntryNotional + adjustedCollateral;
        if (shortNumerator <= 0) return 0;
        // The positive branch guarantees a safe conversion.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 positiveShortNumerator = uint256(shortNumerator);
        return _mulDivUp(
            positiveShortNumerator, INTERNAL_SCALE, size * (BPS + maintenanceMarginBps) / BPS
        );
    }

    // The entry point is non-reentrant and external accounting mutations revert atomically.
    // forge-lint: disable-start(reentrancy-no-eth,reentrancy-events)
    function liquidatePosition(
        address account,
        bytes32 marketId,
        uint256 closeSize18,
        address keeper,
        address insuranceFund
    ) external nonReentrant returns (uint256 badDebt6, uint256 liquidationFeePaid6) {
        if (msg.sender != liquidationEngine || liquidationEngine == address(0)) {
            revert Unauthorized();
        }
        if (account == address(0) || keeper == address(0) || insuranceFund == address(0)) {
            revert InvalidAddress();
        }
        PerpsTypes.Position storage position = _positions[account][marketId];
        LiquidationContext memory liquidation;
        liquidation.previousSize = _absolute(position.size18);
        if (closeSize18 == 0 || closeSize18 > liquidation.previousSize) {
            revert InvalidAmount();
        }

        IPerpsOracle.Price memory price = oracle.getPrice(marketId);
        liquidation.markPrice = price.markPriceUsd18;
        liquidation.fundingIndex = fundingEngine.currentFundingIndex(marketId);
        int256 fundingPayment = position.size18
            * (liquidation.fundingIndex - position.lastFundingIndex18) / INTERNAL_SCALE_INT;
        if (liquidation.markPrice > MAX_SIGNED_VALUE || position.entryPriceUsd18 > MAX_SIGNED_VALUE)
        {
            revert ValueTooLarge();
        }
        // Size and prices are explicitly bounded before signed arithmetic.
        // forge-lint: disable-start(unsafe-typecast)
        liquidation.closePnl = position.size18 > 0
            ? int256(closeSize18)
                * (int256(liquidation.markPrice) - int256(position.entryPriceUsd18))
                / INTERNAL_SCALE_INT
            : int256(closeSize18)
                * (int256(position.entryPriceUsd18) - int256(liquidation.markPrice))
                / INTERNAL_SCALE_INT;
        // forge-lint: disable-end(unsafe-typecast)
        liquidation.settlement = liquidation.closePnl - fundingPayment;

        liquidation.previousOi = _positionOpenInterest[account][marketId];
        liquidation.previousReserve = _reservedLiability[account][marketId];
        liquidation.releasedOi = liquidation.previousOi * closeSize18 / liquidation.previousSize;
        liquidation.releasedReserve =
            liquidation.previousReserve * closeSize18 / liquidation.previousSize;
        // closeSize cannot exceed the absolute signed position size.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 signedCloseSize = int256(closeSize18);
        liquidation.resultingSize = position.size18 > 0
            ? position.size18 - signedCloseSize
            : position.size18 + signedCloseSize;

        if (liquidation.settlement > 0) {
            // Positive branch guarantees a safe unsigned conversion.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 profit6 = uint256(liquidation.settlement) / USDG_TO_INTERNAL_SCALE;
            uint256 reservedProfit =
                profit6 > liquidation.releasedReserve ? liquidation.releasedReserve : profit6;
            liquidityVault.payTraderProfit(
                address(marginAccount), liquidation.releasedReserve, reservedProfit
            );
            if (profit6 > reservedProfit) {
                liquidityVault.payTraderCredit(address(marginAccount), profit6 - reservedProfit);
            }
            if (profit6 != 0) marginAccount.creditMargin(account, marketId, profit6);
        } else {
            if (liquidation.releasedReserve != 0) {
                liquidityVault.releaseLiability(liquidation.releasedReserve);
            }
            if (liquidation.settlement < 0) {
                // Negative branch guarantees a positive unsigned magnitude.
                // forge-lint: disable-next-line(unsafe-typecast)
                uint256 requestedLoss6 = _toAssetsUp(uint256(-liquidation.settlement));
                uint256 paidLoss6 = marginAccount.seizeAvailableMargin(
                    account, marketId, address(liquidityVault), requestedLoss6
                );
                badDebt6 = requestedLoss6 - paidLoss6;
                if (badDebt6 != 0) liquidityVault.recordBadDebt(badDebt6);
            }
        }

        uint256 closedNotionalUsd18 = closeSize18 * liquidation.markPrice / INTERNAL_SCALE;
        liquidationFeePaid6 =
            _collectLiquidationFee(account, marketId, closedNotionalUsd18, keeper, insuranceFund);

        liquidation.nextOi = liquidation.previousOi - liquidation.releasedOi;
        _updateOpenInterest(
            marketId,
            position.size18,
            liquidation.resultingSize,
            liquidation.previousOi,
            liquidation.nextOi
        );
        _positionOpenInterest[account][marketId] = liquidation.nextOi;
        _reservedLiability[account][marketId] =
            liquidation.previousReserve - liquidation.releasedReserve;
        position.size18 = liquidation.resultingSize;
        position.lastFundingIndex18 = liquidation.fundingIndex;
        position.realizedPnlUsd18 += liquidation.closePnl;
        if (liquidation.resultingSize == 0) position.entryPriceUsd18 = 0;
        marginAccount.setPositionOpen(account, marketId, liquidation.resultingSize != 0);

        emit PositionLiquidated(
            account,
            marketId,
            keeper,
            closeSize18,
            liquidation.markPrice,
            liquidation.settlement,
            liquidationFeePaid6,
            badDebt6
        );
    }

    /// @notice Reduces a profitable opposite-side position without paying its realized profit.
    /// @dev Only the liquidation engine can invoke this final-loss path. The engine binds the
    ///      target side, per-call bound, and outstanding deficit before calling this function.
    function autoDeleveragePosition(address account, bytes32 marketId, uint256 closeSize18)
        external
        nonReentrant
        returns (uint256 foregoneProfit6, int256 previousSize18)
    {
        if (msg.sender != liquidationEngine || liquidationEngine == address(0)) {
            revert Unauthorized();
        }
        PerpsTypes.Position storage position = _positions[account][marketId];
        AdlContext memory adl;
        adl.previousSize18 = position.size18;
        previousSize18 = adl.previousSize18;
        adl.previousSize = _absolute(adl.previousSize18);
        if (closeSize18 == 0 || closeSize18 > adl.previousSize) revert InvalidAmount();

        adl.markPrice = oracle.getPrice(marketId).markPriceUsd18;
        if (adl.markPrice > MAX_SIGNED_VALUE || position.entryPriceUsd18 > MAX_SIGNED_VALUE) {
            revert ValueTooLarge();
        }
        // The explicit bounds above make both price conversions safe.
        // forge-lint: disable-start(unsafe-typecast)
        adl.closePnlUsd18 = adl.previousSize18 > 0
            ? int256(closeSize18)
                * (int256(adl.markPrice) - int256(position.entryPriceUsd18)) / INTERNAL_SCALE_INT
            : int256(closeSize18)
                * (int256(position.entryPriceUsd18) - int256(adl.markPrice)) / INTERNAL_SCALE_INT;
        // forge-lint: disable-end(unsafe-typecast)
        if (adl.closePnlUsd18 <= 0) revert AdlPositionNotProfitable();
        // Positive PnL is proven above.
        // forge-lint: disable-next-line(unsafe-typecast)
        foregoneProfit6 = uint256(adl.closePnlUsd18) / USDG_TO_INTERNAL_SCALE;
        if (foregoneProfit6 == 0) revert AdlPositionNotProfitable();

        adl.fundingIndex = fundingEngine.currentFundingIndex(marketId);
        _settleFunding(
            account,
            marketId,
            adl.previousSize18,
            position.lastFundingIndex18,
            adl.fundingIndex
        );

        adl.previousOi = _positionOpenInterest[account][marketId];
        adl.previousReserve = _reservedLiability[account][marketId];
        adl.releasedOi = adl.previousOi * closeSize18 / adl.previousSize;
        adl.releasedReserve = adl.previousReserve * closeSize18 / adl.previousSize;
        if (adl.releasedReserve != 0) liquidityVault.releaseLiability(adl.releasedReserve);

        // closeSize cannot exceed the already validated absolute position size.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 signedCloseSize = int256(closeSize18);
        adl.resultingSize = adl.previousSize18 > 0
            ? adl.previousSize18 - signedCloseSize
            : adl.previousSize18 + signedCloseSize;
        adl.nextOi = adl.previousOi - adl.releasedOi;
        _updateOpenInterest(
            marketId,
            adl.previousSize18,
            adl.resultingSize,
            adl.previousOi,
            adl.nextOi
        );
        _positionOpenInterest[account][marketId] = adl.nextOi;
        _reservedLiability[account][marketId] = adl.previousReserve - adl.releasedReserve;
        position.size18 = adl.resultingSize;
        position.lastFundingIndex18 = adl.fundingIndex;
        if (adl.resultingSize == 0) position.entryPriceUsd18 = 0;
        marginAccount.setPositionOpen(account, marketId, adl.resultingSize != 0);

        emit PositionAutoDeleveraged(
            account,
            marketId,
            closeSize18,
            adl.markPrice,
            foregoneProfit6,
            adl.resultingSize
        );
    }

    // forge-lint: disable-end(reentrancy-no-eth,reentrancy-events)

    // Called only from the non-reentrant liquidation entry point.
    // forge-lint: disable-start(reentrancy-no-eth,reentrancy-events)
    function _collectLiquidationFee(
        address account,
        bytes32 marketId,
        uint256 closedNotionalUsd18,
        address keeper,
        address insuranceFund
    ) private returns (uint256 paidFee6) {
        uint256 requestedFee6 = _toAssetsUp(_mulDivUp(closedNotionalUsd18, 100, BPS));
        uint256 keeperRequested6 = requestedFee6 * 30 / 100;
        if (keeperRequested6 != 0) {
            paidFee6 =
                marginAccount.seizeAvailableMargin(account, marketId, keeper, keeperRequested6);
        }
        uint256 insuranceRequested6 = requestedFee6 - keeperRequested6;
        if (insuranceRequested6 != 0) {
            paidFee6 += marginAccount.seizeAvailableMargin(
                account, marketId, insuranceFund, insuranceRequested6
            );
        }
    }
    // forge-lint: disable-end(reentrancy-no-eth,reentrancy-events)

    function openInterest(bytes32 marketId)
        external
        view
        override
        returns (uint256 longOpenInterestUsd18, uint256 shortOpenInterestUsd18)
    {
        return (_longOpenInterest[marketId], _shortOpenInterest[marketId]);
    }

    function positionAccounting(address account, bytes32 marketId)
        external
        view
        returns (uint256 openInterestUsd18, uint256 reservedLiability6)
    {
        return (_positionOpenInterest[account][marketId], _reservedLiability[account][marketId]);
    }

    // Called only from the non-reentrant trading entry point.
    // forge-lint: disable-start(reentrancy-no-eth)
    function _settleFunding(
        address account,
        bytes32 marketId,
        int256 size18,
        int256 lastFundingIndex18,
        int256 currentFundingIndex18
    ) private returns (int256 paymentUsd18) {
        if (size18 == 0) return 0;
        paymentUsd18 = size18 * (currentFundingIndex18 - lastFundingIndex18) / INTERNAL_SCALE_INT;
        if (paymentUsd18 > 0) {
            // The positive branch proves a safe unsigned conversion.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 paymentMagnitude = uint256(paymentUsd18);
            uint256 paymentAssets = _toAssetsUp(paymentMagnitude);
            marginAccount.payMargin(account, marketId, address(liquidityVault), paymentAssets);
            emit PerpsFundingSettled(account, marketId, paymentUsd18, paymentAssets);
        } else if (paymentUsd18 < 0) {
            // The negative branch proves a positive unsigned magnitude.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 credit = uint256(-paymentUsd18) / USDG_TO_INTERNAL_SCALE;
            if (credit != 0) {
                liquidityVault.payTraderCredit(address(marginAccount), credit);
                marginAccount.creditMargin(account, marketId, credit);
            }
            emit PerpsFundingSettled(account, marketId, paymentUsd18, credit);
        }
    }

    function _settleRealizedPnl(
        address account,
        bytes32 marketId,
        int256 pnlUsd18,
        uint256 releasedReserve6
    ) private {
        if (pnlUsd18 > 0) {
            // The positive branch proves a safe unsigned conversion.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 profit6 = uint256(pnlUsd18) / USDG_TO_INTERNAL_SCALE;
            liquidityVault.payTraderProfit(address(marginAccount), releasedReserve6, profit6);
            if (profit6 != 0) marginAccount.creditMargin(account, marketId, profit6);
        } else {
            if (releasedReserve6 != 0) liquidityVault.releaseLiability(releasedReserve6);
            if (pnlUsd18 < 0) {
                // The negative branch proves a positive unsigned magnitude.
                // forge-lint: disable-next-line(unsafe-typecast)
                uint256 lossMagnitude = uint256(-pnlUsd18);
                marginAccount.payMargin(
                    account, marketId, address(liquidityVault), _toAssetsUp(lossMagnitude)
                );
            }
        }
    }
    // forge-lint: disable-end(reentrancy-no-eth)

    function _validateExposure(
        bytes32 marketId,
        int256 resultingSize,
        int256 previousSize,
        uint256 deltaNotionalUsd18,
        uint256 reserveDelta6,
        PerpsTypes.MarketConfig memory config
    ) private view {
        uint256 longOi = _longOpenInterest[marketId];
        uint256 shortOi = _shortOpenInterest[marketId];
        if (resultingSize > previousSize) longOi += deltaNotionalUsd18;
        else shortOi += deltaNotionalUsd18;

        uint256 vaultAssets18 = liquidityVault.managedAssets() * USDG_TO_INTERNAL_SCALE;
        uint256 sideCap = vaultAssets18 * config.openInterestCapBps / BPS;
        if (longOi > sideCap || shortOi > sideCap) revert ExposureLimitExceeded();
        uint256 netExposure = longOi > shortOi ? longOi - shortOi : shortOi - longOi;
        if (netExposure > vaultAssets18 * MAX_NET_EXPOSURE_BPS / BPS) {
            revert ExposureLimitExceeded();
        }
        uint256 projectedReserved = liquidityVault.reservedTraderLiability() + reserveDelta6;
        if (projectedReserved > liquidityVault.managedAssets() * MAX_UTILIZATION_BPS / BPS) {
            revert UtilizationLimitExceeded();
        }
    }

    function _executionPrice(
        bytes32 marketId,
        int256 sizeDelta18,
        int256 previousSize,
        int256 resultingSize,
        uint256 previousPositionOi,
        uint256 markPriceUsd18,
        PerpsTypes.MarketConfig memory config,
        PerpsTypes.SessionState session
    ) private view returns (uint256) {
        uint256 spreadBps = config.baseSpreadBps;
        if (
            session == PerpsTypes.SessionState.Extended
                || session == PerpsTypes.SessionState.Overnight
        ) {
            spreadBps = spreadBps * config.extendedSpreadMultiplierBps / BPS;
        }
        uint256 longOi = _longOpenInterest[marketId];
        uint256 shortOi = _shortOpenInterest[marketId];
        uint256 deltaNotional = _absolute(sizeDelta18) * markPriceUsd18 / INTERNAL_SCALE;
        bool increasing = _absolute(resultingSize) > _absolute(previousSize);
        if (increasing) {
            if (resultingSize > 0) longOi += deltaNotional;
            else shortOi += deltaNotional;
        } else {
            uint256 releasedOi =
                previousPositionOi * _absolute(sizeDelta18) / _absolute(previousSize);
            if (previousSize > 0) longOi -= releasedOi;
            else shortOi -= releasedOi;
        }
        uint256 total = longOi + shortOi;
        if (total != 0) {
            uint256 imbalance = longOi > shortOi ? longOi - shortOi : shortOi - longOi;
            spreadBps += config.baseSpreadBps * imbalance / total;
        }
        if (spreadBps >= BPS) revert InvalidPositionChange();
        return sizeDelta18 > 0
            ? markPriceUsd18 * (BPS + spreadBps) / BPS
            : markPriceUsd18 * (BPS - spreadBps) / BPS;
    }

    function _updateOpenInterest(
        bytes32 marketId,
        int256 previousSize,
        int256 resultingSize,
        uint256 previousOi,
        uint256 nextOi
    ) private {
        if (previousSize > 0) _longOpenInterest[marketId] -= previousOi;
        else if (previousSize < 0) _shortOpenInterest[marketId] -= previousOi;
        if (resultingSize > 0) _longOpenInterest[marketId] += nextOi;
        else if (resultingSize < 0) _shortOpenInterest[marketId] += nextOi;
    }

    function _requireHealthy(
        address account,
        bytes32 marketId,
        PerpsTypes.SessionState session,
        PerpsTypes.MarketConfig memory config,
        bool increasing
    ) private view {
        PerpsTypes.AccountHealth memory health = marginAccount.marginMode(account, marketId)
            == PerpsTypes.MarginMode.Cross
            ? riskEngine.crossHealth(account)
            : riskEngine.isolatedHealth(account, marketId);
        if (health.equityUsd18 < 0) revert UnsafeAccount();
        // Safe because the negative branch reverted above.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 requiredInitialMargin = health.initialMarginUsd18;
        if (
            increasing
                && (session == PerpsTypes.SessionState.Extended
                    || session == PerpsTypes.SessionState.Overnight)
        ) {
            requiredInitialMargin = _mulDivUp(
                requiredInitialMargin, config.extendedLeverageDivisorBps, BPS
            );
        }
        // Safe because the negative-equity branch reverted above.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 positiveEquity = uint256(health.equityUsd18);
        if (positiveEquity < requiredInitialMargin) revert UnsafeAccount();
    }

    function _validatePositionChange(int256 previous, int256 delta, int256 resulting) private pure {
        if (previous == 0) return;
        if (resulting != 0 && (previous > 0) != (resulting > 0)) revert PositionFlipNotAllowed();
        if ((previous > 0 && delta > 0) || (previous < 0 && delta < 0)) return;
        if (_absolute(delta) > _absolute(previous)) revert PositionFlipNotAllowed();
    }

    function _validateSlippage(int256 delta, uint256 execution, uint256 acceptable) private pure {
        if (acceptable == 0) revert InvalidAmount();
        if ((delta > 0 && execution > acceptable) || (delta < 0 && execution < acceptable)) {
            revert SlippageExceeded(execution, acceptable);
        }
    }

    function _weightedEntryPrice(
        int256 previousSize,
        uint256 previousEntry,
        int256 delta,
        uint256 execution
    ) private pure returns (uint256) {
        uint256 previousAbsolute = _absolute(previousSize);
        uint256 deltaAbsolute = _absolute(delta);
        if (previousAbsolute == 0) return execution;
        return (previousAbsolute * previousEntry + deltaAbsolute * execution)
            / (previousAbsolute + deltaAbsolute);
    }

    function _absolute(int256 value) private pure returns (uint256) {
        if (value == type(int256).min) revert ValueTooLarge();
        // The int256 minimum was rejected, so the magnitude is representable.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(value < 0 ? -value : value);
    }

    function _toAssetsUp(uint256 valueUsd18) private pure returns (uint256) {
        if (valueUsd18 == 0) return 0;
        return (valueUsd18 + USDG_TO_INTERNAL_SCALE - 1) / USDG_TO_INTERNAL_SCALE;
    }

    function _mulDivUp(uint256 value, uint256 numerator, uint256 denominator)
        private
        pure
        returns (uint256)
    {
        if (value == 0 || numerator == 0) return 0;
        return (value * numerator + denominator - 1) / denominator;
    }
}
