// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fIPOOFTAdapter } from "../src/crosschain/fIPOOFTAdapter.sol";
import { NavPublisher } from "../src/crosschain/NavPublisher.sol";
import { CrossChainDeploymentBase } from "./CrossChainDeploymentBase.s.sol";

/// @notice Deploys the rehearsal fIPO adapter and NAV publisher on Robinhood Testnet.
contract DeployCrossChainHubFipoAndNav is CrossChainDeploymentBase {
    event HubFipoAndNavDeployed(
        string version, address indexed fipoAdapter, address indexed navPublisher
    );

    function run() external returns (fIPOOFTAdapter fipoAdapter, NavPublisher navPublisher) {
        address endpoint = _validatedEndpoint(
            "CROSSCHAIN_HUB_CHAIN_ID", "CROSSCHAIN_HUB_EID", "CROSSCHAIN_HUB_ENDPOINT_V2"
        );
        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address fipo = vm.envAddress("FLOATS_VAULT_ADDRESS");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        (bytes32 root, string memory version) = _deploymentRoot("FLOATS_SEPOLIA_REHEARSAL_HUB");

        vm.startBroadcast(key);
        fipoAdapter = new fIPOOFTAdapter{ salt: _salt(root, "FIPO_ADAPTER") }(
            fipo, endpoint, governance, guardian
        );
        navPublisher = new NavPublisher{ salt: _salt(root, "NAV_PUBLISHER") }(
            fipo, endpoint, governance, keeper
        );
        vm.stopBroadcast();

        emit HubFipoAndNavDeployed(version, address(fipoAdapter), address(navPublisher));
    }
}
