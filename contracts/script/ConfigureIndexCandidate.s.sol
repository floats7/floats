// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { NavOracle } from "../src/oracle/NavOracle.sol";

interface ConfigureIndexCandidateVm {
    function envAddress(string calldata name) external returns (address value);
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Adds one verified candidate while proportionally scaling the existing basket weights.
abstract contract IndexCandidateConfiguration {
    ConfigureIndexCandidateVm internal constant vm =
        ConfigureIndexCandidateVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant BPS = 10_000;

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error CandidateAlreadyActive(address candidate);
    error InvalidCandidate();
    error InvalidCandidateWeight(uint256 weightBps);
    error NoActiveConstituents();
    error InvalidOracleMaxAge(uint256 maxAge);
    error InvalidTimestamp(uint256 timestamp);
    error ProposalBeforeEligibility(uint256 validAfter, uint256 eligibleFrom);

    function _inputs(IndexRegistry registry)
        internal
        returns (IndexRegistry.ConstituentInput[] memory inputs)
    {
        address candidate = vm.envAddress("INDEX_CANDIDATE_TOKEN_ADDRESS");
        address feed = vm.envAddress("INDEX_CANDIDATE_FEED_ADDRESS");
        bytes32 uid = vm.envBytes32("INDEX_CANDIDATE_ASSET_UID");
        uint256 candidateWeight = vm.envUint("INDEX_CANDIDATE_WEIGHT_BPS");
        if (candidate == address(0) || feed == address(0) || uid == bytes32(0)) {
            revert InvalidCandidate();
        }
        if (candidateWeight == 0 || candidateWeight >= BPS) {
            revert InvalidCandidateWeight(candidateWeight);
        }

        address[] memory active = registry.getActiveTokens();
        uint256 activeLength = active.length;
        if (activeLength == 0) revert NoActiveConstituents();
        inputs = new IndexRegistry.ConstituentInput[](activeLength + 1);
        uint256 scaledTotal;
        for (uint256 i; i < activeLength; ++i) {
            if (active[i] == candidate) revert CandidateAlreadyActive(candidate);
            IndexRegistry.Constituent memory current = registry.getConstituent(active[i]);
            uint16 scaledWeight =
                uint16(uint256(current.targetWeightBps) * (BPS - candidateWeight) / BPS);
            scaledTotal += scaledWeight;
            inputs[i] = IndexRegistry.ConstituentInput({
                token: active[i],
                feed: current.feed,
                uid: current.uid,
                targetWeightBps: scaledWeight,
                eligibleFrom: current.eligibleFrom,
                exitAfter: current.exitAfter
            });
        }
        uint256 residual = BPS - candidateWeight - scaledTotal;
        inputs[0].targetWeightBps += uint16(residual);
        uint48 eligibleFrom = _timestamp("INDEX_CANDIDATE_ELIGIBLE_FROM");
        uint48 exitAfter = _timestamp("INDEX_CANDIDATE_EXIT_AFTER");
        inputs[activeLength] = IndexRegistry.ConstituentInput({
            token: candidate,
            feed: feed,
            uid: uid,
            targetWeightBps: uint16(candidateWeight),
            eligibleFrom: eligibleFrom,
            exitAfter: exitAfter
        });
    }

    function _proposalOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        NavOracle oracle = NavOracle(vm.envAddress("NAV_ORACLE_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _inputs(registry);
        uint48 validAfter = _timestamp("INDEX_CANDIDATE_VALID_AFTER");
        uint48 candidateEligibleFrom = inputs[inputs.length - 1].eligibleFrom;
        if (validAfter < candidateEligibleFrom) {
            revert ProposalBeforeEligibility(validAfter, candidateEligibleFrom);
        }
        uint256 rawMaxAge = vm.envUint("INDEX_CANDIDATE_ORACLE_MAX_AGE");
        if (rawMaxAge == 0 || rawMaxAge > 7 days) revert InvalidOracleMaxAge(rawMaxAge);

        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory maxAges = new uint32[](1);
        tokens[0] = vm.envAddress("INDEX_CANDIDATE_TOKEN_ADDRESS");
        feeds[0] = vm.envAddress("INDEX_CANDIDATE_FEED_ADDRESS");
        maxAges[0] = uint32(rawMaxAge);

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(oracle);
        payloads[0] = abi.encodeCall(NavOracle.configureFeeds, (tokens, feeds, maxAges));
        targets[1] = address(registry);
        payloads[1] = abi.encodeCall(IndexRegistry.proposeConfiguration, (inputs, validAfter));
        salt = keccak256(
            abi.encode(
                "FLOATS_INDEX_CANDIDATE_PROPOSAL_V1",
                block.chainid,
                inputs,
                validAfter,
                vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }

    function _timestamp(string memory key) internal returns (uint48 value) {
        uint256 raw = vm.envUint(key);
        if (raw > type(uint48).max) revert InvalidTimestamp(raw);
        return uint48(raw);
    }

    function _activationOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _inputs(registry);
        targets = new address[](1);
        values = new uint256[](1);
        payloads = new bytes[](1);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(IndexRegistry.executeConfiguration, (inputs));
        salt = keccak256(
            abi.encode(
                "FLOATS_INDEX_CANDIDATE_ACTIVATION_V1",
                block.chainid,
                inputs,
                vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }

    function _schedule(
        TimelockController timelock,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory payloads,
        bytes32 salt
    ) internal returns (bytes32 operationId) {
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }

    function _execute(
        TimelockController timelock,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory payloads,
        bytes32 salt
    ) internal returns (bytes32 operationId) {
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleIndexCandidateProposal is IndexCandidateConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _proposalOperation();
        return _schedule(timelock, targets, values, payloads, salt);
    }
}

contract ExecuteIndexCandidateProposal is IndexCandidateConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _proposalOperation();
        return _execute(timelock, targets, values, payloads, salt);
    }
}

contract ScheduleIndexCandidateActivation is IndexCandidateConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _activationOperation();
        return _schedule(timelock, targets, values, payloads, salt);
    }
}

contract ExecuteIndexCandidateActivation is IndexCandidateConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _activationOperation();
        return _execute(timelock, targets, values, payloads, salt);
    }
}
