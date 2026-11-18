// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IRebalanceSwapAdapter, Rebalancer } from "../src/rebalance/Rebalancer.sol";

interface MainnetRebalanceVm {
    function addr(uint256 privateKey) external returns (address account);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

interface IUniswapV3SwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @notice Deterministic authorization and execution for the first mainnet 50/50 rebalance.
abstract contract MainnetBetaRebalanceConfiguration {
    MainnetRebalanceVm internal constant vm =
        MainnetRebalanceVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error KeeperMismatch(address expected, address actual);
    error MainnetOnly(uint256 chainId);
    error SelectorMismatch(bytes4 expected, bytes4 actual);

    function _guardMainnet() internal view {
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);
    }

    function _instructions(Rebalancer rebalancer)
        internal
        returns (Rebalancer.Instruction memory crcl, Rebalancer.Instruction memory spcx)
    {
        address router = vm.envAddress("BETA_SWAP_ROUTER_ADDRESS");
        address adapter = address(rebalancer.swapAdapter());
        address usdg = vm.envAddress("USDG_ADDRESS");
        address crclToken = vm.envAddress("BETA_FIRST_TOKEN_ADDRESS");
        address spcxToken = vm.envAddress("BETA_SECOND_TOKEN_ADDRESS");
        uint256 amount = vm.envUint("BETA_REBALANCE_ASSET_USDG");
        uint16 slippageBps = uint16(vm.envUint("BETA_REBALANCE_SLIPPAGE_BPS"));
        bytes4 selector = IUniswapV3SwapRouter02.exactInputSingle.selector;
        bytes4 expectedSelector = bytes4(uint32(vm.envUint("BETA_SWAP_SELECTOR")));
        if (selector != expectedSelector) revert SelectorMismatch(expectedSelector, selector);

        IRebalanceSwapAdapter.Route memory crclRoute = IRebalanceSwapAdapter.Route({
            router: router, tokenIn: usdg, tokenOut: crclToken, selector: selector
        });
        IRebalanceSwapAdapter.Route memory spcxRoute = IRebalanceSwapAdapter.Route({
            router: router, tokenIn: usdg, tokenOut: spcxToken, selector: selector
        });

        bytes memory crclCalldata = abi.encodeCall(
            IUniswapV3SwapRouter02.exactInputSingle,
            (
                IUniswapV3SwapRouter02.ExactInputSingleParams({
                    tokenIn: usdg,
                    tokenOut: crclToken,
                    fee: uint24(vm.envUint("BETA_FIRST_POOL_FEE")),
                    recipient: adapter,
                    amountIn: amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        );
        bytes memory spcxCalldata = abi.encodeCall(
            IUniswapV3SwapRouter02.exactInputSingle,
            (
                IUniswapV3SwapRouter02.ExactInputSingleParams({
                    tokenIn: usdg,
                    tokenOut: spcxToken,
                    fee: uint24(vm.envUint("BETA_SECOND_POOL_FEE")),
                    recipient: adapter,
                    amountIn: amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        );

        crcl = Rebalancer.Instruction({
            id: keccak256("FLOATS_MAINNET_BETA_CRCL_REBALANCE_V1"),
            route: crclRoute,
            amountIn: amount,
            slippageBps: slippageBps,
            routerCalldata: crclCalldata
        });
        spcx = Rebalancer.Instruction({
            id: keccak256("FLOATS_MAINNET_BETA_SPCX_REBALANCE_V1"),
            route: spcxRoute,
            amountIn: amount,
            slippageBps: slippageBps,
            routerCalldata: spcxCalldata
        });
    }

    function _authorizationOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        _guardMainnet();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        (Rebalancer.Instruction memory crcl, Rebalancer.Instruction memory spcx) =
            _instructions(rebalancer);
        bytes32 crclHash = rebalancer.hashInstruction(crcl);
        bytes32 spcxHash = rebalancer.hashInstruction(spcx);
        uint48 validAfter = uint48(vm.envUint("BETA_REBALANCE_VALID_AFTER"));
        uint48 deadline = uint48(vm.envUint("BETA_REBALANCE_DEADLINE"));

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(rebalancer);
        payloads[0] = abi.encodeCall(
            Rebalancer.authorizeInstruction, (crclHash, validAfter, deadline)
        );
        targets[1] = address(rebalancer);
        payloads[1] = abi.encodeCall(
            Rebalancer.authorizeInstruction, (spcxHash, validAfter, deadline)
        );
        salt = keccak256(
            abi.encode(
                "FLOATS_MAINNET_BETA_REBALANCE_AUTH_V1",
                crclHash,
                spcxHash,
                validAfter,
                deadline
            )
        );
    }

    function _scheduleAuthorization() internal returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _authorizationOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(
            targets, values, payloads, bytes32(0), salt, timelock.getMinDelay()
        );
        vm.stopBroadcast();
    }

    function _executeAuthorization() internal returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _authorizationOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleMainnetBetaRebalance is MainnetBetaRebalanceConfiguration {
    function run() external returns (bytes32 operationId) {
        return _scheduleAuthorization();
    }
}

contract ExecuteMainnetBetaRebalanceAuthorization is MainnetBetaRebalanceConfiguration {
    function run() external returns (bytes32 operationId) {
        return _executeAuthorization();
    }
}

contract ExecuteMainnetBetaRebalanceSwaps is MainnetBetaRebalanceConfiguration {
    function run() external returns (uint256 crclAmountOut, uint256 spcxAmountOut) {
        _guardMainnet();
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        (Rebalancer.Instruction memory crcl, Rebalancer.Instruction memory spcx) =
            _instructions(rebalancer);
        uint256 privateKey = vm.envUint("KEEPER_PRIVATE_KEY");
        address keeper = vm.addr(privateKey);
        address expectedKeeper = vm.envAddress("KEEPER_ADDRESS");
        if (keeper != expectedKeeper) revert KeeperMismatch(expectedKeeper, keeper);

        vm.startBroadcast(privateKey);
        crclAmountOut = rebalancer.executeInstruction(crcl);
        spcxAmountOut = rebalancer.executeInstruction(spcx);
        vm.stopBroadcast();
    }
}
