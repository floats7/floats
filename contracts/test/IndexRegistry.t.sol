// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IndexRegistry } from "../src/registry/IndexRegistry.sol";

contract IndexRegistryTest {
    IndexRegistry private registry;

    function setUp() public {
        registry = new IndexRegistry(address(this), 0);
    }

    function testExecuteConfigurationAtomically() public {
        IndexRegistry.ConstituentInput[] memory inputs = _twoConstituents();
        uint48 validAfter = uint48(block.timestamp);

        bytes32 proposedHash = registry.proposeConfiguration(inputs, validAfter);
        _assertEq(proposedHash, registry.hashConfiguration(inputs, validAfter), "proposal hash");

        registry.executeConfiguration(inputs);

        _assertEq(registry.version(), 1, "version");
        _assertEq(registry.activeConstituentCount(), 2, "active count");
        _assertEq(registry.pendingConfigurationHash(), bytes32(0), "pending hash cleared");

        IndexRegistry.Constituent memory first = registry.getConstituent(inputs[0].token);
        _assertEq(first.targetWeightBps, 6000, "first weight");
        _assertEq(uint256(first.status), uint256(IndexRegistry.Status.Active), "first status");
    }

    function testReplacementMarksOldConstituentsRemoved() public {
        IndexRegistry.ConstituentInput[] memory initial = _twoConstituents();
        registry.proposeConfiguration(initial, uint48(block.timestamp));
        registry.executeConfiguration(initial);

        IndexRegistry.ConstituentInput[] memory replacement =
            new IndexRegistry.ConstituentInput[](1);
        replacement[0] = _input(address(0x33), address(0x303), bytes32(uint256(3)), 10_000);

        registry.proposeConfiguration(replacement, uint48(block.timestamp));
        registry.executeConfiguration(replacement);

        IndexRegistry.Constituent memory removed = registry.getConstituent(initial[0].token);
        _assertEq(uint256(removed.status), uint256(IndexRegistry.Status.Removed), "removed status");
        _assertEq(removed.targetWeightBps, 0, "removed weight");
        _assertEq(registry.version(), 2, "replacement version");
    }

    function testRejectsInvalidWeightTotal() public {
        IndexRegistry.ConstituentInput[] memory inputs = _twoConstituents();
        inputs[0].targetWeightBps = 5999;

        try registry.proposeConfiguration(inputs, uint48(block.timestamp)) {
            revert("expected invalid weight revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, IndexRegistry.InvalidWeightTotal.selector);
        }
    }

    function testRejectsDuplicateToken() public {
        IndexRegistry.ConstituentInput[] memory inputs = _twoConstituents();
        inputs[1].token = inputs[0].token;

        try registry.proposeConfiguration(inputs, uint48(block.timestamp)) {
            revert("expected duplicate token revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, IndexRegistry.DuplicateToken.selector);
        }
    }

    function testRejectsMismatchedExecution() public {
        IndexRegistry.ConstituentInput[] memory proposed = _twoConstituents();
        registry.proposeConfiguration(proposed, uint48(block.timestamp));

        IndexRegistry.ConstituentInput[] memory altered = _twoConstituents();
        altered[0].targetWeightBps = 5000;
        altered[1].targetWeightBps = 5000;

        try registry.executeConfiguration(altered) {
            revert("expected hash mismatch revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, IndexRegistry.ConfigurationHashMismatch.selector);
        }
    }

    function testOnlyAdminCanPropose() public {
        UnauthorizedRegistryCaller caller = new UnauthorizedRegistryCaller();

        try caller.propose(registry, _twoConstituents(), uint48(block.timestamp)) {
            revert("expected admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, IndexRegistry.NotAdmin.selector);
        }
    }

    function testFuzzRejectsInvalidWeightTotal(uint16 firstWeight, uint16 secondWeight) public {
        uint256 total = uint256(firstWeight) + secondWeight;
        if (total == 10_000) return;

        IndexRegistry.ConstituentInput[] memory inputs = _twoConstituents();
        inputs[0].targetWeightBps = firstWeight;
        inputs[1].targetWeightBps = secondWeight;

        try registry.proposeConfiguration(inputs, uint48(block.timestamp)) {
            revert("expected invalid weight revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, IndexRegistry.InvalidWeightTotal.selector);
        }
    }

    function _twoConstituents()
        private
        pure
        returns (IndexRegistry.ConstituentInput[] memory inputs)
    {
        inputs = new IndexRegistry.ConstituentInput[](2);
        inputs[0] = _input(address(0x11), address(0x101), bytes32(uint256(1)), 6000);
        inputs[1] = _input(address(0x22), address(0x202), bytes32(uint256(2)), 4000);
    }

    function _input(address token, address feed, bytes32 uid, uint16 weight)
        private
        pure
        returns (IndexRegistry.ConstituentInput memory)
    {
        return IndexRegistry.ConstituentInput({
            token: token,
            feed: feed,
            uid: uid,
            targetWeightBps: weight,
            eligibleFrom: 1,
            exitAfter: 0
        });
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing revert selector");
        bytes4 actual;
        assembly ("memory-safe") {
            actual := mload(add(reason, 0x20))
        }
        require(actual == expected, "unexpected revert selector");
    }
}

contract UnauthorizedRegistryCaller {
    function propose(
        IndexRegistry registry,
        IndexRegistry.ConstituentInput[] memory inputs,
        uint48 validAfter
    ) external {
        registry.proposeConfiguration(inputs, validAfter);
    }
}
