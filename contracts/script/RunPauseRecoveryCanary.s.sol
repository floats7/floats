// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";

interface PauseRecoveryVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract PauseRecoveryBase {
    PauseRecoveryVm internal constant vm =
        PauseRecoveryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error SignerDoesNotMatchRole(address signer, address expectedRole);

    function _validatedKey(string memory keyName, string memory addressName)
        internal
        returns (uint256 key)
    {
        key = vm.envUint(keyName);
        address signer = vm.addr(key);
        address expectedRole = vm.envAddress(addressName);
        if (signer != expectedRole) revert SignerDoesNotMatchRole(signer, expectedRole);
    }

    function _recoveryOperation()
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
        targets = new address[](2);
        targets[0] = address(vault);
        targets[1] = address(vault);
        values = new uint256[](2);
        payloads = new bytes[](2);
        payloads[0] = abi.encodeCall(FloatsVault.setDepositsPaused, (false));
        payloads[1] = abi.encodeCall(FloatsVault.setCashOperationsPaused, (false));
        salt = keccak256(
            abi.encode(
                "FLOATS_VAULT_RECOVERY",
                block.chainid,
                vm.envString("DEPLOYMENT_VERSION"),
                vm.envUint("RECOVERY_SEQUENCE")
            )
        );
    }
}

contract RunGuardianPauseCanary is PauseRecoveryBase {
    function run() external {
        uint256 guardianKey = _validatedKey("GUARDIAN_PRIVATE_KEY", "GUARDIAN_ADDRESS");
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        vm.startBroadcast(guardianKey);
        vault.setDepositsPaused(true);
        vault.setCashOperationsPaused(true);
        vm.stopBroadcast();
    }
}

contract ScheduleVaultRecovery is PauseRecoveryBase {
    function run() external returns (bytes32 operationId) {
        uint256 adminKey = _validatedKey("ADMIN_PRIVATE_KEY", "ADMIN_ADDRESS");
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _recoveryOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(adminKey);
        timelock.scheduleBatch(
            targets, values, payloads, bytes32(0), salt, timelock.getMinDelay()
        );
        vm.stopBroadcast();
    }
}

contract ExecuteVaultRecovery is PauseRecoveryBase {
    function run() external returns (bytes32 operationId) {
        uint256 adminKey = _validatedKey("ADMIN_PRIVATE_KEY", "ADMIN_ADDRESS");
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _recoveryOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(adminKey);
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}
