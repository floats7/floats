// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IFUSDStrategy } from "./interfaces/IFUSDStrategy.sol";
import { IMorphoVaultV2 } from "./interfaces/IMorphoVaultV2.sol";

/// @title Morpho USDG Strategy
/// @notice Holds Steakhouse USDG shares for one immutable fUSD vault.
contract MorphoUSDGStrategy is IFUSDStrategy, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidMorphoAsset(address expected, address actual);
    error Unauthorized();
    error SlippageExceeded(uint256 expected, uint256 actual);
    error ZeroSharesReceived();

    event Deposited(uint256 assets, uint256 shares);
    event Withdrawn(address indexed receiver, uint256 assets, uint256 shares);
    event FullyRedeemed(address indexed receiver, uint256 assets, uint256 shares);

    IERC20 public immutable usdg;
    IMorphoVaultV2 public immutable morphoVault;
    address public immutable fusdVault;

    modifier onlyVault() {
        if (msg.sender != fusdVault) revert Unauthorized();
        _;
    }

    constructor(IERC20 usdg_, IMorphoVaultV2 morphoVault_, address fusdVault_) {
        if (
            address(usdg_) == address(0) || address(morphoVault_) == address(0)
                || fusdVault_ == address(0)
        ) {
            revert InvalidAddress();
        }
        address strategyAsset = morphoVault_.asset();
        if (strategyAsset != address(usdg_)) {
            revert InvalidMorphoAsset(address(usdg_), strategyAsset);
        }
        usdg = usdg_;
        morphoVault = morphoVault_;
        fusdVault = fusdVault_;
        usdg_.forceApprove(address(morphoVault_), type(uint256).max);
    }

    function asset() external view returns (address) {
        return address(usdg);
    }

    function totalAssets() public view returns (uint256) {
        uint256 idleAssets = usdg.balanceOf(address(this));
        uint256 strategyShares = morphoVault.balanceOf(address(this));
        return idleAssets + morphoVault.convertToAssets(strategyShares);
    }

    function deposit(uint256 assets) external nonReentrant onlyVault returns (uint256 shares) {
        uint256 expectedShares = morphoVault.previewDeposit(assets);
        usdg.safeTransferFrom(msg.sender, address(this), assets);
        shares = morphoVault.deposit(assets, address(this));
        if (shares == 0) revert ZeroSharesReceived();
        if (shares < expectedShares) revert SlippageExceeded(expectedShares, shares);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Deposited(assets, shares);
    }

    function withdraw(uint256 assets, address receiver)
        external
        nonReentrant
        onlyVault
        returns (uint256 shares)
    {
        if (receiver == address(0)) revert InvalidAddress();
        uint256 idleAssets = usdg.balanceOf(address(this));
        if (idleAssets < assets) {
            uint256 strategyAssets = assets - idleAssets;
            uint256 maximumShares = morphoVault.previewWithdraw(strategyAssets);
            shares = morphoVault.withdraw(strategyAssets, address(this), address(this));
            if (shares > maximumShares) revert SlippageExceeded(maximumShares, shares);
        }
        usdg.safeTransfer(receiver, assets);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Withdrawn(receiver, assets, shares);
    }

    function redeemAll(address receiver) external nonReentrant onlyVault returns (uint256 assets) {
        if (receiver == address(0)) revert InvalidAddress();
        uint256 shares = morphoVault.balanceOf(address(this));
        uint256 minimumAssets = 0;
        if (shares != 0) {
            minimumAssets = morphoVault.previewRedeem(shares);
            uint256 redeemedAssets = morphoVault.redeem(shares, address(this), address(this));
            if (redeemedAssets < minimumAssets) {
                revert SlippageExceeded(minimumAssets, redeemedAssets);
            }
        }
        assets = usdg.balanceOf(address(this));
        if (assets != 0) usdg.safeTransfer(receiver, assets);
        // forge-lint: disable-next-line(reentrancy-events)
        emit FullyRedeemed(receiver, assets, shares);
    }
}
