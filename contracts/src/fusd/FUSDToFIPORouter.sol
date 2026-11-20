// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title fUSD to fIPO Router
/// @notice Atomically redeems fUSD into USDG and deposits the proceeds into fIPO.
/// @dev The router is non-custodial. Vault addresses are immutable deployment inputs,
/// and every successful conversion sends all output shares and rounding residue to the receiver.
contract FUSDToFIPORouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ConversionPaused();
    error DeadlineExpired(uint256 deadline, uint256 timestamp);
    error GuardianCannotUnpause(address caller);
    error InvalidAddress();
    error InvalidAsset(address fusdAsset, address fipoAsset);
    error NoAssetsRedeemed();
    error SlippageExceeded(uint256 minimum, uint256 actual);
    error Unauthorized(address caller);
    error ZeroShares();

    event ConversionPauseSet(bool paused, address indexed caller);
    event FUSDConvertedToFIPO(
        address indexed caller,
        address indexed receiver,
        uint256 fusdShares,
        uint256 usdgAssets,
        uint256 fipoShares
    );

    IERC4626 public immutable fusd;
    IERC4626 public immutable fipo;
    IERC20 public immutable usdg;
    address public immutable governance;
    address public immutable guardian;

    bool public conversionsPaused = true;

    constructor(IERC4626 fusd_, IERC4626 fipo_, address governance_, address guardian_) {
        if (
            address(fusd_) == address(0) || address(fipo_) == address(0)
                || governance_ == address(0) || guardian_ == address(0)
        ) revert InvalidAddress();

        address fusdAsset = fusd_.asset();
        address fipoAsset = fipo_.asset();
        if (fusdAsset == address(0) || fusdAsset != fipoAsset) {
            revert InvalidAsset(fusdAsset, fipoAsset);
        }

        fusd = fusd_;
        fipo = fipo_;
        usdg = IERC20(fusdAsset);
        governance = governance_;
        guardian = guardian_;
    }

    /// @notice Returns the current onchain conversion preview. Execution can differ
    /// if either vault's exchange rate changes before the transaction is included.
    function previewConvert(uint256 fusdShares)
        external
        view
        returns (uint256 usdgAssets, uint256 fipoShares)
    {
        usdgAssets = fusd.previewRedeem(fusdShares);
        fipoShares = fipo.previewDeposit(usdgAssets);
    }

    /// @notice Converts fUSD shares held by the caller into fIPO shares for `receiver`.
    /// @param fusdShares Exact fUSD share amount transferred from the caller.
    /// @param minimumUsdg Minimum USDG that the fUSD redemption must return.
    /// @param minimumFipoShares Minimum fIPO shares that the deposit must mint.
    /// @param receiver Wallet receiving fIPO and any unspent USDG rounding residue.
    /// @param deadline Latest timestamp at which the conversion may execute.
    function convert(
        uint256 fusdShares,
        uint256 minimumUsdg,
        uint256 minimumFipoShares,
        address receiver,
        uint256 deadline
    ) external nonReentrant returns (uint256 usdgAssets, uint256 fipoShares) {
        if (conversionsPaused) revert ConversionPaused();
        if (block.timestamp > deadline) revert DeadlineExpired(deadline, block.timestamp);
        if (fusdShares == 0) revert ZeroShares();
        if (receiver == address(0)) revert InvalidAddress();

        IERC20(address(fusd)).safeTransferFrom(msg.sender, address(this), fusdShares);

        uint256 usdgBefore = usdg.balanceOf(address(this));
        fusd.redeem(fusdShares, address(this), address(this));
        usdgAssets = usdg.balanceOf(address(this)) - usdgBefore;
        if (usdgAssets == 0) revert NoAssetsRedeemed();
        if (usdgAssets < minimumUsdg) revert SlippageExceeded(minimumUsdg, usdgAssets);

        usdg.forceApprove(address(fipo), usdgAssets);
        fipoShares = fipo.deposit(usdgAssets, receiver);
        usdg.forceApprove(address(fipo), 0);
        if (fipoShares < minimumFipoShares) {
            revert SlippageExceeded(minimumFipoShares, fipoShares);
        }

        uint256 residue = usdg.balanceOf(address(this)) - usdgBefore;
        if (residue != 0) usdg.safeTransfer(receiver, residue);

        emit FUSDConvertedToFIPO(msg.sender, receiver, fusdShares, usdgAssets, fipoShares);
    }

    function setConversionsPaused(bool paused) external {
        if (msg.sender != governance) {
            if (msg.sender != guardian) revert Unauthorized(msg.sender);
            if (!paused) revert GuardianCannotUnpause(msg.sender);
        }
        conversionsPaused = paused;
        emit ConversionPauseSet(paused, msg.sender);
    }
}
