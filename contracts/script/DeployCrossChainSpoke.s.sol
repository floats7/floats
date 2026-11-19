// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fIPO_OFT } from "../src/crosschain/fIPO_OFT.sol";
import { FLOATS_OFT } from "../src/crosschain/FLOATS_OFT.sol";
import { NavMirror } from "../src/crosschain/NavMirror.sol";

interface DeployCrossChainSpokeVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys only the Zero side. Peer wiring remains a governance action.
contract DeployCrossChainSpoke {
    error ChainIdMismatch(uint256 expected, uint256 actual);

    DeployCrossChainSpokeVm private constant vm =
        DeployCrossChainSpokeVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Deployment {
        fIPO_OFT fipoOft;
        FLOATS_OFT floatsOft;
        NavMirror navMirror;
    }

    event CrossChainSpokeDeployed(
        string version, address fipoOft, address floatsOft, address navMirror
    );

    function run() external returns (Deployment memory deployed) {
        uint256 expectedChainId = vm.envUint("CROSSCHAIN_SPOKE_CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address endpoint = vm.envAddress("CROSSCHAIN_SPOKE_ENDPOINT_V2");
        address governance = vm.envAddress("CROSSCHAIN_SPOKE_TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("CROSSCHAIN_SPOKE_GUARDIAN_ADDRESS");
        uint256 maxStaleness = vm.envUint("CROSSCHAIN_NAV_MAX_STALENESS_SECONDS");
        string memory version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");
        bytes32 root = keccak256(abi.encode("FLOATS_ZERO_SPOKE", block.chainid, version));

        vm.startBroadcast(key);
        deployed.fipoOft =
            new fIPO_OFT{ salt: _salt(root, "FIPO_OFT") }(endpoint, governance, guardian);
        deployed.floatsOft =
            new FLOATS_OFT{ salt: _salt(root, "FLOATS_OFT") }(endpoint, governance, guardian);
        deployed.navMirror =
            new NavMirror{ salt: _salt(root, "NAV_MIRROR") }(endpoint, governance, maxStaleness);
        vm.stopBroadcast();

        emit CrossChainSpokeDeployed(
            version,
            address(deployed.fipoOft),
            address(deployed.floatsOft),
            address(deployed.navMirror)
        );
    }

    function _salt(bytes32 root, string memory component) private pure returns (bytes32) {
        return keccak256(abi.encode(root, component));
    }
}
