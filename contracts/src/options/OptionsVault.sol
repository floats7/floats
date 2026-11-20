// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OptionsVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum WithdrawalState {
        None,
        Requested,
        Finalized,
        Claimed,
        Cancelled
    }

    struct WithdrawalRequest {
        address owner;
        address receiver;
        uint256 shares;
        uint256 assets;
        uint48 unlockAt;
        WithdrawalState state;
    }

    error InvalidAddress();
    error InvalidAmount();
    error InvalidUnlockTime();
    error Unauthorized();
    error AlreadyConfigured();
    error OperationsPaused();
    error DirectWithdrawalDisabled();
    error InsufficientAvailableCollateral(uint256 available, uint256 required);
    error InvalidLiabilityChange();
    error InvalidWithdrawalState();
    error Insolvent();
    error InvalidYieldVaultAsset(address expected, address actual);
    error YieldVaultAlreadyConfigured();
    error YieldVaultUnavailable();

    event MarketSet(address indexed market);
    event SettlementEngineSet(address indexed settlementEngine);
    event KeeperSet(address indexed keeper, bool allowed);
    event OperationsPauseSet(bool paused, address indexed caller);
    event CollateralReserved(uint256 amount, uint256 totalReserved);
    event CollateralReleased(uint256 amount, uint256 totalReserved);
    event CollateralSettled(
        uint256 maximumLiability,
        uint256 claimableLiability,
        uint256 totalReserved,
        uint256 totalClaimable
    );
    event ClaimPaid(address indexed receiver, uint256 amount, uint256 remainingClaimable);
    event SellBackPaid(address indexed receiver, uint256 amount);
    event WithdrawalRequested(
        uint256 indexed requestId,
        address indexed owner,
        address indexed receiver,
        uint256 shares,
        uint48 unlockAt
    );
    event WithdrawalCancelled(uint256 indexed requestId);
    event WithdrawalFinalized(uint256 indexed requestId, uint256 shares, uint256 assets);
    event WithdrawalClaimed(uint256 indexed requestId, address indexed receiver, uint256 assets);
    event YieldBufferSet(uint256 previousBps, uint256 newBps);
    event YieldInvested(uint256 assets, uint256 shares);
    event YieldRedeemed(uint256 shares, uint256 assets);
    event YieldVaultConfigured(address indexed vault);

    address public immutable admin;
    address public immutable guardian;
    address public market;
    address public settlementEngine;
    bool public operationsPaused;

    uint256 public reservedCollateral;
    uint256 public claimableCollateral;
    uint256 public payableWithdrawalAssets;
    uint256 public nextWithdrawalRequestId = 1;
    uint256 public yieldBufferBps = 1000;
    IERC4626 public yieldVault;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(uint256 requestId => WithdrawalRequest request) public withdrawalRequests;

    constructor(address asset_, address admin_, address guardian_)
        ERC20("Floats Options Vault USDG", "fovUSDG")
        ERC4626(IERC20(asset_))
    {
        if (asset_ == address(0) || admin_ == address(0) || guardian_ == address(0)) {
            revert InvalidAddress();
        }
        admin = admin_;
        guardian = guardian_;
    }

    function setMarket(address market_) external {
        _requireAdmin();
        if (market_ == address(0)) revert InvalidAddress();
        if (market != address(0)) revert AlreadyConfigured();
        market = market_;
        emit MarketSet(market_);
    }

    function setSettlementEngine(address settlementEngine_) external {
        _requireAdmin();
        if (settlementEngine_ == address(0)) revert InvalidAddress();
        if (settlementEngine != address(0)) revert AlreadyConfigured();
        settlementEngine = settlementEngine_;
        emit SettlementEngineSet(settlementEngine_);
    }

    function setKeeper(address keeper, bool allowed) external {
        _requireAdmin();
        if (keeper == address(0)) revert InvalidAddress();
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setOperationsPaused(bool paused) external {
        if (paused) {
            if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        } else {
            _requireAdmin();
        }
        operationsPaused = paused;
        emit OperationsPauseSet(paused, msg.sender);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 managedAssets = IERC20(asset()).balanceOf(address(this)) + yieldVaultAssets();
        uint256 liabilities = totalLiabilities();
        if (managedAssets < liabilities) revert Insolvent();
        return managedAssets - liabilities;
    }

    function totalLiabilities() public view returns (uint256) {
        return reservedCollateral + claimableCollateral + payableWithdrawalAssets;
    }

    function yieldVaultAssets() public view returns (uint256) {
        IERC4626 activeYieldVault = yieldVault;
        if (address(activeYieldVault) == address(0)) return 0;
        return activeYieldVault.previewRedeem(activeYieldVault.balanceOf(address(this)));
    }

    function availableCollateral() public view returns (uint256) {
        return totalAssets();
    }

    function maxDeposit(address) public view override returns (uint256) {
        return operationsPaused ? 0 : type(uint256).max;
    }

    function maxMint(address) public view override returns (uint256) {
        return operationsPaused ? 0 : type(uint256).max;
    }

    function configureYieldVault(IERC4626 yieldVault_) external {
        _requireAdmin();
        if (address(yieldVault) != address(0)) revert YieldVaultAlreadyConfigured();
        if (address(yieldVault_) == address(0)) revert InvalidAddress();
        address yieldAsset = yieldVault_.asset();
        if (yieldAsset != asset()) revert InvalidYieldVaultAsset(asset(), yieldAsset);
        yieldVault = yieldVault_;
        IERC20(asset()).forceApprove(address(yieldVault_), type(uint256).max);
        emit YieldVaultConfigured(address(yieldVault_));
    }

    function setYieldBufferBps(uint256 newBps) external {
        _requireAdmin();
        if (newBps > 10_000) revert InvalidAmount();
        uint256 previousBps = yieldBufferBps;
        yieldBufferBps = newBps;
        emit YieldBufferSet(previousBps, newBps);
    }

    /// @notice Invests only LP equity above all liabilities and the configured liquid buffer.
    function rebalanceIdleCollateral() external nonReentrant returns (uint256 assetsInvested) {
        _requireOperator();
        if (operationsPaused) revert OperationsPaused();
        IERC4626 activeYieldVault = yieldVault;
        if (address(activeYieldVault) == address(0)) revert YieldVaultUnavailable();

        uint256 liquidAssets = IERC20(asset()).balanceOf(address(this));
        uint256 targetLiquid = totalLiabilities() + totalAssets() * yieldBufferBps / 10_000;
        if (liquidAssets <= targetLiquid) return 0;

        assetsInvested = liquidAssets - targetLiquid;
        uint256 capacity = activeYieldVault.maxDeposit(address(this));
        if (assetsInvested > capacity) assetsInvested = capacity;
        if (assetsInvested == 0) return 0;

        uint256 shares = activeYieldVault.deposit(assetsInvested, address(this));
        emit YieldInvested(assetsInvested, shares);
    }

    /// @notice Returns every fUSD position to USDG and pauses new vault operations.
    function emergencyExitYieldVault() external nonReentrant returns (uint256 assetsRecovered) {
        if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        IERC4626 activeYieldVault = yieldVault;
        if (address(activeYieldVault) == address(0)) revert YieldVaultUnavailable();
        operationsPaused = true;
        emit OperationsPauseSet(true, msg.sender);

        uint256 shares = activeYieldVault.balanceOf(address(this));
        if (shares != 0) {
            assetsRecovered = activeYieldVault.redeem(shares, address(this), address(this));
            emit YieldRedeemed(shares, assetsRecovered);
        }
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        if (operationsPaused) revert OperationsPaused();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        if (operationsPaused) revert OperationsPaused();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256, address, address) public pure override returns (uint256) {
        revert DirectWithdrawalDisabled();
    }

    function redeem(uint256, address, address) public pure override returns (uint256) {
        revert DirectWithdrawalDisabled();
    }

    function maxWithdraw(address) public pure override returns (uint256) {
        return 0;
    }

    function maxRedeem(address) public pure override returns (uint256) {
        return 0;
    }

    function reserveCollateral(uint256 amount) external {
        _requireMarket();
        if (operationsPaused) revert OperationsPaused();
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableCollateral();
        if (amount > available) revert InsufficientAvailableCollateral(available, amount);
        _ensureLiquidAssets(totalLiabilities() + amount);
        reservedCollateral += amount;
        emit CollateralReserved(amount, reservedCollateral);
    }

    function releaseCollateral(uint256 amount) external {
        _requireMarket();
        if (amount == 0 || amount > reservedCollateral) revert InvalidLiabilityChange();
        reservedCollateral -= amount;
        emit CollateralReleased(amount, reservedCollateral);
    }

    function settleCollateral(uint256 maximumLiability, uint256 actualLiability) external {
        _requireSettlementEngine();
        if (
            maximumLiability == 0 || maximumLiability > reservedCollateral
                || actualLiability > maximumLiability
        ) revert InvalidLiabilityChange();
        reservedCollateral -= maximumLiability;
        claimableCollateral += actualLiability;
        emit CollateralSettled(
            maximumLiability, actualLiability, reservedCollateral, claimableCollateral
        );
    }

    function payClaim(address receiver, uint256 amount) external nonReentrant {
        _requireSettlementEngine();
        if (receiver == address(0)) revert InvalidAddress();
        if (amount == 0 || amount > claimableCollateral) revert InvalidLiabilityChange();
        _ensureLiquidAssets(totalLiabilities());
        claimableCollateral -= amount;
        IERC20(asset()).safeTransfer(receiver, amount);
        emit ClaimPaid(receiver, amount, claimableCollateral);
    }

    function paySellBack(address receiver, uint256 amount) external nonReentrant {
        _requireMarket();
        if (receiver == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableCollateral();
        if (amount > available) revert InsufficientAvailableCollateral(available, amount);
        _ensureLiquidAssets(totalLiabilities() + amount);
        IERC20(asset()).safeTransfer(receiver, amount);
        emit SellBackPaid(receiver, amount);
    }

    function requestWithdrawal(uint256 shares, address receiver, uint48 unlockAt)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        if (operationsPaused) revert OperationsPaused();
        if (shares == 0) revert InvalidAmount();
        if (receiver == address(0)) revert InvalidAddress();
        if (unlockAt <= block.timestamp) revert InvalidUnlockTime();

        requestId = nextWithdrawalRequestId++;
        withdrawalRequests[requestId] = WithdrawalRequest({
            owner: msg.sender,
            receiver: receiver,
            shares: shares,
            assets: 0,
            unlockAt: unlockAt,
            state: WithdrawalState.Requested
        });
        _transfer(msg.sender, address(this), shares);
        emit WithdrawalRequested(requestId, msg.sender, receiver, shares, unlockAt);
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

    function finalizeWithdrawal(uint256 requestId) external nonReentrant {
        _requireOperator();
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Requested || block.timestamp < request.unlockAt) {
            revert InvalidWithdrawalState();
        }

        uint256 shares = request.shares;
        uint256 assets = convertToAssets(shares);
        uint256 available = availableCollateral();
        if (assets == 0 || assets > available) {
            revert InsufficientAvailableCollateral(available, assets);
        }

        _ensureLiquidAssets(totalLiabilities() + assets);

        request.assets = assets;
        request.state = WithdrawalState.Finalized;
        payableWithdrawalAssets += assets;
        _burn(address(this), shares);
        emit WithdrawalFinalized(requestId, shares, assets);
    }

    function claimWithdrawal(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Finalized) revert InvalidWithdrawalState();
        request.state = WithdrawalState.Claimed;
        uint256 assets = request.assets;
        payableWithdrawalAssets -= assets;
        IERC20(asset()).safeTransfer(request.receiver, assets);
        emit WithdrawalClaimed(requestId, request.receiver, assets);
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }

    function _requireOperator() private view {
        if (msg.sender != admin && !isKeeper[msg.sender]) revert Unauthorized();
    }

    function _requireMarket() private view {
        if (msg.sender != market || market == address(0)) revert Unauthorized();
    }

    function _requireSettlementEngine() private view {
        if (msg.sender != settlementEngine || settlementEngine == address(0)) {
            revert Unauthorized();
        }
    }

    function _ensureLiquidAssets(uint256 requiredAssets) private {
        uint256 liquidAssets = IERC20(asset()).balanceOf(address(this));
        if (liquidAssets >= requiredAssets) return;

        IERC4626 activeYieldVault = yieldVault;
        if (address(activeYieldVault) == address(0)) {
            revert InsufficientAvailableCollateral(liquidAssets, requiredAssets);
        }

        uint256 shortfall = requiredAssets - liquidAssets;
        uint256 shares = activeYieldVault.withdraw(shortfall, address(this), address(this));
        emit YieldRedeemed(shares, shortfall);
    }
}
