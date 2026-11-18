// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRebalanceVault {
    function transferForRebalance(address token, address recipient, uint256 amount) external;
}

interface IRebalanceSwapAdapter {
    struct Route {
        address router;
        address tokenIn;
        address tokenOut;
        bytes4 selector;
    }

    function executeSwap(
        Route calldata route,
        uint256 amountIn,
        uint16 slippageBps,
        address recipient,
        bytes calldata routerCalldata
    ) external returns (uint256 amountOut);
}

/// @title Rebalancer
/// @notice Executes governance-authorized, bounded, replay-protected swap instructions.
contract Rebalancer {
    using SafeERC20 for IERC20;

    struct Instruction {
        bytes32 id;
        IRebalanceSwapAdapter.Route route;
        uint256 amountIn;
        uint16 slippageBps;
        bytes routerCalldata;
    }

    struct Authorization {
        uint48 validAfter;
        uint48 deadline;
    }

    error AlreadyExecuted(bytes32 instructionHash);
    error ChunkLimitExceeded(address token, uint256 amount, uint256 limit);
    error DeltaOverflow(uint256 delta);
    error InvalidAddress();
    error InvalidAuthorizationWindow(uint48 validAfter, uint48 deadline);
    error InvalidInstructionId();
    error MissingChunkLimit(address token);
    error NotAdmin(address caller);
    error NotAuthorized(bytes32 instructionHash);
    error NotKeeper(address caller);
    error TooEarly(uint48 validAfter);
    error TooLate(uint48 deadline);

    event ChunkLimitSet(address indexed token, uint256 previousLimit, uint256 newLimit);
    event InstructionAuthorized(
        bytes32 indexed instructionHash, uint48 validAfter, uint48 deadline
    );
    event InstructionCancelled(bytes32 indexed instructionHash);
    event InstructionExecuted(
        bytes32 indexed instructionHash,
        bytes32 indexed instructionId,
        address indexed keeper,
        uint256 amountIn,
        uint256 amountOut
    );
    event KeeperSet(address indexed keeper, bool allowed);

    address public immutable admin;
    IRebalanceVault public immutable vault;
    IRebalanceSwapAdapter public immutable swapAdapter;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(address token => uint256 maximumAmount) public chunkLimit;
    mapping(bytes32 instructionHash => Authorization authorization) public authorizations;
    mapping(bytes32 instructionHash => bool executed) public isExecuted;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender]) revert NotKeeper(msg.sender);
        _;
    }

    constructor(address admin_, IRebalanceVault vault_, IRebalanceSwapAdapter swapAdapter_) {
        if (
            admin_ == address(0) || address(vault_) == address(0)
                || address(swapAdapter_) == address(0)
        ) {
            revert InvalidAddress();
        }
        admin = admin_;
        vault = vault_;
        swapAdapter = swapAdapter_;
    }

    function setKeeper(address keeper, bool allowed) external onlyAdmin {
        if (keeper == address(0)) revert InvalidAddress();
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setChunkLimit(address token, uint256 newLimit) external onlyAdmin {
        if (token == address(0)) revert InvalidAddress();
        uint256 previousLimit = chunkLimit[token];
        chunkLimit[token] = newLimit;
        emit ChunkLimitSet(token, previousLimit, newLimit);
    }

    function authorizeInstruction(bytes32 instructionHash, uint48 validAfter, uint48 deadline)
        external
        onlyAdmin
    {
        if (instructionHash == bytes32(0)) revert InvalidInstructionId();
        if (deadline <= validAfter || deadline <= block.timestamp) {
            revert InvalidAuthorizationWindow(validAfter, deadline);
        }
        authorizations[instructionHash] =
            Authorization({ validAfter: validAfter, deadline: deadline });
        emit InstructionAuthorized(instructionHash, validAfter, deadline);
    }

    function cancelInstruction(bytes32 instructionHash) external onlyAdmin {
        delete authorizations[instructionHash];
        emit InstructionCancelled(instructionHash);
    }

    function executeInstruction(Instruction calldata instruction)
        external
        onlyKeeper
        returns (uint256 amountOut)
    {
        if (instruction.id == bytes32(0)) revert InvalidInstructionId();
        bytes32 instructionHash = hashInstruction(instruction);
        if (isExecuted[instructionHash]) revert AlreadyExecuted(instructionHash);
        Authorization memory authorization = authorizations[instructionHash];
        if (authorization.deadline == 0) revert NotAuthorized(instructionHash);
        if (block.timestamp < authorization.validAfter) revert TooEarly(authorization.validAfter);
        if (block.timestamp > authorization.deadline) revert TooLate(authorization.deadline);

        uint256 limit = chunkLimit[instruction.route.tokenIn];
        if (limit == 0) revert MissingChunkLimit(instruction.route.tokenIn);
        if (instruction.amountIn > limit) {
            revert ChunkLimitExceeded(instruction.route.tokenIn, instruction.amountIn, limit);
        }

        isExecuted[instructionHash] = true;
        delete authorizations[instructionHash];

        vault.transferForRebalance(instruction.route.tokenIn, address(this), instruction.amountIn);
        IERC20(instruction.route.tokenIn).forceApprove(address(swapAdapter), instruction.amountIn);
        amountOut = swapAdapter.executeSwap(
            instruction.route,
            instruction.amountIn,
            instruction.slippageBps,
            address(vault),
            instruction.routerCalldata
        );
        IERC20(instruction.route.tokenIn).forceApprove(address(swapAdapter), 0);

        emit InstructionExecuted(
            instructionHash, instruction.id, msg.sender, instruction.amountIn, amountOut
        );
    }

    function hashInstruction(Instruction calldata instruction) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), instruction));
    }

    function calculateDelta(uint256 currentValue, uint16 targetWeightBps, uint256 totalValue)
        external
        pure
        returns (int256 delta)
    {
        uint256 targetValue = totalValue * targetWeightBps / 10_000;
        uint256 absoluteDelta =
            targetValue >= currentValue ? targetValue - currentValue : currentValue - targetValue;
        // int256.max is positive and therefore losslessly representable as uint256.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (absoluteDelta > uint256(type(int256).max)) revert DeltaOverflow(absoluteDelta);
        // The explicit upper-bound check above proves this conversion cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 signedDelta = int256(absoluteDelta);
        return targetValue >= currentValue ? signedDelta : -signedDelta;
    }
}
