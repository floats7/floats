// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { RiskManager } from "../src/options/RiskManager.sol";

interface ConfigureOptionsRiskLimitsVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Applies conservative protocol limits before a launch underlying is enabled.
abstract contract OptionsRiskLimitsConfiguration {
    ConfigureOptionsRiskLimitsVm internal constant vm =
        ConfigureOptionsRiskLimitsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error InvalidLaunchUnderlyingLimit(uint256 bps);
    error InvalidLimit(uint256 bps);
    error MissingCode(address target);

    function _operation()
        internal
        returns (TimelockController timelock, address target, bytes memory payload, bytes32 salt)
    {
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        RiskManager riskManager = RiskManager(vm.envAddress("OPTIONS_RISK_MANAGER_ADDRESS"));
        if (address(timelock).code.length == 0) revert MissingCode(address(timelock));
        if (address(riskManager).code.length == 0) revert MissingCode(address(riskManager));

        uint256 utilizationBps = vm.envUint("OPTIONS_RISK_UTILIZATION_BPS");
        uint256 underlyingBps = vm.envUint("OPTIONS_RISK_UNDERLYING_BPS");
        uint256 expiryBps = vm.envUint("OPTIONS_RISK_EXPIRY_BPS");
        uint256 seriesBps = vm.envUint("OPTIONS_RISK_SERIES_BPS");
        if (underlyingBps == 0 || underlyingBps > 500) {
            revert InvalidLaunchUnderlyingLimit(underlyingBps);
        }
        if (
            utilizationBps == 0 || utilizationBps > 9000 || expiryBps == 0 || expiryBps > 6000
                || seriesBps == 0 || seriesBps > 2500
        ) revert InvalidLimit(0);

        RiskManager.Limits memory limits = RiskManager.Limits({
            utilizationBps: uint16(utilizationBps),
            underlyingBps: uint16(underlyingBps),
            expiryBps: uint16(expiryBps),
            seriesBps: uint16(seriesBps)
        });
        target = address(riskManager);
        payload = abi.encodeCall(RiskManager.setLimits, (limits));
        salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_LAUNCH_RISK_V1",
                block.chainid,
                limits.utilizationBps,
                limits.underlyingBps,
                limits.expiryBps,
                limits.seriesBps,
                vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }

    function _schedule(
        TimelockController timelock,
        address target,
        bytes memory payload,
        bytes32 salt
    ) internal returns (bytes32 operationId) {
        operationId = timelock.hashOperation(target, 0, payload, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.schedule(target, 0, payload, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }

    function _execute(
        TimelockController timelock,
        address target,
        bytes memory payload,
        bytes32 salt
    ) internal returns (bytes32 operationId) {
        operationId = timelock.hashOperation(target, 0, payload, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.execute(target, 0, payload, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleOptionsRiskLimits is OptionsRiskLimitsConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address target, bytes memory payload, bytes32 salt) =
            _operation();
        return _schedule(timelock, target, payload, salt);
    }
}

contract ExecuteOptionsRiskLimits is OptionsRiskLimitsConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address target, bytes memory payload, bytes32 salt) =
            _operation();
        return _execute(timelock, target, payload, salt);
    }
}
