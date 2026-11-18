// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FeeModule } from "../src/fees/FeeModule.sol";

interface MainnetAccrualVm {
    function addr(uint256 privateKey) external returns (address account);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Executes and verifies one bounded management-fee accrual on mainnet.
contract AccrueMainnetManagementFee {
    MainnetAccrualVm private constant vm =
        MainnetAccrualVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error MainnetOnly(uint256 chainId);
    error SignerMismatch(address expected, address actual);
    error TreasuryBalanceMismatch(uint256 expected, uint256 actual);

    event MainnetManagementFeeAccrued(address indexed treasury, uint256 shares);

    function run() external returns (uint256 shares) {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        uint256 privateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address account = vm.addr(privateKey);
        address expectedAccount = vm.envAddress("ADMIN_ADDRESS");
        if (account != expectedAccount) revert SignerMismatch(expectedAccount, account);

        FeeModule feeModule = FeeModule(vm.envAddress("FEE_MODULE_ADDRESS"));
        address treasury = feeModule.treasury();
        IERC20 vault = IERC20(address(feeModule.vault()));
        uint256 balanceBefore = vault.balanceOf(treasury);

        vm.startBroadcast(privateKey);
        shares = feeModule.accrue();
        vm.stopBroadcast();

        uint256 expectedBalance = balanceBefore + shares;
        uint256 actualBalance = vault.balanceOf(treasury);
        if (actualBalance != expectedBalance) {
            revert TreasuryBalanceMismatch(expectedBalance, actualBalance);
        }
        emit MainnetManagementFeeAccrued(treasury, shares);
    }
}
