// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FeeModule } from "../src/fees/FeeModule.sol";

interface MainnetFeesVm {
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Timelock operations for the approved mainnet beta fee policy.
abstract contract MainnetFeesConfiguration {
    MainnetFeesVm internal constant vm =
        MainnetFeesVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error MainnetOnly(uint256 chainId);
    error RateOutOfRange(uint256 rate);

    function _rate(string memory name) private returns (uint16 value) {
        uint256 raw = vm.envUint(name);
        if (raw > type(uint16).max) revert RateOutOfRange(raw);
        value = uint16(raw);
    }

    function _operation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        FeeModule feeModule = FeeModule(vm.envAddress("FEE_MODULE_ADDRESS"));
        FeeModule.Rates memory rates = FeeModule.Rates({
            managementBps: _rate("MAINNET_MANAGEMENT_FEE_BPS"),
            cashBps: _rate("MAINNET_CASH_FEE_BPS"),
            inKindBps: _rate("MAINNET_IN_KIND_FEE_BPS"),
            offHoursBps: _rate("MAINNET_OFF_HOURS_FEE_BPS")
        });

        targets = new address[](1);
        values = new uint256[](1);
        payloads = new bytes[](1);
        targets[0] = address(feeModule);
        payloads[0] = abi.encodeCall(FeeModule.setRates, (rates));
        salt = keccak256(abi.encode("FLOATS_MAINNET_FEE_POLICY_V1", rates));
    }

    function _schedule() internal returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(
            targets, values, payloads, bytes32(0), salt, timelock.getMinDelay()
        );
        vm.stopBroadcast();
    }

    function _execute() internal returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleMainnetFees is MainnetFeesConfiguration {
    function run() external returns (bytes32 operationId) {
        return _schedule();
    }
}

contract ExecuteMainnetFees is MainnetFeesConfiguration {
    function run() external returns (bytes32 operationId) {
        return _execute();
    }
}
