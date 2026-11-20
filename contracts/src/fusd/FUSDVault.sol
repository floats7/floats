// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IFUSDStrategy } from "./interfaces/IFUSDStrategy.sol";

/// @title Floats Dollar Vault
/// @notice Mainnet USDG vault that keeps a liquid buffer and invests excess assets in a strategy.
contract FUSDVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2000;
    /// @notice A fully liquid buffer is valid for guarded launches and strategy incidents.
    uint256 public constant MAX_BUFFER_BPS = BPS;

    error DepositsPaused();
    error InvalidAddress();
    error InvalidBasisPoints();
    error InvalidCap();
    error InvalidStrategyAsset(address expected, address actual);
    error StrategyInactive();
    error InvalidWithdrawalState();
    error InsolventBuffer(uint256 balance, uint256 liability);
    error StrategyAlreadyConfigured();
    error Unauthorized();
    error UnsupportedAssetDecimals(uint8 decimals);

    event BufferTargetSet(uint256 previousBps, uint256 newBps);
    event DepositsPauseSet(bool paused, address indexed caller);
    event PerformanceFeeAccrued(uint256 feeAssets, uint256 feeShares, uint256 highWatermark18);
    event StrategyConfigured(address indexed strategy);
    event StrategyEmergencyExited(address indexed caller, uint256 assetsRecovered);
    event StrategyStatusSet(bool active, address indexed caller);
    event StrategyInvested(uint256 assets, uint256 shares);
    event StrategyWithdrawn(uint256 assets, uint256 shares);
    event TvlCapSet(uint256 previousCap, uint256 newCap);
    event WithdrawalCancelled(uint256 indexed requestId);
    event WithdrawalClaimed(uint256 indexed requestId, address indexed receiver, uint256 assets);
    event WithdrawalProcessed(uint256 indexed requestId, uint256 shares, uint256 assets);
    event WithdrawalRequested(
        uint256 indexed requestId, address indexed owner, address indexed receiver, uint256 shares
    );

    enum WithdrawalState {
        None,
        Requested,
        Processed,
        Claimed,
        Cancelled
    }

    struct WithdrawalRequest {
        address owner;
        address receiver;
        uint256 shares;
        uint256 assets;
        WithdrawalState state;
    }

    address public immutable governance;
    address public immutable guardian;
    address public immutable feeRecipient;
    uint256 public immutable assetScaleTo18;

    IFUSDStrategy public strategy;
    uint256 public tvlCap;
    uint256 public targetBufferBps;
    uint256 public performanceFeeBps;
    uint256 public highWatermark18 = 1e18;
    uint256 public queuedWithdrawalAssets;
    uint256 public nextWithdrawalRequestId = 1;
    bool public depositsPaused = true;
    bool public strategyActive;

    mapping(uint256 requestId => WithdrawalRequest request) public withdrawalRequests;

    constructor(
        IERC20Metadata usdg,
        address governance_,
        address guardian_,
        address feeRecipient_,
        uint256 initialTvlCap,
        uint256 targetBufferBps_,
        uint256 performanceFeeBps_
    ) ERC20("Floats Dollar", "fUSD") ERC4626(usdg) {
        if (governance_ == address(0) || guardian_ == address(0) || feeRecipient_ == address(0)) {
            revert InvalidAddress();
        }
        if (initialTvlCap == 0) revert InvalidCap();
        if (targetBufferBps_ > MAX_BUFFER_BPS || performanceFeeBps_ > MAX_PERFORMANCE_FEE_BPS) {
            revert InvalidBasisPoints();
        }
        uint8 assetDecimals = usdg.decimals();
        if (assetDecimals > 18) revert UnsupportedAssetDecimals(assetDecimals);
        governance = governance_;
        guardian = guardian_;
        feeRecipient = feeRecipient_;
        tvlCap = initialTvlCap;
        targetBufferBps = targetBufferBps_;
        performanceFeeBps = performanceFeeBps_;
        assetScaleTo18 = 10 ** (18 - assetDecimals);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }

    function totalAssets() public view override returns (uint256) {
        uint256 managedAssets = IERC20(asset()).balanceOf(address(this));
        IFUSDStrategy activeStrategy = strategy;
        uint256 grossAssets = address(activeStrategy) == address(0)
            ? managedAssets
            : managedAssets + activeStrategy.totalAssets();
        if (grossAssets < queuedWithdrawalAssets) {
            revert InsolventBuffer(grossAssets, queuedWithdrawalAssets);
        }
        return grossAssets - queuedWithdrawalAssets;
    }

    function pricePerShare18() public view returns (uint256) {
        if (totalSupply() == 0) return 1e18;
        uint256 shareUnit = 10 ** decimals();
        return convertToAssets(shareUnit) * assetScaleTo18;
    }

    /// @notice The final holder receives every remaining asset, including
    /// strategy rounding dust, so a zero-supply vault can restart at par.
    function previewRedeem(uint256 shares) public view override returns (uint256) {
        uint256 supply = totalSupply();
        if (shares != 0 && shares == supply) return totalAssets();
        return super.previewRedeem(shares);
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (depositsPaused || !strategyActive || address(strategy) == address(0)) return 0;
        uint256 assets = totalAssets();
        return assets >= tvlCap ? 0 : tvlCap - assets;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        accruePerformanceFee();
        shares = super.deposit(assets, receiver);
        _rebalance();
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        accruePerformanceFee();
        assets = super.mint(shares, receiver);
        _rebalance();
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        accruePerformanceFee();
        _ensureLiquidity(assets);
        shares = super.withdraw(assets, receiver, owner);
        _rebalance();
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        accruePerformanceFee();
        assets = previewRedeem(shares);
        _ensureLiquidity(assets);
        assets = super.redeem(shares, receiver, owner);
        if (totalSupply() == 0) {
            IFUSDStrategy activeStrategy = strategy;
            if (address(activeStrategy) != address(0)) {
                assets += activeStrategy.redeemAll(receiver);
            }
        } else {
            _rebalance();
        }
    }

    function configureStrategy(IFUSDStrategy strategy_) external {
        _requireGovernance();
        if (address(strategy) != address(0)) revert StrategyAlreadyConfigured();
        if (address(strategy_) == address(0)) revert InvalidAddress();
        address strategyAsset = strategy_.asset();
        if (strategyAsset != asset()) revert InvalidStrategyAsset(asset(), strategyAsset);
        strategy = strategy_;
        strategyActive = true;
        IERC20(asset()).forceApprove(address(strategy_), type(uint256).max);
        emit StrategyConfigured(address(strategy_));
        emit StrategyStatusSet(true, msg.sender);
    }

    function setDepositsPaused(bool paused) external {
        if (paused) {
            if (msg.sender != governance && msg.sender != guardian) revert Unauthorized();
        } else {
            _requireGovernance();
            if (address(strategy) == address(0)) revert InvalidAddress();
            if (!strategyActive) revert StrategyInactive();
        }
        depositsPaused = paused;
        emit DepositsPauseSet(paused, msg.sender);
    }

    function setTvlCap(uint256 newCap) external {
        _requireGovernance();
        if (newCap == 0) revert InvalidCap();
        uint256 previousCap = tvlCap;
        tvlCap = newCap;
        emit TvlCapSet(previousCap, newCap);
    }

    function setTargetBufferBps(uint256 newBps) external nonReentrant {
        _requireGovernance();
        if (newBps > MAX_BUFFER_BPS) revert InvalidBasisPoints();
        uint256 previousBps = targetBufferBps;
        targetBufferBps = newBps;
        emit BufferTargetSet(previousBps, newBps);
        _rebalance();
    }

    function rebalance() external nonReentrant {
        accruePerformanceFee();
        _rebalance();
    }

    /// @notice Stops new strategy allocation. Governance can reactivate only after review.
    function setStrategyActive(bool active) external {
        if (!active) {
            if (msg.sender != governance && msg.sender != guardian) revert Unauthorized();
        } else {
            _requireGovernance();
            if (address(strategy) == address(0)) revert InvalidAddress();
        }
        strategyActive = active;
        if (!active) depositsPaused = true;
        emit StrategyStatusSet(active, msg.sender);
        if (!active) emit DepositsPauseSet(true, msg.sender);
    }

    /// @notice Pauses deposits, disables reinvestment, and returns all recoverable strategy assets.
    function emergencyExitStrategy() external nonReentrant returns (uint256 assetsRecovered) {
        if (msg.sender != governance && msg.sender != guardian) revert Unauthorized();
        IFUSDStrategy activeStrategy = strategy;
        if (address(activeStrategy) == address(0)) revert InvalidAddress();
        depositsPaused = true;
        strategyActive = false;
        assetsRecovered = activeStrategy.redeemAll(address(this));
        // forge-lint: disable-next-line(reentrancy-events)
        emit DepositsPauseSet(true, msg.sender);
        // forge-lint: disable-next-line(reentrancy-events)
        emit StrategyStatusSet(false, msg.sender);
        // forge-lint: disable-next-line(reentrancy-events)
        emit StrategyEmergencyExited(msg.sender, assetsRecovered);
    }

    function requestWithdrawal(uint256 shares, address receiver)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        if (shares == 0 || shares > balanceOf(msg.sender)) {
            revert InvalidWithdrawalState();
        }
        if (receiver == address(0)) revert InvalidAddress();
        accruePerformanceFee();
        _transfer(msg.sender, address(this), shares);
        requestId = nextWithdrawalRequestId++;
        withdrawalRequests[requestId] = WithdrawalRequest({
            owner: msg.sender,
            receiver: receiver,
            shares: shares,
            assets: 0,
            state: WithdrawalState.Requested
        });
        emit WithdrawalRequested(requestId, msg.sender, receiver, shares);
    }

    function cancelWithdrawal(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Requested || request.owner != msg.sender) {
            revert InvalidWithdrawalState();
        }
        request.state = WithdrawalState.Cancelled;
        _transfer(address(this), request.owner, request.shares);
        emit WithdrawalCancelled(requestId);
    }

    function processWithdrawal(uint256 requestId) external nonReentrant returns (uint256 assets) {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Requested) revert InvalidWithdrawalState();
        accruePerformanceFee();
        assets = previewRedeem(request.shares);
        _ensureLiquidity(assets);
        _burn(address(this), request.shares);
        if (totalSupply() == 0) {
            IFUSDStrategy activeStrategy = strategy;
            if (address(activeStrategy) != address(0)) {
                assets += activeStrategy.redeemAll(address(this));
            }
        }
        request.assets = assets;
        request.state = WithdrawalState.Processed;
        queuedWithdrawalAssets += assets;
        // The function is non-reentrant and the event reflects finalized post-strategy accounting.
        // forge-lint: disable-next-line(reentrancy-events)
        emit WithdrawalProcessed(requestId, request.shares, assets);
    }

    function claimWithdrawal(uint256 requestId) external nonReentrant returns (uint256 assets) {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Processed || msg.sender != request.owner) {
            revert InvalidWithdrawalState();
        }
        assets = request.assets;
        request.state = WithdrawalState.Claimed;
        queuedWithdrawalAssets -= assets;
        IERC20(asset()).safeTransfer(request.receiver, assets);
        emit WithdrawalClaimed(requestId, request.receiver, assets);
        _rebalance();
    }

    function accruePerformanceFee() public returns (uint256 feeShares) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            highWatermark18 = 1e18;
            return 0;
        }
        uint256 currentPrice18 = pricePerShare18();
        if (currentPrice18 <= highWatermark18 || performanceFeeBps == 0) return 0;

        uint256 gainAssets =
            (currentPrice18 - highWatermark18).mulDiv(supply, 10 ** decimals()) / assetScaleTo18;
        uint256 feeAssets = gainAssets.mulDiv(performanceFeeBps, BPS);
        uint256 managedAssets = totalAssets();
        if (feeAssets == 0 || managedAssets <= feeAssets) return 0;

        feeShares = feeAssets.mulDiv(supply, managedAssets - feeAssets, Math.Rounding.Ceil);
        _mint(feeRecipient, feeShares);
        highWatermark18 = pricePerShare18();
        emit PerformanceFeeAccrued(feeAssets, feeShares, highWatermark18);
    }

    function _ensureLiquidity(uint256 assets) internal {
        uint256 liquidAssets = IERC20(asset()).balanceOf(address(this));
        uint256 requiredLiquidAssets = assets + queuedWithdrawalAssets;
        if (liquidAssets >= requiredLiquidAssets) return;
        uint256 shortfall = requiredLiquidAssets - liquidAssets;
        // The strategy is immutable after configuration and accepts calls only from this vault.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        IFUSDStrategy activeStrategy = strategy;
        if (address(activeStrategy) == address(0)) revert InvalidAddress();
        uint256 sharesBurned = activeStrategy.withdraw(shortfall, address(this));
        // forge-lint: disable-next-line(reentrancy-events)
        emit StrategyWithdrawn(shortfall, sharesBurned);
    }

    function _rebalance() internal {
        IFUSDStrategy activeStrategy = strategy;
        if (address(activeStrategy) == address(0) || !strategyActive) return;
        uint256 targetLiquidAssets = totalAssets().mulDiv(targetBufferBps, BPS);
        uint256 liquidAssets = IERC20(asset()).balanceOf(address(this));
        uint256 reservedLiquidAssets = queuedWithdrawalAssets + targetLiquidAssets;
        if (liquidAssets > reservedLiquidAssets) {
            uint256 assetsToInvest = liquidAssets - reservedLiquidAssets;
            uint256 sharesReceived = activeStrategy.deposit(assetsToInvest);
            // forge-lint: disable-next-line(reentrancy-events)
            emit StrategyInvested(assetsToInvest, sharesReceived);
        } else if (liquidAssets < reservedLiquidAssets) {
            uint256 assetsToWithdraw = reservedLiquidAssets - liquidAssets;
            if (assetsToWithdraw > activeStrategy.totalAssets()) {
                assetsToWithdraw = activeStrategy.totalAssets();
            }
            if (assetsToWithdraw != 0) {
                uint256 sharesBurned = activeStrategy.withdraw(assetsToWithdraw, address(this));
                // forge-lint: disable-next-line(reentrancy-events)
                emit StrategyWithdrawn(assetsToWithdraw, sharesBurned);
            }
        }
    }

    function _requireGovernance() internal view {
        if (msg.sender != governance) revert Unauthorized();
    }
}
