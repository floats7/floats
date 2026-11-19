// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface CrossChainDeploymentVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

interface ICrossChainDeploymentEndpointV2 {
    function eid() external view returns (uint32);
}

abstract contract CrossChainDeploymentBase {
    error ChainIdMismatch(uint256 expected, uint256 actual);
    error EndpointEidMismatch(uint32 expected, uint32 actual);
    error InvalidEndpointEid(uint256 value);

    CrossChainDeploymentVm internal constant vm =
        CrossChainDeploymentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function _validatedEndpoint(
        string memory chainIdVariable,
        string memory eidVariable,
        string memory endpointVariable
    ) internal returns (address endpoint) {
        uint256 expectedChainId = vm.envUint(chainIdVariable);
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        uint256 rawExpectedEid = vm.envUint(eidVariable);
        if (rawExpectedEid == 0 || rawExpectedEid > type(uint32).max) {
            revert InvalidEndpointEid(rawExpectedEid);
        }
        uint32 expectedEid = uint32(rawExpectedEid);
        endpoint = vm.envAddress(endpointVariable);
        uint32 observedEid = ICrossChainDeploymentEndpointV2(endpoint).eid();
        if (observedEid != expectedEid) revert EndpointEidMismatch(expectedEid, observedEid);
    }

    function _deploymentRoot(string memory domain)
        internal
        returns (bytes32 root, string memory version)
    {
        version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");
        root = keccak256(abi.encode(domain, block.chainid, version));
    }

    function _salt(bytes32 root, string memory component) internal pure returns (bytes32) {
        return keccak256(abi.encode(root, component));
    }
}
