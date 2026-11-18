// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { OptionsPriceOracle } from "../src/options/OptionsPriceOracle.sol";
import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";

interface ConfigureOptionsCanaryVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract OptionsCanaryConfiguration {
    ConfigureOptionsCanaryVm internal constant vm =
        ConfigureOptionsCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        address[] memory tokens = coreRegistry.getActiveTokens();
        uint48 expiry = uint48(vm.envUint("OPTIONS_CANARY_EXPIRY"));
        _validateExpiry(expiry);

        targets = new address[](tokens.length * 2);
        values = new uint256[](tokens.length * 2);
        payloads = new bytes[](tokens.length * 2);
        for (uint256 i; i < tokens.length; ++i) {
            IndexRegistry.Constituent memory constituent = coreRegistry.getConstituent(tokens[i]);
            (uint256 spot, bool healthy) = priceOracle.currentPrice(tokens[i]);
            if (!healthy || spot == 0) revert("underlying price unavailable");
            OptionsTypes.SeriesTerms memory callTerms = OptionsTypes.SeriesTerms({
                underlying: tokens[i],
                underlyingUid: constituent.uid,
                priceSource: address(priceOracle),
                kind: OptionsTypes.OptionKind.CappedCall,
                strikeUsd18: spot,
                capUsd18: spot * 120 / 100,
                expiry: expiry,
                contractSize18: 1e18,
                corporateActionPolicyVersion: 1
            });
            OptionsTypes.SeriesTerms memory putTerms = OptionsTypes.SeriesTerms({
                underlying: tokens[i],
                underlyingUid: constituent.uid,
                priceSource: address(priceOracle),
                kind: OptionsTypes.OptionKind.Put,
                strikeUsd18: spot,
                capUsd18: 0,
                expiry: expiry,
                contractSize18: 1e18,
                corporateActionPolicyVersion: 1
            });
            targets[i * 2] = address(optionsRegistry);
            payloads[i * 2] = abi.encodeCall(SeriesRegistry.createSeries, (callTerms));
            targets[i * 2 + 1] = address(optionsRegistry);
            payloads[i * 2 + 1] = abi.encodeCall(SeriesRegistry.createSeries, (putTerms));
        }
        salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_CANARY", block.chainid, vm.envString("DEPLOYMENT_VERSION"), expiry
            )
        );
    }

    function _validateExpiry(uint48 expiry) private view {
        if (expiry <= block.timestamp + 1 days) revert("canary expiry too close");
        // Friday at 16:00 New York is 20:00 or 21:00 UTC, depending on DST.
        if ((uint256(expiry) / 1 days) % 7 != 1) revert("canary expiry must be Friday");
        uint256 utcTime = uint256(expiry) % 1 days;
        if (utcTime != 20 hours && utcTime != 21 hours) {
            revert("canary expiry must be 16:00 America/New_York");
        }
    }
}

contract ScheduleOptionsCanary is OptionsCanaryConfiguration {
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

contract ExecuteOptionsCanary is OptionsCanaryConfiguration {
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
