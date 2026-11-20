// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FUSDVault } from "../src/fusd/FUSDVault.sol";

interface ConfigureFUSDBufferBetaVm {
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Controls a minimum-cap, fully liquid fUSD beta without allocating USDG to Morpho.
abstract contract FUSDBufferBetaConfiguration {
    ConfigureFUSDBufferBetaVm internal constant vm =
        ConfigureFUSDBufferBetaVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant MAINNET_CHAIN_ID = 4663;
    uint256 private constant FULL_BUFFER_BPS = 10_000;
    uint256 private constant MAXIMUM_BETA_CAP = 10e6;

    error MainnetOnly(uint256 chainId);
    error InvalidBetaConfiguration();
    error VaultNotEmpty();

    enum Direction {
        Activate,
        Restore
    }

    function _operation(Direction direction)
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
        uint256 betaCap = vm.envUint("FUSD_BUFFER_BETA_TVL_CAP");
        uint256 betaBufferBps = vm.envUint("FUSD_BUFFER_BETA_BUFFER_BPS");
        uint256 sequence = vm.envUint("FUSD_BUFFER_BETA_SEQUENCE");
        if (
            betaCap == 0 || betaCap > MAXIMUM_BETA_CAP || betaBufferBps != FULL_BUFFER_BPS
                || sequence == 0
        ) revert InvalidBetaConfiguration();

        if (
            vault.totalAssets() != 0 || vault.totalSupply() != 0
                || vault.queuedWithdrawalAssets() != 0
        ) revert VaultNotEmpty();

        targets = new address[](3);
        values = new uint256[](3);
        payloads = new bytes[](3);
        targets[0] = address(vault);
        targets[1] = address(vault);
        targets[2] = address(vault);

        if (direction == Direction.Activate) {
            if (!vault.depositsPaused()) revert InvalidBetaConfiguration();
            payloads[0] = abi.encodeCall(FUSDVault.setTvlCap, (betaCap));
            payloads[1] = abi.encodeCall(FUSDVault.setTargetBufferBps, (betaBufferBps));
            payloads[2] = abi.encodeCall(FUSDVault.setDepositsPaused, (false));
            salt = keccak256(
                abi.encode("FLOATS_FUSD_BUFFER_BETA_ACTIVATE", address(vault), betaCap, sequence)
            );
        } else {
            payloads[0] = abi.encodeCall(FUSDVault.setDepositsPaused, (true));
            payloads[1] = abi.encodeCall(
                FUSDVault.setTargetBufferBps, (vm.envUint("FUSD_TARGET_BUFFER_BPS"))
            );
            payloads[2] = abi.encodeCall(FUSDVault.setTvlCap, (vm.envUint("FUSD_INITIAL_TVL_CAP")));
            salt = keccak256(
                abi.encode("FLOATS_FUSD_BUFFER_BETA_RESTORE", address(vault), sequence)
            );
        }
    }

    function _schedule(Direction direction) internal returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation(direction);
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }

    function _execute(Direction direction) internal returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation(direction);
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleFUSDBufferBeta is FUSDBufferBetaConfiguration {
    function run() external returns (bytes32 operationId) {
        return _schedule(Direction.Activate);
    }
}

contract ExecuteFUSDBufferBeta is FUSDBufferBetaConfiguration {
    function run() external returns (bytes32 operationId) {
        return _execute(Direction.Activate);
    }
}

contract ScheduleFUSDBufferBetaRestore is FUSDBufferBetaConfiguration {
    function run() external returns (bytes32 operationId) {
        return _schedule(Direction.Restore);
    }
}

contract ExecuteFUSDBufferBetaRestore is FUSDBufferBetaConfiguration {
    function run() external returns (bytes32 operationId) {
        return _execute(Direction.Restore);
    }
}
