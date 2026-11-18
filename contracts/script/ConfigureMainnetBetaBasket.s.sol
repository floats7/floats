// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { NavOracle } from "../src/oracle/NavOracle.sol";

interface MainnetBetaVm {
    function envAddress(string calldata name) external returns (address value);
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Data-driven governance operations for the capped two-asset mainnet beta basket.
abstract contract MainnetBetaBasketConfiguration {
    MainnetBetaVm internal constant vm =
        MainnetBetaVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;
    uint16 private constant CONSTITUENT_WEIGHT_BPS = 5_000;

    error MainnetOnly(uint256 chainId);

    function _guardMainnet() internal view {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);
    }

    function _inputs()
        internal
        returns (IndexRegistry.ConstituentInput[] memory inputs)
    {
        address firstToken = vm.envAddress("BETA_FIRST_TOKEN_ADDRESS");
        address secondToken = vm.envAddress("BETA_SECOND_TOKEN_ADDRESS");
        inputs = new IndexRegistry.ConstituentInput[](2);
        inputs[0] = IndexRegistry.ConstituentInput({
            token: firstToken,
            feed: vm.envAddress("BETA_FIRST_FEED_ADDRESS"),
            uid: vm.envBytes32("BETA_FIRST_ASSET_UID"),
            targetWeightBps: CONSTITUENT_WEIGHT_BPS,
            eligibleFrom: uint48(vm.envUint("BETA_FIRST_ELIGIBLE_FROM")),
            exitAfter: uint48(vm.envUint("BETA_FIRST_EXIT_AFTER"))
        });
        inputs[1] = IndexRegistry.ConstituentInput({
            token: secondToken,
            feed: vm.envAddress("BETA_SECOND_FEED_ADDRESS"),
            uid: vm.envBytes32("BETA_SECOND_ASSET_UID"),
            targetWeightBps: CONSTITUENT_WEIGHT_BPS,
            eligibleFrom: uint48(vm.envUint("BETA_SECOND_ELIGIBLE_FROM")),
            exitAfter: uint48(vm.envUint("BETA_SECOND_EXIT_AFTER"))
        });
    }

    function _setupOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        _guardMainnet();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        NavOracle oracle = NavOracle(vm.envAddress("NAV_ORACLE_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _inputs();
        uint48 validAfter = uint48(vm.envUint("BETA_REGISTRY_VALID_AFTER"));

        address[] memory tokens = new address[](2);
        address[] memory feeds = new address[](2);
        uint32[] memory maxAges = new uint32[](2);
        uint32 maxAge = uint32(vm.envUint("BETA_ORACLE_MAX_AGE"));
        for (uint256 i; i < 2; ++i) {
            tokens[i] = inputs[i].token;
            feeds[i] = inputs[i].feed;
            maxAges[i] = maxAge;
        }

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(oracle);
        payloads[0] = abi.encodeCall(NavOracle.configureFeeds, (tokens, feeds, maxAges));
        targets[1] = address(registry);
        payloads[1] = abi.encodeCall(IndexRegistry.proposeConfiguration, (inputs, validAfter));
        salt = keccak256(abi.encode("FLOATS_MAINNET_BETA_SETUP_V1", inputs, validAfter));
    }

    function _activationOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        _guardMainnet();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _inputs();
        targets = new address[](1);
        values = new uint256[](1);
        payloads = new bytes[](1);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(IndexRegistry.executeConfiguration, (inputs));
        salt = keccak256(abi.encode("FLOATS_MAINNET_BETA_ACTIVATION_V1", inputs));
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
        timelock.scheduleBatch(
            targets, values, payloads, bytes32(0), salt, timelock.getMinDelay()
        );
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

contract ScheduleMainnetBetaBasketSetup is MainnetBetaBasketConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _setupOperation();
        return _schedule(timelock, targets, values, payloads, salt);
    }
}

contract ExecuteMainnetBetaBasketSetup is MainnetBetaBasketConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _setupOperation();
        return _execute(timelock, targets, values, payloads, salt);
    }
}

contract ScheduleMainnetBetaBasketActivation is MainnetBetaBasketConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _activationOperation();
        return _schedule(timelock, targets, values, payloads, salt);
    }
}

contract ExecuteMainnetBetaBasketActivation is MainnetBetaBasketConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _activationOperation();
        return _execute(timelock, targets, values, payloads, salt);
    }
}
