// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fIPO_OFT } from "../src/crosschain/fIPO_OFT.sol";
import { NavMirror } from "../src/crosschain/NavMirror.sol";
import { CrossChainDeploymentBase } from "./CrossChainDeploymentBase.s.sol";

/// @notice Deploys the rehearsal fIPO representation and NAV mirror on Ethereum Sepolia.
contract DeployCrossChainSpokeFipoAndNav is CrossChainDeploymentBase {
    event SpokeFipoAndNavDeployed(
        string version, address indexed fipoOft, address indexed navMirror
    );

    function run() external returns (fIPO_OFT fipoOft, NavMirror navMirror) {
        address endpoint = _validatedEndpoint(
            "CROSSCHAIN_SPOKE_CHAIN_ID", "CROSSCHAIN_SPOKE_EID", "CROSSCHAIN_SPOKE_ENDPOINT_V2"
        );
        address governance = vm.envAddress("CROSSCHAIN_SPOKE_TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("CROSSCHAIN_SPOKE_GUARDIAN_ADDRESS");
        uint256 maxStaleness = vm.envUint("CROSSCHAIN_NAV_MAX_STALENESS_SECONDS");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        (bytes32 root, string memory version) = _deploymentRoot("FLOATS_SEPOLIA_REHEARSAL_SPOKE");

        vm.startBroadcast(key);
        fipoOft = new fIPO_OFT{ salt: _salt(root, "FIPO_OFT") }(endpoint, governance, guardian);
        navMirror =
            new NavMirror{ salt: _salt(root, "NAV_MIRROR") }(endpoint, governance, maxStaleness);
        vm.stopBroadcast();

        emit SpokeFipoAndNavDeployed(version, address(fipoOft), address(navMirror));
    }
}
