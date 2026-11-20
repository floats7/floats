// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsTypes } from "../src/perps/PerpsTypes.sol";

interface ActivatePerpsCanaryVm {
    function envAddress(string calldata name) external returns (address value);
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract PerpsCanaryActivation {
    ActivatePerpsCanaryVm internal constant vm =
        ActivatePerpsCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error DuplicateMarket();
    error InvalidMarket();

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
        PerpsMarketRegistry registry = PerpsMarketRegistry(vm.envAddress("PERPS_REGISTRY_ADDRESS"));
        PerpsLiquidityVault vault =
            PerpsLiquidityVault(vm.envAddress("PERPS_LIQUIDITY_VAULT_ADDRESS"));
        bytes32 firstMarket = vm.envBytes32("PERPS_CANARY_MARKET_ID_1");
        bytes32 secondMarket = vm.envBytes32("PERPS_CANARY_MARKET_ID_2");
        if (firstMarket == bytes32(0) || secondMarket == bytes32(0)) revert InvalidMarket();
        if (firstMarket == secondMarket) revert DuplicateMarket();

        targets = new address[](3);
        values = new uint256[](3);
        payloads = new bytes[](3);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(
            PerpsMarketRegistry.setMarketState,
            (firstMarket, PerpsTypes.MarketState.Active)
        );
        targets[1] = address(registry);
        payloads[1] = abi.encodeCall(
            PerpsMarketRegistry.setMarketState,
            (secondMarket, PerpsTypes.MarketState.Active)
        );
        targets[2] = address(vault);
        payloads[2] = abi.encodeCall(PerpsLiquidityVault.setOperationsPaused, (false));
        salt = keccak256(
            abi.encode(
                "FLOATS_PERPS_CANARY_ACTIVATION",
                block.chainid,
                vm.envString("PERPS_DEPLOYMENT_VERSION"),
                firstMarket,
                secondMarket
            )
        );
    }
}

contract SchedulePerpsCanaryActivation is PerpsCanaryActivation {
    function run() external returns (bytes32 operationId) {
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
}

contract ExecutePerpsCanaryActivation is PerpsCanaryActivation {
    function run() external returns (bytes32 operationId) {
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
