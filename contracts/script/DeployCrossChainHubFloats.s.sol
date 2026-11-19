// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { FLOATSOFTAdapter } from "../src/crosschain/FLOATSOFTAdapter.sol";
import { CrossChainDeploymentBase } from "./CrossChainDeploymentBase.s.sol";

/// @notice Deploys the FLOATS adapter only after a canonical testnet token is configured.
contract DeployCrossChainHubFloats is CrossChainDeploymentBase {
    event HubFloatsDeployed(string version, address indexed floatsAdapter, address indexed token);

    function run() external returns (FLOATSOFTAdapter floatsAdapter) {
        address endpoint = _validatedEndpoint(
            "CROSSCHAIN_HUB_CHAIN_ID", "CROSSCHAIN_HUB_EID", "CROSSCHAIN_HUB_ENDPOINT_V2"
        );
        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address floats = vm.envAddress("FLOATS_CONTRACT_ADDRESS");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        (bytes32 root, string memory version) = _deploymentRoot("FLOATS_SEPOLIA_REHEARSAL_HUB");

        vm.startBroadcast(key);
        floatsAdapter = new FLOATSOFTAdapter{ salt: _salt(root, "FLOATS_ADAPTER") }(
            floats, endpoint, governance, guardian
        );
        vm.stopBroadcast();

        emit HubFloatsDeployed(version, address(floatsAdapter), floats);
    }
}
