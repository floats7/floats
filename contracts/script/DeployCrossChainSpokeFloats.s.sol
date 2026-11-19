// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { FLOATS_OFT } from "../src/crosschain/FLOATS_OFT.sol";
import { CrossChainDeploymentBase } from "./CrossChainDeploymentBase.s.sol";

/// @notice Deploys the FLOATS representation independently from the fIPO/NAV rehearsal route.
contract DeployCrossChainSpokeFloats is CrossChainDeploymentBase {
    event SpokeFloatsDeployed(string version, address indexed floatsOft);

    function run() external returns (FLOATS_OFT floatsOft) {
        address endpoint = _validatedEndpoint(
            "CROSSCHAIN_SPOKE_CHAIN_ID", "CROSSCHAIN_SPOKE_EID", "CROSSCHAIN_SPOKE_ENDPOINT_V2"
        );
        address governance = vm.envAddress("CROSSCHAIN_SPOKE_TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("CROSSCHAIN_SPOKE_GUARDIAN_ADDRESS");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        (bytes32 root, string memory version) = _deploymentRoot("FLOATS_SEPOLIA_REHEARSAL_SPOKE");

        vm.startBroadcast(key);
        floatsOft =
            new FLOATS_OFT{ salt: _salt(root, "FLOATS_OFT") }(endpoint, governance, guardian);
        vm.stopBroadcast();

        emit SpokeFloatsDeployed(version, address(floatsOft));
    }
}
