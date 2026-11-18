// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";

interface MainnetMintVm {
    function addr(uint256 privateKey) external returns (address account);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Performs the explicit, capped first cash mint for the mainnet beta basket.
contract MintMainnetBetaShares {
    MainnetMintVm private constant vm =
        MainnetMintVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidAmount();
    error MainnetOnly(uint256 chainId);
    error SignerMismatch(address expected, address actual);
    error UnexpectedShares(uint256 expected, uint256 actual);

    event MainnetBetaSharesMinted(
        address indexed account, address indexed recipient, uint256 assets, uint256 shares
    );

    function run() external returns (uint256 shares) {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        uint256 privateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address account = vm.addr(privateKey);
        address expectedAccount = vm.envAddress("ADMIN_ADDRESS");
        if (account != expectedAccount) revert SignerMismatch(expectedAccount, account);

        address recipient = vm.envAddress("FIRST_MINT_RECIPIENT");
        uint256 assets = vm.envUint("FIRST_MINT_USDG_AMOUNT");
        if (assets == 0) revert InvalidAmount();

        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        uint256 balance = usdg.balanceOf(account);
        if (balance < assets) revert InsufficientBalance(balance, assets);

        uint256 expectedShares = vault.previewDeposit(assets);
        vm.startBroadcast(privateKey);
        usdg.approve(address(vault), assets);
        shares = vault.deposit(assets, recipient);
        vm.stopBroadcast();

        if (shares != expectedShares) revert UnexpectedShares(expectedShares, shares);
        emit MainnetBetaSharesMinted(account, recipient, assets, shares);
    }
}
