// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFloatsIndexRegistry {
    function getTrackedTokens() external view returns (address[] memory);
}

interface IFloatsNavOracle {
    function totalValue(address[] calldata tokens, uint256[] calldata rawAmounts, uint256 idleUsdg)
        external
        view
        returns (uint256 value18);
}

interface IFloatsFeeModule {
    enum FeeKind {
        Cash,
        InKind,
        OffHours
    }

    function calculateFee(uint256 amount, FeeKind kind) external view returns (uint256);

    function grossAmount(uint256 netAmount, FeeKind kind) external view returns (uint256);

    function treasury() external view returns (address);
}

/// @title FloatsVault
/// @notice USDG ERC-4626 vault with oracle NAV accounting and an oracle-independent in-kind exit.
contract FloatsVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant SHARE_DECIMALS_OFFSET = 12;
    uint256 public constant INTERNAL_TO_USDG_SCALE = 1e12;

    error DepositsPaused();
    error CashOperationsPaused();
    error InvalidAddress();
    error InvalidCap(uint256 cap);
    error GuardianCannotUnpause(address caller);
    error LengthMismatch();
    error FeeExceedsAmount(uint256 amount, uint256 fee);
    error NotFeeModule(address caller);
    error NotRebalancer(address caller);
    error ZeroShares();

    event DepositsPauseSet(bool paused);
    event CashOperationsPauseSet(bool paused);
    event InKindRedeemed(
        address indexed caller, address indexed receiver, address indexed owner, uint256 shares
    );
    event TvlCapSet(uint256 previousCap, uint256 newCap);
    event FeeModuleSet(address indexed previousModule, address indexed newModule);
    event RebalancerSet(address indexed previousRebalancer, address indexed newRebalancer);
    event TransactionFeeCharged(
        address indexed payer, address indexed token, uint256 amount, bool paidInShares
    );

    IFloatsIndexRegistry public immutable indexRegistry;
    IFloatsNavOracle public immutable navOracle;
    address public immutable guardian;

    uint256 public tvlCap;
    bool public depositsPaused;
    bool public cashOperationsPaused;
    address public feeModule;
    address public rebalancer;

    constructor(
        IERC20 usdg,
        address admin,
        address guardian_,
        IFloatsIndexRegistry indexRegistry_,
        IFloatsNavOracle navOracle_,
        uint256 initialTvlCap,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) ERC4626(usdg) Ownable(admin) {
        if (
            address(usdg) == address(0) || admin == address(0) || guardian_ == address(0)
                || address(indexRegistry_) == address(0) || address(navOracle_) == address(0)
        ) revert InvalidAddress();
        if (initialTvlCap == 0) revert InvalidCap(initialTvlCap);

        indexRegistry = indexRegistry_;
        navOracle = navOracle_;
        guardian = guardian_;
        tvlCap = initialTvlCap;
    }

    function totalAssets() public view override returns (uint256) {
        address[] memory tokens = indexRegistry.getTrackedTokens();
        uint256 length = tokens.length;
        uint256[] memory balances = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            balances[i] = IERC20(tokens[i]).balanceOf(address(this));
        }

        uint256 idleUsdg = IERC20(asset()).balanceOf(address(this));
        return navOracle.totalValue(tokens, balances, idleUsdg) / INTERNAL_TO_USDG_SCALE;
    }

    function setTvlCap(uint256 newCap) external onlyOwner {
        if (newCap == 0) revert InvalidCap(newCap);
        uint256 previousCap = tvlCap;
        tvlCap = newCap;
        emit TvlCapSet(previousCap, newCap);
    }

    function setDepositsPaused(bool paused) external {
        _authorizePause(paused);
        depositsPaused = paused;
        emit DepositsPauseSet(paused);
    }

    /// @notice Disables every price-dependent cash path while preserving in-kind redemption.
    function setCashOperationsPaused(bool paused) external {
        _authorizePause(paused);
        cashOperationsPaused = paused;
        emit CashOperationsPauseSet(paused);
    }

    function setFeeModule(address newFeeModule) external onlyOwner {
        if (newFeeModule == address(0)) revert InvalidAddress();
        address previousModule = feeModule;
        feeModule = newFeeModule;
        emit FeeModuleSet(previousModule, newFeeModule);
    }

    function mintFeeShares(address recipient, uint256 shares) external {
        if (msg.sender != feeModule) revert NotFeeModule(msg.sender);
        if (recipient == address(0)) revert InvalidAddress();
        if (shares != 0) _mint(recipient, shares);
    }

    function setRebalancer(address newRebalancer) external onlyOwner {
        if (newRebalancer == address(0)) revert InvalidAddress();
        address previousRebalancer = rebalancer;
        rebalancer = newRebalancer;
        emit RebalancerSet(previousRebalancer, newRebalancer);
    }

    function transferForRebalance(address token, address recipient, uint256 amount) external {
        if (msg.sender != rebalancer) revert NotRebalancer(msg.sender);
        if (token == address(0) || recipient == address(0)) revert InvalidAddress();
        IERC20(token).safeTransfer(recipient, amount);
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (depositsPaused || cashOperationsPaused) return 0;
        uint256 assets = totalAssets();
        return assets >= tvlCap ? 0 : _grossCashAmount(tvlCap - assets);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        if (cashOperationsPaused) return 0;
        uint256 entitledAssets = convertToAssets(balanceOf(owner));
        uint256 idleUsdg = IERC20(asset()).balanceOf(address(this));
        uint256 grossAssets = entitledAssets < idleUsdg ? entitledAssets : idleUsdg;
        return _netAfterCashFee(grossAssets);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        if (cashOperationsPaused) return 0;
        uint256 ownerShares = balanceOf(owner);
        uint256 liquidShares = convertToShares(IERC20(asset()).balanceOf(address(this)));
        return ownerShares < liquidShares ? ownerShares : liquidShares;
    }

    function previewDeposit(uint256 assets) public view override returns (uint256) {
        return super.previewDeposit(_netAfterCashFee(assets));
    }

    function previewMint(uint256 shares) public view override returns (uint256) {
        return _grossCashAmount(super.previewMint(shares));
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        return super.previewWithdraw(_grossCashAmount(assets));
    }

    function previewRedeem(uint256 shares) public view override returns (uint256) {
        return _netAfterCashFee(super.previewRedeem(shares));
    }

    function redeemInKind(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        if (shares == 0) revert ZeroShares();
        if (receiver == address(0) || owner == address(0)) revert InvalidAddress();

        uint256 supplyBefore = totalSupply();
        uint256 feeShares = _transactionFee(shares, IFloatsFeeModule.FeeKind.InKind);
        if (feeShares >= shares) revert FeeExceedsAmount(shares, feeShares);
        uint256 redeemedShares = shares - feeShares;
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);

        address[] memory trackedTokens = indexRegistry.getTrackedTokens();
        uint256 tokenLength = trackedTokens.length;
        tokens = new address[](tokenLength + 1);
        amounts = new uint256[](tokenLength + 1);
        tokens[0] = asset();

        if (feeShares != 0) {
            _transfer(owner, IFloatsFeeModule(feeModule).treasury(), feeShares);
            emit TransactionFeeCharged(owner, address(this), feeShares, true);
        }
        _burn(owner, redeemedShares);

        uint256 idleUsdg = IERC20(asset()).balanceOf(address(this));
        amounts[0] = idleUsdg * redeemedShares / supplyBefore;
        if (amounts[0] != 0) IERC20(asset()).safeTransfer(receiver, amounts[0]);

        for (uint256 i; i < tokenLength; ++i) {
            tokens[i + 1] = trackedTokens[i];
            IERC20 token = IERC20(trackedTokens[i]);
            uint256 amount = token.balanceOf(address(this)) * redeemedShares / supplyBefore;
            amounts[i + 1] = amount;
            if (amount != 0) token.safeTransfer(receiver, amount);
        }

        emit InKindRedeemed(msg.sender, receiver, owner, shares);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        if (cashOperationsPaused) revert CashOperationsPaused();
        if (depositsPaused) revert DepositsPaused();
        super._deposit(caller, receiver, assets, shares);
        uint256 fee = _transactionFee(assets, IFloatsFeeModule.FeeKind.Cash);
        if (fee != 0) {
            IERC20(asset()).safeTransfer(IFloatsFeeModule(feeModule).treasury(), fee);
            emit TransactionFeeCharged(caller, asset(), fee, false);
        }
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant {
        if (cashOperationsPaused) revert CashOperationsPaused();
        uint256 grossAssets = super.previewRedeem(shares);
        uint256 fee = _transactionFee(grossAssets, IFloatsFeeModule.FeeKind.Cash);
        if (grossAssets < assets + fee) revert FeeExceedsAmount(grossAssets, fee);
        super._withdraw(caller, receiver, owner, assets, shares);
        if (fee != 0) {
            IERC20(asset()).safeTransfer(IFloatsFeeModule(feeModule).treasury(), fee);
            emit TransactionFeeCharged(owner, asset(), fee, false);
        }
    }

    function _transactionFee(uint256 amount, IFloatsFeeModule.FeeKind kind)
        private
        view
        returns (uint256)
    {
        if (feeModule == address(0) || amount == 0) return 0;
        return IFloatsFeeModule(feeModule).calculateFee(amount, kind);
    }

    function _authorizePause(bool paused) private view {
        address caller = msg.sender;
        if (caller == owner()) return;
        if (caller != guardian) revert OwnableUnauthorizedAccount(caller);
        if (!paused) revert GuardianCannotUnpause(caller);
    }

    function _grossCashAmount(uint256 netAmount) private view returns (uint256) {
        if (feeModule == address(0) || netAmount == 0) return netAmount;
        return IFloatsFeeModule(feeModule).grossAmount(netAmount, IFloatsFeeModule.FeeKind.Cash);
    }

    function _netAfterCashFee(uint256 grossAmount) private view returns (uint256) {
        uint256 fee = _transactionFee(grossAmount, IFloatsFeeModule.FeeKind.Cash);
        if (fee > grossAmount) revert FeeExceedsAmount(grossAmount, fee);
        return grossAmount - fee;
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return SHARE_DECIMALS_OFFSET;
    }
}
