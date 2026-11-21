// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PerpsLiquidityVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
        uint48 unlockAt;
        WithdrawalState state;
    }

    error DirectWithdrawalDisabled();
    error Insolvent();
    error InsufficientAvailableLiquidity(uint256 available, uint256 required);
    error InvalidAddress();
    error InvalidAmount();
    error InvalidLiabilityChange();
    error InvalidUnlockTime();
    error InvalidWithdrawalState();
    error OperationsPaused();
    error Unauthorized();
    error WithdrawalDelayCannotDecrease(uint48 currentDelay, uint48 requestedDelay);

    event OperatorSet(address indexed operator, bool allowed);
    event OperationsPauseSet(bool paused, address indexed caller);
    event LiabilityReserved(uint256 assets, uint256 totalReserved);
    event LiabilityReleased(uint256 assets, uint256 totalReserved);
    event TraderProfitPaid(address indexed receiver, uint256 assets, uint256 totalReserved);
    event ProtocolRevenueReceived(uint256 assets);
    event BadDebtRecorded(uint256 assets, uint256 totalBadDebt);
    event BadDebtCovered(uint256 assets, uint256 totalBadDebt);
    event PerpsWithdrawalRequested(
        uint256 indexed requestId,
        address indexed owner,
        address indexed receiver,
        uint256 shares,
        uint48 unlockAt
    );
    event PerpsWithdrawalCancelled(uint256 indexed requestId);
    event PerpsWithdrawalProcessed(uint256 indexed requestId, uint256 shares, uint256 assets);
    event PerpsWithdrawalClaimed(
        uint256 indexed requestId, address indexed receiver, uint256 assets
    );
    event WithdrawalDelayIncreased(uint48 previousDelay, uint48 newDelay);

    uint48 public constant MINIMUM_CANARY_WITHDRAWAL_DELAY = 5 minutes;
    address public immutable admin;
    address public immutable guardian;
    uint48 public minimumWithdrawalDelay;

    bool public operationsPaused;
    uint256 public reservedTraderLiability;
    uint256 public payableWithdrawalAssets;
    uint256 public recognizedBadDebt;
    uint256 public nextWithdrawalRequestId = 1;

    mapping(address operator => bool allowed) public isOperator;
    mapping(uint256 requestId => WithdrawalRequest request) public withdrawalRequests;

    constructor(address asset_, address admin_, address guardian_, uint48 minimumWithdrawalDelay_)
        ERC20("Floats Perps Liquidity USDG", "fplUSDG")
        ERC4626(IERC20(asset_))
    {
        if (asset_ == address(0) || admin_ == address(0) || guardian_ == address(0)) {
            revert InvalidAddress();
        }
        if (minimumWithdrawalDelay_ < MINIMUM_CANARY_WITHDRAWAL_DELAY) {
            revert InvalidUnlockTime();
        }
        admin = admin_;
        guardian = guardian_;
        minimumWithdrawalDelay = minimumWithdrawalDelay_;
        operationsPaused = true;
        emit OperationsPauseSet(true, msg.sender);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 managed = IERC20(asset()).balanceOf(address(this));
        uint256 liabilities = reservedTraderLiability + payableWithdrawalAssets + recognizedBadDebt;
        if (managed < liabilities) revert Insolvent();
        return managed - liabilities;
    }

    function availableLiquidity() public view returns (uint256) {
        return totalAssets();
    }

    function managedAssets() external view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function utilizationBps() external view returns (uint256) {
        uint256 managed = IERC20(asset()).balanceOf(address(this));
        if (managed == 0) return reservedTraderLiability == 0 ? 0 : type(uint256).max;
        return reservedTraderLiability * 10_000 / managed;
    }

    function maxDeposit(address) public view override returns (uint256) {
        return operationsPaused ? 0 : type(uint256).max;
    }

    function maxMint(address) public view override returns (uint256) {
        return operationsPaused ? 0 : type(uint256).max;
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

    function reserveLiability(uint256 assets) external {
        _requireOperator();
        if (operationsPaused) revert OperationsPaused();
        if (assets == 0) revert InvalidAmount();
        uint256 available = availableLiquidity();
        if (assets > available) revert InsufficientAvailableLiquidity(available, assets);
        reservedTraderLiability += assets;
        emit LiabilityReserved(assets, reservedTraderLiability);
    }

    function releaseLiability(uint256 assets) external {
        _requireOperator();
        if (assets == 0 || assets > reservedTraderLiability) revert InvalidLiabilityChange();
        reservedTraderLiability -= assets;
        emit LiabilityReleased(assets, reservedTraderLiability);
    }

    function payTraderProfit(address receiver, uint256 reservedAssets, uint256 profitAssets)
        external
        nonReentrant
    {
        _requireOperator();
        if (receiver == address(0)) revert InvalidAddress();
        if (
            reservedAssets == 0 || reservedAssets > reservedTraderLiability
                || profitAssets > reservedAssets
        ) revert InvalidLiabilityChange();
        reservedTraderLiability -= reservedAssets;
        if (profitAssets != 0) IERC20(asset()).safeTransfer(receiver, profitAssets);
        emit TraderProfitPaid(receiver, profitAssets, reservedTraderLiability);
    }

    function payTraderCredit(address receiver, uint256 assets) external nonReentrant {
        _requireOperator();
        if (receiver == address(0)) revert InvalidAddress();
        if (assets == 0) revert InvalidAmount();
        uint256 available = availableLiquidity();
        if (assets > available) revert InsufficientAvailableLiquidity(available, assets);
        IERC20(asset()).safeTransfer(receiver, assets);
        emit TraderProfitPaid(receiver, assets, reservedTraderLiability);
    }

    function recordProtocolRevenue(uint256 assets) external {
        _requireOperator();
        if (assets == 0) revert InvalidAmount();
        emit ProtocolRevenueReceived(assets);
    }

    function recordBadDebt(uint256 assets) external {
        _requireOperator();
        if (assets == 0) revert InvalidAmount();
        recognizedBadDebt += assets;
        emit BadDebtRecorded(assets, recognizedBadDebt);
    }

    function coverBadDebt(uint256 assets) external {
        _requireOperator();
        if (assets == 0 || assets > recognizedBadDebt) revert InvalidLiabilityChange();
        recognizedBadDebt -= assets;
        emit BadDebtCovered(assets, recognizedBadDebt);
    }

    function requestWithdrawal(uint256 shares, address receiver)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        if (operationsPaused) revert OperationsPaused();
        if (shares == 0) revert InvalidAmount();
        if (receiver == address(0)) revert InvalidAddress();
        // block.timestamp is safely representable as uint48 for the protocol lifetime.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint48 unlockAt = uint48(block.timestamp + minimumWithdrawalDelay);
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
        emit PerpsWithdrawalRequested(requestId, msg.sender, receiver, shares, unlockAt);
    }

    function cancelWithdrawal(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Requested || request.owner != msg.sender) {
            revert InvalidWithdrawalState();
        }
        request.state = WithdrawalState.Cancelled;
        _transfer(address(this), request.owner, request.shares);
        emit PerpsWithdrawalCancelled(requestId);
    }

    function processWithdrawal(uint256 requestId) external nonReentrant {
        _requireOperator();
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        // Timestamp comparison enforces the dated-withdrawal delay.
        // forge-lint: disable-next-line(block-timestamp)
        if (request.state != WithdrawalState.Requested || block.timestamp < request.unlockAt) {
            revert InvalidWithdrawalState();
        }

        uint256 shares = request.shares;
        uint256 assets = convertToAssets(shares);
        uint256 available = availableLiquidity();
        if (assets == 0 || assets > available) {
            revert InsufficientAvailableLiquidity(available, assets);
        }

        request.assets = assets;
        request.state = WithdrawalState.Processed;
        payableWithdrawalAssets += assets;
        _burn(address(this), shares);
        emit PerpsWithdrawalProcessed(requestId, shares, assets);
    }

    function claimWithdrawal(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.state != WithdrawalState.Processed) revert InvalidWithdrawalState();
        request.state = WithdrawalState.Claimed;
        uint256 assets = request.assets;
        payableWithdrawalAssets -= assets;
        IERC20(asset()).safeTransfer(request.receiver, assets);
        emit PerpsWithdrawalClaimed(requestId, request.receiver, assets);
    }

    function setOperator(address operator, bool allowed) external {
        _requireAdmin();
        if (operator == address(0)) revert InvalidAddress();
        // The adjacent OperatorSet event provides the access-control audit trail.
        // forge-lint: disable-next-line(missing-events-access-control)
        isOperator[operator] = allowed;
        emit OperatorSet(operator, allowed);
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

    /// @notice Permanently raises the delay applied to future withdrawal requests.
    /// @dev Existing requests retain the unlock timestamp captured when they were created.
    function increaseWithdrawalDelay(uint48 newDelay) external {
        _requireAdmin();
        uint48 previousDelay = minimumWithdrawalDelay;
        if (newDelay <= previousDelay) {
            revert WithdrawalDelayCannotDecrease(previousDelay, newDelay);
        }
        minimumWithdrawalDelay = newDelay;
        emit WithdrawalDelayIncreased(previousDelay, newDelay);
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }

    function _requireOperator() private view {
        if (!isOperator[msg.sender]) revert Unauthorized();
    }
}

