// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { fUSD_OFT } from "../src/crosschain/fUSD_OFT.sol";

interface IFUSDSpokeEndpointV2 {
    function eid() external view returns (uint32);
}

interface DeployCrossChainSpokeFUSDVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys the remote fUSD representation only. Peer wiring and activation remain governance actions.
contract DeployCrossChainSpokeFUSD {
    DeployCrossChainSpokeFUSDVm private constant vm =
        DeployCrossChainSpokeFUSDVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error EndpointEidMismatch(uint32 expected, uint32 actual);
    error InvalidEndpointEid(uint256 value);

    event FUSDSpokeDeployed(string version, address oft, uint32 eid);

    function run() external returns (fUSD_OFT oft) {
        uint256 expectedChainId = vm.envUint("CROSSCHAIN_SPOKE_CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        address endpoint = vm.envAddress("CROSSCHAIN_SPOKE_ENDPOINT_V2");
        uint256 rawEid = vm.envUint("CROSSCHAIN_SPOKE_EID");
        if (rawEid == 0 || rawEid > type(uint32).max) revert InvalidEndpointEid(rawEid);
        uint32 expectedEid = uint32(rawEid);
        uint32 observedEid = IFUSDSpokeEndpointV2(endpoint).eid();
        if (observedEid != expectedEid) revert EndpointEidMismatch(expectedEid, observedEid);

        address governance = vm.envAddress("CROSSCHAIN_SPOKE_TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("CROSSCHAIN_SPOKE_GUARDIAN_ADDRESS");
        string memory version = vm.envString("FUSD_CROSSCHAIN_DEPLOYMENT_VERSION");
        bytes32 salt = keccak256(abi.encode("FLOATS_FUSD_SPOKE", block.chainid, version));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        oft = new fUSD_OFT{ salt: salt }(endpoint, governance, guardian);
        vm.stopBroadcast();

        emit FUSDSpokeDeployed(version, address(oft), observedEid);
    }
}
