// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";

interface SeedPerpsCanaryVm {
    function addr(uint256 privateKey) external returns (address value);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Seeds the governed Perps canary with the explicitly configured minimum USDG amount.
contract SeedPerpsCanary {
    using SafeERC20 for IERC20;

    SeedPerpsCanaryVm private constant vm =
        SeedPerpsCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error InvalidAmount();
    error InsufficientSeedBalance(uint256 available, uint256 required);

    function run() external returns (uint256 shares) {
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address provider = vm.addr(privateKey);
        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        PerpsLiquidityVault vault =
            PerpsLiquidityVault(vm.envAddress("PERPS_LIQUIDITY_VAULT_ADDRESS"));
        uint256 amount = vm.envUint("PERPS_CANARY_USDG_AMOUNT");
        if (amount == 0) revert InvalidAmount();

        uint256 balance = usdg.balanceOf(provider);
        if (balance < amount) revert InsufficientSeedBalance(balance, amount);

        vm.startBroadcast(privateKey);
        usdg.forceApprove(address(vault), amount);
        shares = vault.deposit(amount, provider);
        vm.stopBroadcast();
    }
}
