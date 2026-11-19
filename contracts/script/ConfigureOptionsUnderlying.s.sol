// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { NavOracle } from "../src/oracle/NavOracle.sol";
import { OptionsPriceOracle } from "../src/options/OptionsPriceOracle.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";

interface ConfigureOptionsUnderlyingVm {
    function envAddress(string calldata name) external returns (address value);
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Configures one verified options underlying without requiring fIPO membership.
abstract contract OptionsUnderlyingConfiguration {
    ConfigureOptionsUnderlyingVm internal constant vm =
        ConfigureOptionsUnderlyingVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error InvalidAddress();
    error InvalidAssetUid();
    error InvalidOracleMaxAge(uint256 maxAge);

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
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        address underlying = vm.envAddress("OPTIONS_UNDERLYING_TOKEN_ADDRESS");
        address feed = vm.envAddress("OPTIONS_UNDERLYING_FEED_ADDRESS");
        bytes32 uid = vm.envBytes32("OPTIONS_UNDERLYING_ASSET_UID");
        uint256 rawMaxAge = vm.envUint("OPTIONS_UNDERLYING_ORACLE_MAX_AGE");
        if (underlying == address(0) || feed == address(0)) revert InvalidAddress();
        if (uid == bytes32(0)) revert InvalidAssetUid();
        if (rawMaxAge == 0 || rawMaxAge > 60 seconds) revert InvalidOracleMaxAge(rawMaxAge);

        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        NavOracle navOracle = NavOracle(vm.envAddress("NAV_ORACLE_ADDRESS"));
        OptionsPriceOracle optionsOracle =
            OptionsPriceOracle(vm.envAddress("OPTIONS_PRICE_ORACLE_ADDRESS"));
        SeriesRegistry registry = SeriesRegistry(vm.envAddress("OPTIONS_SERIES_REGISTRY_ADDRESS"));

        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory maxAges = new uint32[](1);
        tokens[0] = underlying;
        feeds[0] = feed;
        maxAges[0] = uint32(rawMaxAge);

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(navOracle);
        payloads[0] = abi.encodeCall(NavOracle.configureFeeds, (tokens, feeds, maxAges));
        targets[1] = address(registry);
        payloads[1] = abi.encodeCall(
            SeriesRegistry.configureUnderlying, (underlying, uid, address(optionsOracle), true)
        );
        salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_UNDERLYING_V1",
                block.chainid,
                underlying,
                feed,
                uid,
                rawMaxAge,
                vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }

    function _schedule(
        TimelockController timelock,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory payloads,
        bytes32 salt
    ) internal returns (bytes32 operationId) {
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }

    function _execute(
        TimelockController timelock,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory payloads,
        bytes32 salt
    ) internal returns (bytes32 operationId) {
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleOptionsUnderlying is OptionsUnderlyingConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        return _schedule(timelock, targets, values, payloads, salt);
    }
}

contract ExecuteOptionsUnderlying is OptionsUnderlyingConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        return _execute(timelock, targets, values, payloads, salt);
    }
}
