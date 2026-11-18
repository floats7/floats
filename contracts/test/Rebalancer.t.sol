// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    Rebalancer,
    IRebalanceSwapAdapter,
    IRebalanceVault
} from "../src/rebalance/Rebalancer.sol";

interface RebalanceVm {
    function warp(uint256 newTimestamp) external;
}

contract RebalancerTest {
    RebalanceVm private constant vm =
        RebalanceVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockRebalanceToken private tokenIn;
    MockRebalanceToken private tokenOut;
    MockRebalanceVault private vault;
    MockRebalanceAdapter private adapter;
    Rebalancer private rebalancer;

    function setUp() public {
        vm.warp(10_000);
        tokenIn = new MockRebalanceToken();
        tokenOut = new MockRebalanceToken();
        vault = new MockRebalanceVault();
        adapter = new MockRebalanceAdapter();
        rebalancer = new Rebalancer(
            address(this), IRebalanceVault(address(vault)), IRebalanceSwapAdapter(address(adapter))
        );

        tokenIn.mint(address(vault), 100 ether);
        tokenOut.mint(address(adapter), 500 ether);
        rebalancer.setKeeper(address(this), true);
        rebalancer.setChunkLimit(address(tokenIn), 50 ether);
    }

    function testExecutesAuthorizedInstructionOnce() public {
        Rebalancer.Instruction memory instruction = _instruction(40 ether);
        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        );

        uint256 amountOut = rebalancer.executeInstruction(instruction);
        _assertEq(amountOut, 80 ether, "amount out");
        _assertEq(tokenOut.balanceOf(address(vault)), 80 ether, "vault output");
        _assertEq(
            tokenIn.allowance(address(rebalancer), address(adapter)), 0, "adapter allowance cleared"
        );

        try rebalancer.executeInstruction(instruction) {
            revert("expected replay revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.AlreadyExecuted.selector);
        }
    }

    function testRejectsChunkAboveLimit() public {
        Rebalancer.Instruction memory instruction = _instruction(51 ether);
        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        );

        try rebalancer.executeInstruction(instruction) {
            revert("expected chunk limit revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.ChunkLimitExceeded.selector);
        }
    }

    function testRejectsExpiredInstruction() public {
        Rebalancer.Instruction memory instruction = _instruction(10 ether);
        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        );
        vm.warp(block.timestamp + 1 hours + 1);

        try rebalancer.executeInstruction(instruction) {
            revert("expected deadline revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.TooLate.selector);
        }
    }

    function testCalculatesPositiveAndNegativeTargetDeltas() public view {
        int256 increase = rebalancer.calculateDelta(20 ether, 4000, 100 ether);
        int256 decrease = rebalancer.calculateDelta(60 ether, 4000, 100 ether);
        require(increase == 20 ether, "increase delta");
        require(decrease == -20 ether, "decrease delta");
    }

    function testOnlyKeeperCanExecute() public {
        Rebalancer.Instruction memory instruction = _instruction(10 ether);
        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        );
        UnauthorizedRebalanceCaller caller = new UnauthorizedRebalanceCaller();

        try caller.execute(rebalancer, instruction) {
            revert("expected keeper revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotKeeper.selector);
        }
    }

    function testRejectsZeroInstructionId() public {
        Rebalancer.Instruction memory instruction = _instruction(10 ether);
        instruction.id = bytes32(0);

        try rebalancer.executeInstruction(instruction) {
            revert("expected instruction id revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidInstructionId.selector);
        }

        try rebalancer.authorizeInstruction(
            bytes32(0), uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        ) {
            revert("expected authorization id revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidInstructionId.selector);
        }
    }

    function testRejectsInvalidAuthorizationWindows() public {
        bytes32 instructionHash = rebalancer.hashInstruction(_instruction(10 ether));
        try rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp + 1 hours), uint48(block.timestamp + 1 hours)
        ) {
            revert("expected equal window revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidAuthorizationWindow.selector);
        }

        try rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp - 2), uint48(block.timestamp - 1)
        ) {
            revert("expected expired window revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidAuthorizationWindow.selector);
        }
    }

    function testRejectsUnauthorizedAndCancelledInstructions() public {
        Rebalancer.Instruction memory instruction = _instruction(10 ether);
        try rebalancer.executeInstruction(instruction) {
            revert("expected unauthorized revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotAuthorized.selector);
        }

        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        );
        rebalancer.cancelInstruction(instructionHash);
        try rebalancer.executeInstruction(instruction) {
            revert("expected cancelled authorization revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotAuthorized.selector);
        }
    }

    function testRejectsInstructionBeforeValidAfter() public {
        Rebalancer.Instruction memory instruction = _instruction(10 ether);
        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp + 1), uint48(block.timestamp + 1 hours)
        );

        try rebalancer.executeInstruction(instruction) {
            revert("expected early execution revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.TooEarly.selector);
        }
    }

    function testRejectsMissingChunkLimit() public {
        Rebalancer.Instruction memory instruction = _instruction(10 ether);
        instruction.route.tokenIn = address(tokenOut);
        bytes32 instructionHash = rebalancer.hashInstruction(instruction);
        rebalancer.authorizeInstruction(
            instructionHash, uint48(block.timestamp), uint48(block.timestamp + 1 hours)
        );

        try rebalancer.executeInstruction(instruction) {
            revert("expected missing limit revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.MissingChunkLimit.selector);
        }
    }

    function testRejectsDeltaOverflow() public view {
        try rebalancer.calculateDelta(uint256(type(int256).max) + 1, 0, 0) {
            revert("expected delta overflow revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.DeltaOverflow.selector);
        }
    }

    function testRejectsZeroConfigurationAddresses() public {
        try new Rebalancer(
            address(0), IRebalanceVault(address(vault)), IRebalanceSwapAdapter(address(adapter))
        ) {
            revert("expected zero admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidAddress.selector);
        }

        try rebalancer.setKeeper(address(0), true) {
            revert("expected zero keeper revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidAddress.selector);
        }

        try rebalancer.setChunkLimit(address(0), 1) {
            revert("expected zero token revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.InvalidAddress.selector);
        }
    }

    function testOnlyAdminCanManageRebalancer() public {
        UnauthorizedRebalanceCaller caller = new UnauthorizedRebalanceCaller();
        bytes32 instructionHash = rebalancer.hashInstruction(_instruction(10 ether));

        try caller.setKeeper(rebalancer, address(caller), true) {
            revert("expected keeper admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotAdmin.selector);
        }
        try caller.setChunkLimit(rebalancer, address(tokenIn), 1) {
            revert("expected limit admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotAdmin.selector);
        }
        try caller.authorize(
            rebalancer,
            instructionHash,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 hours)
        ) {
            revert("expected authorization admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotAdmin.selector);
        }
        try caller.cancel(rebalancer, instructionHash) {
            revert("expected cancellation admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, Rebalancer.NotAdmin.selector);
        }
    }

    function _instruction(uint256 amountIn) private view returns (Rebalancer.Instruction memory) {
        return Rebalancer.Instruction({
            id: keccak256(abi.encode(amountIn)),
            route: IRebalanceSwapAdapter.Route({
                router: address(0x1234),
                tokenIn: address(tokenIn),
                tokenOut: address(tokenOut),
                selector: bytes4(keccak256("swap()"))
            }),
            amountIn: amountIn,
            slippageBps: 100,
            routerCalldata: hex"12345678"
        });
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
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

contract MockRebalanceVault {
    function transferForRebalance(address token, address recipient, uint256 amount) external {
        MockRebalanceToken(token).transfer(recipient, amount);
    }
}

contract MockRebalanceAdapter {
    function executeSwap(
        IRebalanceSwapAdapter.Route calldata route,
        uint256 amountIn,
        uint16,
        address recipient,
        bytes calldata
    ) external returns (uint256 amountOut) {
        MockRebalanceToken(route.tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn * 2;
        MockRebalanceToken(route.tokenOut).transfer(recipient, amountOut);
    }
}

contract MockRebalanceToken {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    function mint(address recipient, uint256 amount) external {
        balanceOf[recipient] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool)
    {
        uint256 approved = allowance[sender][msg.sender];
        require(approved >= amount, "allowance");
        allowance[sender][msg.sender] = approved - amount;
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) private {
        require(balanceOf[sender] >= amount, "balance");
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
    }
}

contract UnauthorizedRebalanceCaller {
    function execute(Rebalancer rebalancer, Rebalancer.Instruction memory instruction) external {
        rebalancer.executeInstruction(instruction);
    }

    function setKeeper(Rebalancer rebalancer, address keeper, bool allowed) external {
        rebalancer.setKeeper(keeper, allowed);
    }

    function setChunkLimit(Rebalancer rebalancer, address token, uint256 limit) external {
        rebalancer.setChunkLimit(token, limit);
    }

    function authorize(
        Rebalancer rebalancer,
        bytes32 instructionHash,
        uint48 validAfter,
        uint48 deadline
    ) external {
        rebalancer.authorizeInstruction(instructionHash, validAfter, deadline);
    }

    function cancel(Rebalancer rebalancer, bytes32 instructionHash) external {
        rebalancer.cancelInstruction(instructionHash);
    }
}
