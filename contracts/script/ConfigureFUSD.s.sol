// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FUSDVault } from "../src/fusd/FUSDVault.sol";
import { IFUSDStrategy } from "../src/fusd/interfaces/IFUSDStrategy.sol";

interface ConfigureFUSDVm {
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Schedules or executes the one-time fUSD strategy configuration through governance.
abstract contract FUSDConfiguration {
    ConfigureFUSDVm internal constant vm =
        ConfigureFUSDVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4663;

    error MainnetOnly(uint256 chainId);

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
        if (block.chainid != MAINNET_CHAIN_ID) {
            revert MainnetOnly(block.chainid);
        }
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        FUSDVault vault = FUSDVault(vm.envAddress("FUSD_VAULT_ADDRESS"));
        IFUSDStrategy strategy = IFUSDStrategy(vm.envAddress("FUSD_STRATEGY_ADDRESS"));
        targets = new address[](1);
        values = new uint256[](1);
        payloads = new bytes[](1);
        targets[0] = address(vault);
        payloads[0] = abi.encodeCall(FUSDVault.configureStrategy, (strategy));
        salt = keccak256(
            abi.encode("FLOATS_FUSD_MAINNET_STRATEGY_V1", address(vault), address(strategy))
        );
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
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
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

contract ScheduleFUSDConfiguration is FUSDConfiguration {
    function run() external returns (bytes32 operationId) {
        return _schedule();
    }
}

contract ExecuteFUSDConfiguration is FUSDConfiguration {
    function run() external returns (bytes32 operationId) {
        return _execute();
    }
}
