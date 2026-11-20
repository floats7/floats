// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { InsuranceFund } from "./InsuranceFund.sol";
import { MarginAccount } from "./MarginAccount.sol";
import { PerpsLiquidityVault } from "./PerpsLiquidityVault.sol";
import { PerpsMarket } from "./PerpsMarket.sol";
import { RiskEngine } from "./RiskEngine.sol";
import { PerpsTypes } from "./PerpsTypes.sol";

contract LiquidationEngine is ReentrancyGuard {
    error AccountNotLiquidatable();
    error AdlCloseExceedsLimit();
    error AdlDeficitUnavailable();
    error AdlTargetSideMismatch();
    error InvalidAddress();
    error InvalidMarginMode();
    error PositionNotFound();
    error PostLiquidationBufferNotMet();
    error Unauthorized();

    uint256 private constant BPS = 10_000;
    uint256 private constant POST_LIQUIDATION_BUFFER_BPS = 200;
    uint256 public constant MAX_ADL_CLOSE_BPS = 2500;

    event KeeperSet(address indexed keeper, bool allowed);
    event IsolatedLiquidationExecuted(
        address indexed account,
        bytes32 indexed marketId,
        address indexed keeper,
        uint256 closedSize18,
        uint256 badDebt6,
        uint256 insuranceCovered6,
        uint256 liquidationFeePaid6,
        bool fullLiquidation
    );
    event CrossLiquidationExecuted(
        address indexed account,
        bytes32 indexed marketId,
        address indexed keeper,
        uint256 closedSize18,
        uint256 badDebt6,
        uint256 insuranceCovered6,
        uint256 liquidationFeePaid6,
        bool fullLiquidation
    );
    event AdlDeficitQueued(
        bytes32 indexed marketId,
        bool indexed targetLong,
        uint256 deficit6,
        uint256 totalPendingDeficit6
    );
    event AdlExecuted(
        bytes32 indexed marketId,
        address indexed account,
        address indexed keeper,
        bool targetLong,
        uint256 closedSize18,
        uint256 coveredDeficit6,
        uint256 remainingDeficit6
    );

    address public immutable admin;
    PerpsMarket public immutable market;
    MarginAccount public immutable marginAccount;
    RiskEngine public immutable riskEngine;
    InsuranceFund public immutable insuranceFund;
    PerpsLiquidityVault public immutable liquidityVault;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(bytes32 marketId => uint256 assets6) public pendingLongAdlDeficit6;
    mapping(bytes32 marketId => uint256 assets6) public pendingShortAdlDeficit6;

    constructor(
        address admin_,
        address market_,
        address marginAccount_,
        address riskEngine_,
        address insuranceFund_,
        address liquidityVault_
    ) {
        if (
            admin_ == address(0) || market_ == address(0) || marginAccount_ == address(0)
                || riskEngine_ == address(0) || insuranceFund_ == address(0)
                || liquidityVault_ == address(0)
        ) revert InvalidAddress();
        admin = admin_;
        market = PerpsMarket(market_);
        marginAccount = MarginAccount(marginAccount_);
        riskEngine = RiskEngine(riskEngine_);
        insuranceFund = InsuranceFund(insuranceFund_);
        liquidityVault = PerpsLiquidityVault(liquidityVault_);
    }

    function liquidateIsolated(address account, bytes32 marketId)
        external
        nonReentrant
        returns (uint256 closedSize18, uint256 badDebt6)
    {
        if (!isKeeper[msg.sender]) revert Unauthorized();
        if (marginAccount.marginMode(account, marketId) != PerpsTypes.MarginMode.Isolated) {
            revert InvalidMarginMode();
        }
        PerpsTypes.AccountHealth memory health = riskEngine.isolatedHealth(account, marketId);
        if (!health.liquidatable) revert AccountNotLiquidatable();
        PerpsTypes.Position memory position = market.getPosition(account, marketId);
        uint256 size = _absolute(position.size18);
        if (size == 0) revert PositionNotFound();

        bool fullLiquidation = health.equityUsd18 <= 0;
        if (!fullLiquidation) {
            // The branch proves positive equity before unsigned conversion.
            // forge-lint: disable-next-line(unsafe-typecast)
            fullLiquidation = uint256(health.equityUsd18) * 2 < health.maintenanceMarginUsd18;
        }
        closedSize18 = fullLiquidation ? size : (size + 1) / 2;
        uint256 feePaid6;
        (badDebt6, feePaid6) = market.liquidatePosition(
            account, marketId, closedSize18, msg.sender, address(insuranceFund)
        );

        if (!fullLiquidation) _requireIsolatedBuffer(account, marketId);

        uint256 insuranceCovered6 = _coverBadDebt(badDebt6);
        _queueAdlDeficit(marketId, position.size18, badDebt6 - insuranceCovered6);

        // All external calls are to fixed protocol modules and this engine stores no account state.
        // forge-lint: disable-next-line(reentrancy-events)
        emit IsolatedLiquidationExecuted(
            account,
            marketId,
            msg.sender,
            closedSize18,
            badDebt6,
            insuranceCovered6,
            feePaid6,
            fullLiquidation
        );
    }

    function liquidateCross(address account)
        external
        nonReentrant
        returns (bytes32 marketId, uint256 closedSize18, uint256 badDebt6)
    {
        if (!isKeeper[msg.sender]) revert Unauthorized();
        PerpsTypes.AccountHealth memory health = riskEngine.crossHealth(account);
        if (!health.liquidatable) revert AccountNotLiquidatable();

        bytes32[] memory marketIds = marginAccount.activeMarkets(account);
        uint256 highestMaintenanceMargin = 0;
        for (uint256 i; i < marketIds.length; ++i) {
            bytes32 candidate = marketIds[i];
            // The bounded active-market loop must inspect each canonical margin mode.
            // forge-lint: disable-next-line(calls-loop)
            if (marginAccount.marginMode(account, candidate) != PerpsTypes.MarginMode.Cross) {
                continue;
            }
            // The highest maintenance requirement is the deterministic highest-risk position.
            // forge-lint: disable-next-line(calls-loop,unused-return)
            (,,,, uint256 maintenanceMargin) = riskEngine.positionMetrics(account, candidate);
            if (maintenanceMargin > highestMaintenanceMargin) {
                highestMaintenanceMargin = maintenanceMargin;
                marketId = candidate;
            }
        }
        if (marketId == bytes32(0)) revert PositionNotFound();

        PerpsTypes.Position memory position = market.getPosition(account, marketId);
        uint256 size = _absolute(position.size18);
        if (size == 0) revert PositionNotFound();
        bool fullLiquidation = health.equityUsd18 <= 0;
        if (!fullLiquidation) {
            // The branch proves positive equity before unsigned conversion.
            // forge-lint: disable-next-line(unsafe-typecast)
            fullLiquidation = uint256(health.equityUsd18) * 2 < health.maintenanceMarginUsd18;
        }
        closedSize18 = fullLiquidation ? size : (size + 1) / 2;

        uint256 feePaid6;
        (badDebt6, feePaid6) = market.liquidatePosition(
            account, marketId, closedSize18, msg.sender, address(insuranceFund)
        );
        if (!fullLiquidation) _requireCrossBuffer(account);
        uint256 insuranceCovered6 = _coverBadDebt(badDebt6);
        _queueAdlDeficit(marketId, position.size18, badDebt6 - insuranceCovered6);

        // All external calls are to fixed protocol modules and this engine stores no account state.
        // forge-lint: disable-next-line(reentrancy-events)
        emit CrossLiquidationExecuted(
            account,
            marketId,
            msg.sender,
            closedSize18,
            badDebt6,
            insuranceCovered6,
            feePaid6,
            fullLiquidation
        );
    }

    function setKeeper(address keeper, bool allowed) external {
        if (msg.sender != admin) revert Unauthorized();
        if (keeper == address(0)) revert InvalidAddress();
        // The adjacent KeeperSet event provides the access-control audit trail.
        // forge-lint: disable-next-line(missing-events-access-control)
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function executeAdl(address account, bytes32 marketId, uint256 closeSize18)
        external
        nonReentrant
        returns (uint256 coveredDeficit6)
    {
        if (!isKeeper[msg.sender]) revert Unauthorized();
        PerpsTypes.Position memory target = market.getPosition(account, marketId);
        uint256 targetSize = _absolute(target.size18);
        if (targetSize == 0) revert PositionNotFound();
        if (
            closeSize18 == 0
                || closeSize18 > targetSize * MAX_ADL_CLOSE_BPS / BPS
        ) revert AdlCloseExceedsLimit();

        bool targetLong = target.size18 > 0;
        uint256 pending = targetLong
            ? pendingLongAdlDeficit6[marketId]
            : pendingShortAdlDeficit6[marketId];
        if (pending == 0) revert AdlDeficitUnavailable();

        int256 previousSize;
        // This entry point is non-reentrant; the fixed market call and all later state changes
        // revert atomically if any validation or accounting update fails.
        // forge-lint: disable-start(reentrancy-no-eth)
        (coveredDeficit6, previousSize) =
            market.autoDeleveragePosition(account, marketId, closeSize18);
        // forge-lint: disable-end(reentrancy-no-eth)
        if ((previousSize > 0) != targetLong) revert AdlTargetSideMismatch();
        if (coveredDeficit6 > pending) revert AdlCloseExceedsLimit();

        uint256 remaining = pending - coveredDeficit6;
        if (targetLong) pendingLongAdlDeficit6[marketId] = remaining;
        else pendingShortAdlDeficit6[marketId] = remaining;
        liquidityVault.coverBadDebt(coveredDeficit6);
        emit AdlExecuted(
            marketId,
            account,
            msg.sender,
            targetLong,
            closeSize18,
            coveredDeficit6,
            remaining
        );
    }

    function _absolute(int256 value) private pure returns (uint256) {
        if (value == type(int256).min) revert PositionNotFound();
        // int256 minimum was rejected, so the absolute magnitude is representable.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(value < 0 ? -value : value);
    }

    function _coverBadDebt(uint256 badDebt6) private returns (uint256 insuranceCovered6) {
        if (badDebt6 == 0) return 0;
        uint256 available = insuranceFund.collateralToken().balanceOf(address(insuranceFund));
        insuranceCovered6 = available > badDebt6 ? badDebt6 : available;
        if (insuranceCovered6 == 0) return 0;
        insuranceFund.coverBadDebt(address(liquidityVault), insuranceCovered6);
        liquidityVault.coverBadDebt(insuranceCovered6);
    }

    function _queueAdlDeficit(bytes32 marketId, int256 bankruptSize18, uint256 deficit6) private {
        if (deficit6 == 0) return;
        bool targetLong = bankruptSize18 < 0;
        uint256 total;
        if (targetLong) {
            total = pendingLongAdlDeficit6[marketId] + deficit6;
            pendingLongAdlDeficit6[marketId] = total;
        } else {
            total = pendingShortAdlDeficit6[marketId] + deficit6;
            pendingShortAdlDeficit6[marketId] = total;
        }
        emit AdlDeficitQueued(marketId, targetLong, deficit6, total);
    }

    function _requireIsolatedBuffer(address account, bytes32 marketId) private view {
        PerpsTypes.AccountHealth memory health = riskEngine.isolatedHealth(account, marketId);
        _requireBuffer(health);
    }

    function _requireCrossBuffer(address account) private view {
        PerpsTypes.AccountHealth memory health = riskEngine.crossHealth(account);
        _requireBuffer(health);
    }

    function _requireBuffer(PerpsTypes.AccountHealth memory health) private pure {
        if (
            health.equityUsd18 <= 0
                // The preceding branch rejects non-positive values before conversion.
                // forge-lint: disable-next-line(unsafe-typecast)
                || uint256(health.equityUsd18) * BPS
                    < health.maintenanceMarginUsd18 * (BPS + POST_LIQUIDATION_BUFFER_BPS)
        ) revert PostLiquidationBufferNotMet();
    }
}
