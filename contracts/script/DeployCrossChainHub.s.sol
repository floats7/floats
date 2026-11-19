// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fIPOOFTAdapter } from "../src/crosschain/fIPOOFTAdapter.sol";
import { FLOATSOFTAdapter } from "../src/crosschain/FLOATSOFTAdapter.sol";
import { NavPublisher } from "../src/crosschain/NavPublisher.sol";

interface IDeploymentEndpointV2 {
    function eid() external view returns (uint32);
}

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
    error EndpointEidMismatch(uint32 expected, uint32 actual);
    error InvalidEndpointEid(uint256 value);

    DeployCrossChainHubVm private constant vm =
        DeployCrossChainHubVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Deployment {
        fIPOOFTAdapter fipoAdapter;
        FLOATSOFTAdapter floatsAdapter;
        NavPublisher navPublisher;
    }

    struct Configuration {
        address endpoint;
        address governance;
        address guardian;
        address keeper;
        address fipo;
        address floats;
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
        Configuration memory config = Configuration({
            endpoint: vm.envAddress("CROSSCHAIN_HUB_ENDPOINT_V2"),
            governance: vm.envAddress("TIMELOCK_ADDRESS"),
            guardian: vm.envAddress("GUARDIAN_ADDRESS"),
            keeper: vm.envAddress("KEEPER_ADDRESS"),
            fipo: vm.envAddress("FLOATS_VAULT_ADDRESS"),
            floats: vm.envAddress("FLOATS_CONTRACT_ADDRESS")
        });
        uint256 rawExpectedEid = vm.envUint("CROSSCHAIN_HUB_EID");
        if (rawExpectedEid == 0 || rawExpectedEid > type(uint32).max) {
            revert InvalidEndpointEid(rawExpectedEid);
        }
        uint32 expectedEid = uint32(rawExpectedEid);
        uint32 observedEid = IDeploymentEndpointV2(config.endpoint).eid();
        if (observedEid != expectedEid) revert EndpointEidMismatch(expectedEid, observedEid);
        string memory version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");
        bytes32 root = keccak256(abi.encode("FLOATS_ZERO_HUB", block.chainid, version));

        vm.startBroadcast(key);
        deployed.fipoAdapter = new fIPOOFTAdapter{ salt: _salt(root, "FIPO_ADAPTER") }(
            config.fipo, config.endpoint, config.governance, config.guardian
        );
        deployed.floatsAdapter = new FLOATSOFTAdapter{ salt: _salt(root, "FLOATS_ADAPTER") }(
            config.floats, config.endpoint, config.governance, config.guardian
        );
        deployed.navPublisher = new NavPublisher{ salt: _salt(root, "NAV_PUBLISHER") }(
            config.fipo, config.endpoint, config.governance, config.keeper
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
