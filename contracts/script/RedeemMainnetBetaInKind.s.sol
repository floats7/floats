// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { FloatsVault } from "../src/core/FloatsVault.sol";

interface MainnetInKindVm {
    function addr(uint256 privateKey) external returns (address account);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Executes the bounded in-kind exit canary against the live mainnet beta vault.
contract RedeemMainnetBetaInKind {
    MainnetInKindVm private constant vm =
        MainnetInKindVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error InsufficientShares(uint256 available, uint256 required);
    error InvalidShares();
    error MainnetOnly(uint256 chainId);
    error SignerMismatch(address expected, address actual);
    error UnexpectedShareBalance(uint256 expected, uint256 actual);

    event MainnetInKindRedeemed(address indexed account, uint256 shares);

    function run() external returns (address[] memory tokens, uint256[] memory amounts) {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        uint256 privateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address account = vm.addr(privateKey);
        address expectedAccount = vm.envAddress("ADMIN_ADDRESS");
        if (account != expectedAccount) revert SignerMismatch(expectedAccount, account);

        uint256 shares = vm.envUint("IN_KIND_REDEEM_SHARES");
        if (shares == 0) revert InvalidShares();
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        uint256 balanceBefore = vault.balanceOf(account);
        if (balanceBefore < shares) revert InsufficientShares(balanceBefore, shares);

        vm.startBroadcast(privateKey);
        (tokens, amounts) = vault.redeemInKind(shares, account, account);
        vm.stopBroadcast();

        uint256 expectedBalance = balanceBefore - shares;
        uint256 actualBalance = vault.balanceOf(account);
        if (actualBalance != expectedBalance) {
            revert UnexpectedShareBalance(expectedBalance, actualBalance);
        }
        emit MainnetInKindRedeemed(account, shares);
    }
}
