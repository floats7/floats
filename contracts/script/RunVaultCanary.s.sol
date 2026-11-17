// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";

interface VaultCanaryVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Executes a minimal real-network cash entry/exit canary with the configured signer.
contract RunVaultCanary {
    VaultCanaryVm private constant vm =
        VaultCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error InsufficientCanaryBalance(uint256 available, uint256 required);
    error InvalidCanaryAmount();
    error ShareBalanceNotRestored(uint256 remainingShares);
    error UnexpectedAssetBalance(uint256 expectedMinimum, uint256 observed);

    event VaultCanaryCompleted(address indexed account, uint256 assets, uint256 shares);

    function run() external returns (uint256 shares) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address account = vm.addr(key);
        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        uint256 amount = vm.envUint("CANARY_USDG_AMOUNT");
        if (amount == 0) revert InvalidCanaryAmount();

        uint256 balanceBefore = usdg.balanceOf(account);
        if (balanceBefore < amount) revert InsufficientCanaryBalance(balanceBefore, amount);
        uint256 sharesBefore = vault.balanceOf(account);
        uint256 expectedShares = vault.previewDeposit(amount);
        uint256 expectedAssetsOut = vault.previewRedeem(expectedShares);
        uint256 expectedMinimumBalance = balanceBefore - amount + expectedAssetsOut;

        vm.startBroadcast(key);
        usdg.approve(address(vault), amount);
        shares = vault.deposit(amount, account);
        vault.redeem(shares, account, account);
        vm.stopBroadcast();

        uint256 remainingShares = vault.balanceOf(account);
        if (remainingShares != sharesBefore) revert ShareBalanceNotRestored(remainingShares);
        uint256 balanceAfter = usdg.balanceOf(account);
        if (balanceAfter < expectedMinimumBalance) {
            revert UnexpectedAssetBalance(expectedMinimumBalance, balanceAfter);
        }
        emit VaultCanaryCompleted(account, amount, shares);
    }
}
