// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fUSDOFTAdapter } from "../src/crosschain/fUSDOFTAdapter.sol";

interface IFUSDHubEndpointV2 {
    function eid() external view returns (uint32);
}

interface DeployCrossChainHubFUSDVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys the canonical fUSD lockbox only. Peer wiring and activation remain governance actions.
contract DeployCrossChainHubFUSD {
    DeployCrossChainHubFUSDVm private constant vm =
        DeployCrossChainHubFUSDVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error EndpointEidMismatch(uint32 expected, uint32 actual);
    error InvalidEndpointEid(uint256 value);

    event FUSDHubDeployed(string version, address adapter, address token, uint32 eid);

    function run() external returns (fUSDOFTAdapter adapter) {
        uint256 expectedChainId = vm.envUint("CROSSCHAIN_HUB_CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        address endpoint = vm.envAddress("CROSSCHAIN_HUB_ENDPOINT_V2");
        uint256 rawEid = vm.envUint("CROSSCHAIN_HUB_EID");
        if (rawEid == 0 || rawEid > type(uint32).max) revert InvalidEndpointEid(rawEid);
        uint32 expectedEid = uint32(rawEid);
        uint32 observedEid = IFUSDHubEndpointV2(endpoint).eid();
        if (observedEid != expectedEid) revert EndpointEidMismatch(expectedEid, observedEid);

        address fusd = vm.envAddress("FUSD_VAULT_ADDRESS");
        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        string memory version = vm.envString("FUSD_CROSSCHAIN_DEPLOYMENT_VERSION");
        bytes32 salt = keccak256(abi.encode("FLOATS_FUSD_HUB", block.chainid, version));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        adapter = new fUSDOFTAdapter{ salt: salt }(fusd, endpoint, governance, guardian);
        vm.stopBroadcast();

        emit FUSDHubDeployed(version, address(adapter), fusd, observedEid);
    }
}
