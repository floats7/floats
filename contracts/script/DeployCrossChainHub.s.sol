// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fIPOOFTAdapter } from "../src/crosschain/fIPOOFTAdapter.sol";
import { FLOATSOFTAdapter } from "../src/crosschain/FLOATSOFTAdapter.sol";
import { NavPublisher } from "../src/crosschain/NavPublisher.sol";

interface DeployCrossChainHubVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys only the Robinhood Chain side. Peer wiring remains a governance action.
contract DeployCrossChainHub {
    error ChainIdMismatch(uint256 expected, uint256 actual);

    DeployCrossChainHubVm private constant vm =
        DeployCrossChainHubVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Deployment {
        fIPOOFTAdapter fipoAdapter;
        FLOATSOFTAdapter floatsAdapter;
        NavPublisher navPublisher;
    }

    event CrossChainHubDeployed(
        string version, address fipoAdapter, address floatsAdapter, address navPublisher
    );

    function run() external returns (Deployment memory deployed) {
        uint256 expectedChainId = vm.envUint("CROSSCHAIN_HUB_CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address endpoint = vm.envAddress("CROSSCHAIN_HUB_ENDPOINT_V2");
        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address fipo = vm.envAddress("FLOATS_VAULT_ADDRESS");
        address floats = vm.envAddress("FLOATS_CONTRACT_ADDRESS");
        string memory version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");
        bytes32 root = keccak256(abi.encode("FLOATS_ZERO_HUB", block.chainid, version));

        vm.startBroadcast(key);
        deployed.fipoAdapter = new fIPOOFTAdapter{ salt: _salt(root, "FIPO_ADAPTER") }(
            fipo, endpoint, governance, guardian
        );
        deployed.floatsAdapter = new FLOATSOFTAdapter{ salt: _salt(root, "FLOATS_ADAPTER") }(
            floats, endpoint, governance, guardian
        );
        deployed.navPublisher = new NavPublisher{ salt: _salt(root, "NAV_PUBLISHER") }(
            fipo, endpoint, governance, keeper
        );
        vm.stopBroadcast();

        emit CrossChainHubDeployed(
            version,
            address(deployed.fipoAdapter),
            address(deployed.floatsAdapter),
            address(deployed.navPublisher)
        );
    }

    function _salt(bytes32 root, string memory component) private pure returns (bytes32) {
        return keccak256(abi.encode(root, component));
    }
}
