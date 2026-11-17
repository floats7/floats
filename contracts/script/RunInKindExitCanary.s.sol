// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault, IFloatsFeeModule } from "../src/core/FloatsVault.sol";

interface InKindCanaryVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Exercises the oracle-independent forced-exit path on a live network.
contract RunInKindExitCanary {
    InKindCanaryVm private constant vm =
        InKindCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error InsufficientCanaryBalance(uint256 available, uint256 required);
    error InvalidCanaryAmount();
    error UnexpectedAssetBalance(uint256 expectedMinimum, uint256 observed);
    error UnexpectedShareBalance(uint256 expected, uint256 observed);

    event InKindExitCanaryCompleted(address indexed account, uint256 assets, uint256 shares);

    function run() external returns (uint256 shares) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address account = vm.addr(key);
        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        uint256 amount = vm.envUint("CANARY_USDG_AMOUNT");
        if (amount == 0) revert InvalidCanaryAmount();

        uint256 assetsBefore = usdg.balanceOf(account);
        if (assetsBefore < amount) revert InsufficientCanaryBalance(assetsBefore, amount);
        uint256 sharesBefore = vault.balanceOf(account);

        vm.startBroadcast(key);
        usdg.approve(address(vault), amount);
        shares = vault.deposit(amount, account);
        uint256 feeShares = IFloatsFeeModule(vault.feeModule()).calculateFee(
            shares, IFloatsFeeModule.FeeKind.InKind
        );
        uint256 expectedUsdgOut =
            usdg.balanceOf(address(vault)) * (shares - feeShares) / vault.totalSupply();
        vault.redeemInKind(shares, account, account);
        vm.stopBroadcast();

        uint256 sharesAfter = vault.balanceOf(account);
        if (sharesAfter != sharesBefore) revert UnexpectedShareBalance(sharesBefore, sharesAfter);
        uint256 assetsAfter = usdg.balanceOf(account);
        uint256 expectedMinimum = assetsBefore - amount + expectedUsdgOut;
        if (assetsAfter < expectedMinimum) {
            revert UnexpectedAssetBalance(expectedMinimum, assetsAfter);
        }
        emit InKindExitCanaryCompleted(account, amount, shares);
    }
}
