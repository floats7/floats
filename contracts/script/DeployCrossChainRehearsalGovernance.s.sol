// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";

interface DeployCrossChainRehearsalGovernanceVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys rehearsal-only Sepolia governance without temporary external admin authority.
contract DeployCrossChainRehearsalGovernance {
    error ChainIdMismatch(uint256 expected, uint256 actual);
    error InvalidRoleAddress();

    DeployCrossChainRehearsalGovernanceVm private constant vm = DeployCrossChainRehearsalGovernanceVm(
        address(uint160(uint256(keccak256("hevm cheat code"))))
    );

    event RehearsalTimelockDeployed(
        string version,
        address indexed timelock,
        address indexed proposer,
        address indexed executor,
        uint256 minimumDelay
    );

    function run() external returns (TimelockController timelock) {
        uint256 expectedChainId = vm.envUint("CROSSCHAIN_SPOKE_CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        address proposer = vm.envAddress("CROSSCHAIN_REHEARSAL_PROPOSER_ADDRESS");
        address executor = vm.envAddress("CROSSCHAIN_REHEARSAL_EXECUTOR_ADDRESS");
        if (proposer == address(0) || executor == address(0)) revert InvalidRoleAddress();

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 minimumDelay = vm.envUint("CROSSCHAIN_REHEARSAL_TIMELOCK_DELAY_SECONDS");
        string memory version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");
        address[] memory proposers = new address[](1);
        address[] memory executors = new address[](1);
        proposers[0] = proposer;
        executors[0] = executor;
        bytes32 salt =
            keccak256(abi.encode("FLOATS_CROSSCHAIN_REHEARSAL_TIMELOCK", block.chainid, version));

        vm.startBroadcast(key);
        timelock =
            new TimelockController{ salt: salt }(minimumDelay, proposers, executors, address(0));
        vm.stopBroadcast();

        emit RehearsalTimelockDeployed(version, address(timelock), proposer, executor, minimumDelay);
    }
}
