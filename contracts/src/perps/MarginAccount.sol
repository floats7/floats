// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IMarginAccount } from "./interfaces/IMarginAccount.sol";
import { IPerpsMarketRegistry } from "./interfaces/IPerpsMarketRegistry.sol";
import { IRiskEngine } from "./interfaces/IRiskEngine.sol";
import { PerpsTypes } from "./PerpsTypes.sol";

contract MarginAccount is IMarginAccount {
    using SafeERC20 for IERC20;

    error ActivePosition(bytes32 marketId);
    error CrossNotSupported(bytes32 marketId);
    error InsufficientCollateral();
    error InvalidAddress();
    error InvalidAmount();
    error MarketNotFound(bytes32 marketId);
    error RiskEngineNotConfigured();
    error RiskEngineAlreadyConfigured();
    error UnsafeAccount();
    error Unauthorized();

    event Deposited(address indexed account, uint256 assets);
    event Withdrawn(address indexed account, address indexed receiver, uint256 assets);
    event CrossCollateralAdded(address indexed account, uint256 assets);
    event CrossCollateralRemoved(address indexed account, uint256 assets);
    event IsolatedMarginAdded(address indexed account, bytes32 indexed marketId, uint256 assets);
    event IsolatedMarginRemoved(address indexed account, bytes32 indexed marketId, uint256 assets);
    event MarginModeChanged(
        address indexed account,
        bytes32 indexed marketId,
        PerpsTypes.MarginMode previousMode,
        PerpsTypes.MarginMode newMode
    );
    event PositionStatusChanged(
        address indexed account, bytes32 indexed marketId, bool positionOpen
    );
    event OperatorSet(address indexed operator, bool allowed);
    event RiskEngineSet(address indexed riskEngine);
    event MarginPaid(
        address indexed account, bytes32 indexed marketId, address indexed receiver, uint256 assets
    );
    event MarginCredited(address indexed account, bytes32 indexed marketId, uint256 assets);
    event MarginSeized(
        address indexed account,
        bytes32 indexed marketId,
        address indexed receiver,
        uint256 requestedAssets,
        uint256 paidAssets
    );

    IERC20 public immutable collateralToken;
    IPerpsMarketRegistry public immutable registry;
    address public immutable admin;

    IRiskEngine public riskEngine;
    uint256 public totalAccountedCollateral;

    mapping(address account => uint256 assets) public override freeCollateral;
    mapping(address account => uint256 assets) public override crossCollateral;
    mapping(address account => mapping(bytes32 marketId => uint256 assets))
        public
        override isolatedMargin;
    mapping(address account => mapping(bytes32 marketId => PerpsTypes.MarginMode mode)) private
        _marginMode;
    mapping(address account => mapping(bytes32 marketId => bool open)) public hasOpenPosition;
    mapping(address account => bytes32[] marketIds) private _activeMarkets;
    mapping(address account => mapping(bytes32 marketId => uint256 indexPlusOne)) private
        _activeMarketIndex;
    mapping(address operator => bool allowed) public isOperator;

    constructor(address collateralToken_, address registry_, address admin_) {
        if (collateralToken_ == address(0) || registry_ == address(0) || admin_ == address(0)) {
            revert InvalidAddress();
        }
        collateralToken = IERC20(collateralToken_);
        registry = IPerpsMarketRegistry(registry_);
        admin = admin_;
    }

    function deposit(uint256 assets) external {
        _requireAmount(assets);
        freeCollateral[msg.sender] += assets;
        totalAccountedCollateral += assets;
        collateralToken.safeTransferFrom(msg.sender, address(this), assets);
        emit Deposited(msg.sender, assets);
    }

    function withdraw(uint256 assets, address receiver) external {
        _requireAmount(assets);
        if (receiver == address(0)) revert InvalidAddress();
        _debitFree(msg.sender, assets);
        totalAccountedCollateral -= assets;
        collateralToken.safeTransfer(receiver, assets);
        emit Withdrawn(msg.sender, receiver, assets);
    }

    function addCrossCollateral(uint256 assets) external {
        _requireAmount(assets);
        _debitFree(msg.sender, assets);
        crossCollateral[msg.sender] += assets;
        emit CrossCollateralAdded(msg.sender, assets);
    }

    function removeCrossCollateral(uint256 assets) external {
        _requireAmount(assets);
        uint256 current = crossCollateral[msg.sender];
        if (current < assets) revert InsufficientCollateral();

        crossCollateral[msg.sender] = current - assets;
        freeCollateral[msg.sender] += assets;
        _requireCrossHealth(msg.sender);
        emit CrossCollateralRemoved(msg.sender, assets);
    }

    function addIsolatedMargin(bytes32 marketId, uint256 assets) external {
        _requireAmount(assets);
        _requireMarket(marketId);
        if (marginMode(msg.sender, marketId) != PerpsTypes.MarginMode.Isolated) {
            revert CrossNotSupported(marketId);
        }
        _debitFree(msg.sender, assets);
        isolatedMargin[msg.sender][marketId] += assets;
        emit IsolatedMarginAdded(msg.sender, marketId, assets);
    }

    function removeIsolatedMargin(bytes32 marketId, uint256 assets) external {
        _requireAmount(assets);
        _requireMarket(marketId);
        uint256 current = isolatedMargin[msg.sender][marketId];
        if (current < assets) revert InsufficientCollateral();

        isolatedMargin[msg.sender][marketId] = current - assets;
        freeCollateral[msg.sender] += assets;
        _requireIsolatedHealth(msg.sender, marketId);
        emit IsolatedMarginRemoved(msg.sender, marketId, assets);
    }

    function setMarginMode(bytes32 marketId, PerpsTypes.MarginMode mode) external {
        (PerpsTypes.MarketConfig memory config,,) = _getMarket(marketId);
        if (hasOpenPosition[msg.sender][marketId]) revert ActivePosition(marketId);
        if (mode == PerpsTypes.MarginMode.Cross && config.isolatedOnly) {
            revert CrossNotSupported(marketId);
        }

        PerpsTypes.MarginMode previous = _marginMode[msg.sender][marketId];
        if (previous == mode) return;
        _marginMode[msg.sender][marketId] = mode;
        emit MarginModeChanged(msg.sender, marketId, previous, mode);
    }

    function marginMode(address account, bytes32 marketId)
        public
        view
        override
        returns (PerpsTypes.MarginMode)
    {
        return _marginMode[account][marketId];
    }

    function setPositionOpen(address account, bytes32 marketId, bool open) external {
        if (!isOperator[msg.sender]) revert Unauthorized();
        if (account == address(0)) revert InvalidAddress();
        _requireMarket(marketId);
        bool previous = hasOpenPosition[account][marketId];
        if (previous == open) return;
        hasOpenPosition[account][marketId] = open;
        if (open) {
            _activeMarkets[account].push(marketId);
            _activeMarketIndex[account][marketId] = _activeMarkets[account].length;
        } else {
            _removeActiveMarket(account, marketId);
        }
        emit PositionStatusChanged(account, marketId, open);
    }

    function activeMarkets(address account)
        external
        view
        override
        returns (bytes32[] memory marketIds)
    {
        return _activeMarkets[account];
    }

    function payMargin(address account, bytes32 marketId, address receiver, uint256 assets)
        external
    {
        if (!isOperator[msg.sender]) revert Unauthorized();
        if (receiver == address(0)) revert InvalidAddress();
        _requireAmount(assets);
        _debitMarginBucket(account, marketId, assets);
        totalAccountedCollateral -= assets;
        collateralToken.safeTransfer(receiver, assets);
        emit MarginPaid(account, marketId, receiver, assets);
    }

    function seizeAvailableMargin(
        address account,
        bytes32 marketId,
        address receiver,
        uint256 requestedAssets
    ) external returns (uint256 paidAssets) {
        if (!isOperator[msg.sender]) revert Unauthorized();
        if (receiver == address(0)) revert InvalidAddress();
        _requireAmount(requestedAssets);
        if (marginMode(account, marketId) == PerpsTypes.MarginMode.Cross) {
            paidAssets = requestedAssets > crossCollateral[account]
                ? crossCollateral[account]
                : requestedAssets;
            crossCollateral[account] -= paidAssets;
        } else {
            paidAssets = requestedAssets > isolatedMargin[account][marketId]
                ? isolatedMargin[account][marketId]
                : requestedAssets;
            isolatedMargin[account][marketId] -= paidAssets;
        }
        totalAccountedCollateral -= paidAssets;
        collateralToken.safeTransfer(receiver, paidAssets);
        emit MarginSeized(account, marketId, receiver, requestedAssets, paidAssets);
    }

    function creditMargin(address account, bytes32 marketId, uint256 assets) external {
        if (!isOperator[msg.sender]) revert Unauthorized();
        _requireAmount(assets);
        if (collateralToken.balanceOf(address(this)) < totalAccountedCollateral + assets) {
            revert InsufficientCollateral();
        }
        if (marginMode(account, marketId) == PerpsTypes.MarginMode.Cross) {
            crossCollateral[account] += assets;
        } else {
            isolatedMargin[account][marketId] += assets;
        }
        totalAccountedCollateral += assets;
        emit MarginCredited(account, marketId, assets);
    }

    function setOperator(address operator, bool allowed) external {
        _requireAdmin();
        if (operator == address(0)) revert InvalidAddress();
        // The adjacent OperatorSet event provides the access-control audit trail.
        // forge-lint: disable-next-line(missing-events-access-control)
        isOperator[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setRiskEngine(address riskEngine_) external {
        _requireAdmin();
        if (riskEngine_ == address(0)) revert InvalidAddress();
        if (address(riskEngine) != address(0)) revert RiskEngineAlreadyConfigured();
        riskEngine = IRiskEngine(riskEngine_);
        emit RiskEngineSet(riskEngine_);
    }

    function totalAccountCollateral(address account, bytes32[] calldata isolatedMarkets)
        external
        view
        returns (uint256 total)
    {
        total = freeCollateral[account] + crossCollateral[account];
        for (uint256 i; i < isolatedMarkets.length; ++i) {
            total += isolatedMargin[account][isolatedMarkets[i]];
        }
    }

    function _requireCrossHealth(address account) private view {
        if (address(riskEngine) == address(0)) revert RiskEngineNotConfigured();
        PerpsTypes.AccountHealth memory health = riskEngine.crossHealth(account);
        if (health.equityUsd18 < 0) revert UnsafeAccount();
        // Safe because the negative-equity branch reverted above.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (uint256(health.equityUsd18) < health.initialMarginUsd18) revert UnsafeAccount();
    }

    function _requireIsolatedHealth(address account, bytes32 marketId) private view {
        if (!hasOpenPosition[account][marketId]) return;
        if (address(riskEngine) == address(0)) revert RiskEngineNotConfigured();
        PerpsTypes.AccountHealth memory health = riskEngine.isolatedHealth(account, marketId);
        if (health.equityUsd18 < 0) revert UnsafeAccount();
        // Safe because the negative-equity branch reverted above.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (uint256(health.equityUsd18) < health.initialMarginUsd18) revert UnsafeAccount();
    }

    function _debitFree(address account, uint256 assets) private {
        uint256 current = freeCollateral[account];
        if (current < assets) revert InsufficientCollateral();
        freeCollateral[account] = current - assets;
    }

    function _debitMarginBucket(address account, bytes32 marketId, uint256 assets) private {
        if (marginMode(account, marketId) == PerpsTypes.MarginMode.Cross) {
            uint256 current = crossCollateral[account];
            if (current < assets) revert InsufficientCollateral();
            crossCollateral[account] = current - assets;
        } else {
            uint256 current = isolatedMargin[account][marketId];
            if (current < assets) revert InsufficientCollateral();
            isolatedMargin[account][marketId] = current - assets;
        }
    }

    function _removeActiveMarket(address account, bytes32 marketId) private {
        uint256 indexPlusOne = _activeMarketIndex[account][marketId];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeMarkets[account].length - 1;
        if (index != lastIndex) {
            bytes32 moved = _activeMarkets[account][lastIndex];
            _activeMarkets[account][index] = moved;
            _activeMarketIndex[account][moved] = index + 1;
        }
        _activeMarkets[account].pop();
        delete _activeMarketIndex[account][marketId];
    }

    function _getMarket(bytes32 marketId)
        private
        view
        returns (
            PerpsTypes.MarketConfig memory config,
            PerpsTypes.MarketState state,
            PerpsTypes.SessionState session
        )
    {
        if (!registry.marketExists(marketId)) {
            revert MarketNotFound(marketId);
        }
        return registry.getMarket(marketId);
    }

    function _requireMarket(bytes32 marketId) private view {
        if (!registry.marketExists(marketId)) revert MarketNotFound(marketId);
    }

    function _requireAmount(uint256 assets) private pure {
        if (assets == 0) revert InvalidAmount();
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }
}
