// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";
import { FeeModule } from "../src/fees/FeeModule.sol";
import { Rebalancer } from "../src/rebalance/Rebalancer.sol";
import { SwapAdapter } from "../src/swap/SwapAdapter.sol";

interface ConfigureVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function addr(uint256 privateKey) external returns (address keyAddr);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Schedules or executes the one-time Core wiring through the production timelock.
abstract contract CoreConfiguration {
    ConfigureVm internal constant vm =
        ConfigureVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        FeeModule feeModule = FeeModule(vm.envAddress("FEE_MODULE_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        SwapAdapter swapAdapter = SwapAdapter(vm.envAddress("SWAP_ADAPTER_ADDRESS"));

        targets = new address[](8);
        values = new uint256[](8);
        payloads = new bytes[](8);

        targets[0] = address(vault);
        payloads[0] = abi.encodeCall(FloatsVault.setFeeModule, (address(feeModule)));
        targets[1] = address(vault);
        payloads[1] = abi.encodeCall(FloatsVault.setRebalancer, (address(rebalancer)));
        targets[2] = address(swapAdapter);
        payloads[2] = abi.encodeCall(SwapAdapter.setExecutor, (address(rebalancer), true));
        targets[3] = address(rebalancer);
        payloads[3] = abi.encodeCall(
            Rebalancer.setKeeper, (vm.envAddress("KEEPER_ADDRESS"), true)
        );
        targets[4] = address(feeModule);
        payloads[4] = abi.encodeCall(
            FeeModule.setRates,
            (
                FeeModule.Rates({
                    managementBps: uint16(vm.envUint("MANAGEMENT_FEE_BPS")),
                    cashBps: uint16(vm.envUint("CASH_FEE_BPS")),
                    inKindBps: uint16(vm.envUint("IN_KIND_FEE_BPS")),
                    offHoursBps: uint16(vm.envUint("OFF_HOURS_FEE_BPS"))
                })
            )
        );
        address deployer = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        targets[5] = address(timelock);
        payloads[5] = abi.encodeCall(
            timelock.revokeRole, (timelock.PROPOSER_ROLE(), deployer)
        );
        targets[6] = address(timelock);
        payloads[6] = abi.encodeCall(
            timelock.revokeRole, (timelock.CANCELLER_ROLE(), deployer)
        );
        targets[7] = address(timelock);
        payloads[7] = abi.encodeCall(
            timelock.revokeRole, (timelock.EXECUTOR_ROLE(), deployer)
        );
        salt = keccak256(
            abi.encode("FLOATS_CORE_CONFIGURATION", block.chainid, vm.envString("DEPLOYMENT_VERSION"))
        );
    }
}

contract ScheduleCoreConfiguration is CoreConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        timelock.scheduleBatch(
            targets, values, payloads, bytes32(0), salt, timelock.getMinDelay()
        );
        vm.stopBroadcast();
    }
}

contract ExecuteCoreConfiguration is CoreConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}
