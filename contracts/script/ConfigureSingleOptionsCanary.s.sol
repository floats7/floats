// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { OptionsPriceOracle } from "../src/options/OptionsPriceOracle.sol";
import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";

interface ConfigureSingleOptionsCanaryVm {
    function envAddress(string calldata name) external returns (address value);
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Creates one minimum-size series for a verified, independently configured underlying.
abstract contract SingleOptionsCanaryConfiguration {
    ConfigureSingleOptionsCanaryVm internal constant vm =
        ConfigureSingleOptionsCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error InvalidCanaryTerms();

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

        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        SeriesRegistry registry = SeriesRegistry(vm.envAddress("OPTIONS_SERIES_REGISTRY_ADDRESS"));
        OptionsPriceOracle oracle =
            OptionsPriceOracle(vm.envAddress("OPTIONS_PRICE_ORACLE_ADDRESS"));
        address underlying = vm.envAddress("OPTIONS_UNDERLYING_TOKEN_ADDRESS");
        bytes32 uid = vm.envBytes32("OPTIONS_UNDERLYING_ASSET_UID");
        uint48 expiry = uint48(vm.envUint("OPTIONS_CANARY_EXPIRY"));
        uint256 contractSize18 = vm.envUint("OPTIONS_CANARY_CONTRACT_SIZE_18");
        (uint256 spot, bool healthy) = oracle.currentPrice(underlying);
        if (
            !healthy || spot == 0 || uid == bytes32(0) || expiry <= block.timestamp
                || contractSize18 == 0
        ) {
            revert InvalidCanaryTerms();
        }

        OptionsTypes.SeriesTerms memory terms = OptionsTypes.SeriesTerms({
            underlying: underlying,
            underlyingUid: uid,
            priceSource: address(oracle),
            kind: OptionsTypes.OptionKind.CappedCall,
            strikeUsd18: spot,
            capUsd18: spot * 150 / 100,
            expiry: expiry,
            contractSize18: contractSize18,
            corporateActionPolicyVersion: 1
        });
        targets = new address[](1);
        values = new uint256[](1);
        payloads = new bytes[](1);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(SeriesRegistry.createSeries, (terms));
        salt = keccak256(
            abi.encode(
                "FLOATS_SINGLE_OPTIONS_CANARY_V1",
                block.chainid,
                terms,
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

contract ScheduleSingleOptionsCanary is SingleOptionsCanaryConfiguration {
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

contract ExecuteSingleOptionsCanary is SingleOptionsCanaryConfiguration {
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
