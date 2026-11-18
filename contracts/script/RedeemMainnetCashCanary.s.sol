// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";
import { FeeModule } from "../src/fees/FeeModule.sol";

interface MainnetCashRedeemVm {
    function addr(uint256 privateKey) external returns (address account);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Completes the redeem leg of a previously confirmed mainnet cash canary deposit.
contract RedeemMainnetCashCanary {
    MainnetCashRedeemVm private constant vm =
        MainnetCashRedeemVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error CashOperationsPaused();
    error FeeNotCollected();
    error InsufficientShares(uint256 available, uint256 required);
    error InvalidAmount();
    error MainnetOnly(uint256 chainId);
    error SignerMismatch(address expected, address actual);
    error UnexpectedShareBalance(uint256 expected, uint256 actual);

    event MainnetCashRedeemCanaryCompleted(
        address indexed account,
        uint256 redeemedShares,
        uint256 returnedAssets,
        uint256 treasuryFee
    );

    function run() external returns (uint256 returnedAssets, uint256 treasuryFee) {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        uint256 privateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address account = vm.addr(privateKey);
        address expectedAccount = vm.envAddress("ADMIN_ADDRESS");
        if (account != expectedAccount) revert SignerMismatch(expectedAccount, account);

        uint256 shares = vm.envUint("CASH_CANARY_REDEEM_SHARES");
        if (shares == 0) revert InvalidAmount();

        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        if (vault.cashOperationsPaused()) revert CashOperationsPaused();

        uint256 sharesBefore = vault.balanceOf(account);
        if (sharesBefore < shares) revert InsufficientShares(sharesBefore, shares);

        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        address treasury = FeeModule(vm.envAddress("FEE_MODULE_ADDRESS")).treasury();
        uint256 treasuryBefore = usdg.balanceOf(treasury);

        vm.startBroadcast(privateKey);
        returnedAssets = vault.redeem(shares, account, account);
        vm.stopBroadcast();

        uint256 expectedShares = sharesBefore - shares;
        uint256 actualShares = vault.balanceOf(account);
        if (actualShares != expectedShares) {
            revert UnexpectedShareBalance(expectedShares, actualShares);
        }

        treasuryFee = usdg.balanceOf(treasury) - treasuryBefore;
        if (treasuryFee == 0) revert FeeNotCollected();

        emit MainnetCashRedeemCanaryCompleted(account, shares, returnedAssets, treasuryFee);
    }
}
