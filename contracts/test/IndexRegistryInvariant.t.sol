// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IndexRegistry } from "../src/registry/IndexRegistry.sol";

contract IndexRegistryInvariantTest {
    IndexRegistry private registry;
    RegistryInvariantHandler private handler;
    address[] private targets;

    function setUp() public {
        handler = new RegistryInvariantHandler();
        registry = handler.registry();
        targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return targets;
    }

    function invariantVersionEqualsSuccessfulExecutions() public view {
        require(registry.version() == handler.executionCount(), "version drift");
    }

    function invariantPendingStateIsAtomic() public view {
        bytes32 pendingHash = registry.pendingConfigurationHash();
        if (pendingHash == bytes32(0)) {
            require(registry.pendingValidAfter() == 0, "orphaned validAfter");
            return;
        }

        require(pendingHash == handler.expectedPendingHash(), "pending hash drift");
        require(registry.pendingValidAfter() == handler.pendingValidAfter(), "delay drift");
    }

    function invariantActiveConfigurationIsValid() public view {
        address[] memory activeTokens = registry.getActiveTokens();
        require(activeTokens.length <= 1, "unexpected active set");
        if (activeTokens.length == 0) return;

        IndexRegistry.Constituent memory constituent =
            registry.getConstituent(activeTokens[0]);
        require(constituent.status == IndexRegistry.Status.Active, "inactive active token");
        require(constituent.targetWeightBps == 10_000, "invalid active weight");
        require(activeTokens[0] == handler.lastExecutedToken(), "active token drift");
    }

    function invariantTrackedSetContainsActiveSet() public view {
        address[] memory trackedTokens = registry.getTrackedTokens();
        require(trackedTokens.length <= registry.MAX_TRACKED_TOKENS(), "tracked overflow");
        require(trackedTokens.length >= registry.activeConstituentCount(), "missing tracked token");
    }

    function invariantHandlerRemainsSoleAdmin() public view {
        require(registry.admin() == address(handler), "admin changed");
    }
}

contract RegistryInvariantHandler {
    IndexRegistry public immutable registry;
    uint64 public executionCount;
    address public lastExecutedToken;
    uint48 public pendingValidAfter;

    IndexRegistry.ConstituentInput private pendingInput;

    constructor() {
        registry = new IndexRegistry(address(this), 0);
    }

    function propose(uint8 tokenSeed, uint48 dateSeed) external {
        uint256 tokenId = uint256(tokenSeed % 16) + 1;
        uint48 eligibleFrom = uint48(uint256(dateSeed) % 1_000_000);
        pendingInput = IndexRegistry.ConstituentInput({
            token: address(uint160(0x1000 + tokenId)),
            feed: address(uint160(0x2000 + tokenId)),
            uid: bytes32(tokenId),
            targetWeightBps: 10_000,
            eligibleFrom: eligibleFrom,
            exitAfter: eligibleFrom + 1
        });
        pendingValidAfter = uint48(block.timestamp);
        registry.proposeConfiguration(_pendingInputs(), pendingValidAfter);
    }

    function cancel() external {
        if (registry.pendingConfigurationHash() == bytes32(0)) return;
        registry.cancelConfiguration();
        delete pendingInput;
        pendingValidAfter = 0;
    }

    function execute() external {
        if (registry.pendingConfigurationHash() == bytes32(0)) return;
        IndexRegistry.ConstituentInput[] memory inputs = _pendingInputs();
        lastExecutedToken = pendingInput.token;
        registry.executeConfiguration(inputs);
        executionCount += 1;
        delete pendingInput;
        pendingValidAfter = 0;
    }

    function expectedPendingHash() external view returns (bytes32) {
        if (registry.pendingConfigurationHash() == bytes32(0)) return bytes32(0);
        return registry.hashConfiguration(_pendingInputs(), pendingValidAfter);
    }

    function _pendingInputs()
        private
        view
        returns (IndexRegistry.ConstituentInput[] memory inputs)
    {
        inputs = new IndexRegistry.ConstituentInput[](1);
        inputs[0] = pendingInput;
    }
}
