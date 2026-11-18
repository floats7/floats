// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";
import { FeeModule } from "../src/fees/FeeModule.sol";

interface MainnetCashCanaryVm {
    function addr(uint256 privateKey) external returns (address account);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Executes a minimum-value cash deposit/redeem round trip on mainnet.
contract RunMainnetCashFeeCanary {
    MainnetCashCanaryVm private constant vm =
        MainnetCashCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error AllowanceNotCleared(uint256 remaining);
    error CashOperationsPaused();
    error FeeNotCollected();
    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidAmount();
    error MainnetOnly(uint256 chainId);
    error SignerMismatch(address expected, address actual);
    error UnexpectedShareBalance(uint256 expected, uint256 actual);

    struct CanaryState {
        IERC20 usdg;
        FloatsVault vault;
        address account;
        address treasury;
        uint256 assets;
        uint256 sharesBefore;
        uint256 treasuryAssetsBefore;
    }

    event MainnetCashFeeCanaryCompleted(
        address indexed account,
        uint256 mintedShares,
        uint256 returnedAssets,
        uint256 treasuryFee
    );

    function run()
        external
        returns (uint256 shares, uint256 returnedAssets, uint256 treasuryFee)
    {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        uint256 privateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        CanaryState memory state;
        state.account = vm.addr(privateKey);
        address expectedAccount = vm.envAddress("ADMIN_ADDRESS");
        if (state.account != expectedAccount) {
            revert SignerMismatch(expectedAccount, state.account);
        }

        state.assets = vm.envUint("CASH_CANARY_USDG_AMOUNT");
        if (state.assets == 0) revert InvalidAmount();
        state.usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        state.vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        FeeModule feeModule = FeeModule(vm.envAddress("FEE_MODULE_ADDRESS"));
        if (state.vault.cashOperationsPaused() || state.vault.depositsPaused()) {
            revert CashOperationsPaused();
        }

        uint256 accountAssets = state.usdg.balanceOf(state.account);
        if (accountAssets < state.assets) {
            revert InsufficientBalance(accountAssets, state.assets);
        }
        state.sharesBefore = state.vault.balanceOf(state.account);
        state.treasury = feeModule.treasury();
        state.treasuryAssetsBefore = state.usdg.balanceOf(state.treasury);

        vm.startBroadcast(privateKey);
        state.usdg.approve(address(state.vault), state.assets);
        shares = state.vault.deposit(state.assets, state.account);
        returnedAssets = state.vault.redeem(shares, state.account, state.account);
        vm.stopBroadcast();

        treasuryFee = _verify(state);
        emit MainnetCashFeeCanaryCompleted(
            state.account, shares, returnedAssets, treasuryFee
        );
    }

    function _verify(CanaryState memory state) private view returns (uint256 treasuryFee) {
        uint256 actualShares = state.vault.balanceOf(state.account);
        if (actualShares != state.sharesBefore) {
            revert UnexpectedShareBalance(state.sharesBefore, actualShares);
        }
        uint256 allowance = state.usdg.allowance(state.account, address(state.vault));
        if (allowance != 0) revert AllowanceNotCleared(allowance);
        treasuryFee = state.usdg.balanceOf(state.treasury) - state.treasuryAssetsBefore;
        if (treasuryFee == 0) revert FeeNotCollected();
    }
}
