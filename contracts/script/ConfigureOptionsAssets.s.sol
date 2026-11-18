// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { OptionsPriceOracle } from "../src/options/OptionsPriceOracle.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";

interface ConfigureOptionsAssetsVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract OptionsAssetConfiguration {
    ConfigureOptionsAssetsVm internal constant vm =
        ConfigureOptionsAssetsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        IndexRegistry coreRegistry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        SeriesRegistry optionsRegistry =
            SeriesRegistry(vm.envAddress("OPTIONS_SERIES_REGISTRY_ADDRESS"));
        OptionsPriceOracle priceOracle =
            OptionsPriceOracle(vm.envAddress("OPTIONS_PRICE_ORACLE_ADDRESS"));
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address[] memory tokens = coreRegistry.getTrackedTokens();

        targets = new address[](tokens.length + 1);
        values = new uint256[](tokens.length + 1);
        payloads = new bytes[](tokens.length + 1);
        targets[0] = address(priceOracle);
        payloads[0] = abi.encodeCall(OptionsPriceOracle.setKeeper, (keeper, true));

        for (uint256 i; i < tokens.length; ++i) {
            IndexRegistry.Constituent memory constituent = coreRegistry.getConstituent(tokens[i]);
            bool enabled = constituent.status == IndexRegistry.Status.Active;
            targets[i + 1] = address(optionsRegistry);
            payloads[i + 1] = abi.encodeCall(
                SeriesRegistry.configureUnderlying,
                (tokens[i], constituent.uid, address(priceOracle), enabled)
            );
        }
        salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_ASSETS", block.chainid, vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }
}

contract ScheduleOptionsAssets is OptionsAssetConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }
}

contract ExecuteOptionsAssets is OptionsAssetConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}
