// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";

interface OptionsExpiryRemediationVm {
    function envAddress(string calldata name) external returns (address value);
    function envBytes32(string calldata name, string calldata delimiter)
        external
        returns (bytes32[] memory value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract OptionsExpiryRemediation {
    OptionsExpiryRemediationVm internal constant vm =
        OptionsExpiryRemediationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        SeriesRegistry registry = SeriesRegistry(vm.envAddress("OPTIONS_SERIES_REGISTRY_ADDRESS"));
        bytes32[] memory incorrectSeries = vm.envBytes32("OPTIONS_INCORRECT_EXPIRY_SERIES_IDS", ",");
        uint48 replacementExpiry = uint48(vm.envUint("OPTIONS_CANARY_EXPIRY"));

        if (incorrectSeries.length == 0) revert("no incorrect series supplied");
        if (replacementExpiry <= block.timestamp + 1 days) revert("replacement expiry too close");
        uint256 utcTime = uint256(replacementExpiry) % 1 days;
        if ((uint256(replacementExpiry) / 1 days) % 7 != 1) {
            revert("replacement expiry must be Friday");
        }
        if (utcTime != 20 hours && utcTime != 21 hours) {
            revert("replacement expiry must be 16:00 America/New_York");
        }

        targets = new address[](incorrectSeries.length * 2);
        values = new uint256[](incorrectSeries.length * 2);
        payloads = new bytes[](incorrectSeries.length * 2);

        for (uint256 i; i < incorrectSeries.length; ++i) {
            (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
                registry.getSeries(incorrectSeries[i]);
            if (state != OptionsTypes.SeriesState.Active) revert("incorrect series is not active");
            if (terms.expiry == replacementExpiry) revert("replacement expiry unchanged");

            targets[i * 2] = address(registry);
            payloads[i * 2] = abi.encodeCall(
                SeriesRegistry.setSeriesState,
                (incorrectSeries[i], OptionsTypes.SeriesState.Suspended)
            );

            terms.expiry = replacementExpiry;
            bytes32 replacementId = registry.computeSeriesId(terms);
            if (registry.seriesExists(replacementId)) revert("replacement series already exists");
            targets[i * 2 + 1] = address(registry);
            payloads[i * 2 + 1] = abi.encodeCall(SeriesRegistry.createSeries, (terms));
        }

        salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_EXPIRY_REMEDIATION",
                block.chainid,
                vm.envString("DEPLOYMENT_VERSION"),
                replacementExpiry,
                incorrectSeries
            )
        );
    }
}

contract ScheduleOptionsExpiryRemediation is OptionsExpiryRemediation {
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

contract ExecuteOptionsExpiryRemediation is OptionsExpiryRemediation {
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
