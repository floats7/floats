// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";
import { Rebalancer, IRebalanceSwapAdapter } from "../src/rebalance/Rebalancer.sol";
import { FloatsTestSwapRouter } from "../src/testnet/FloatsTestSwapRouter.sol";

interface RebalanceCanaryVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract RunRebalanceCanary {
    RebalanceCanaryVm private constant vm =
        RebalanceCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error InsufficientBalance(uint256 available, uint256 required);
    error RebalanceInvariantFailed();
    error TestnetOnly(uint256 chainId);

    event RebalanceCanaryCompleted(bytes32 indexed instructionHash, uint256 amountOut);

    function run() external returns (bytes32 instructionHash, uint256 amountOut) {
        if (block.chainid != 46_630) revert TestnetOnly(block.chainid);
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address account = vm.addr(key);
        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));
        IERC20 stock = IERC20(vm.envAddress("TEST_STOCK_ADDRESS"));
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        uint256 depositAssets = vm.envUint("CANARY_USDG_AMOUNT");
        uint256 amountIn = vm.envUint("REBALANCE_FIXTURE_AMOUNT");
        if (usdg.balanceOf(account) < depositAssets) {
            revert InsufficientBalance(usdg.balanceOf(account), depositAssets);
        }

        IRebalanceSwapAdapter.Route memory route = IRebalanceSwapAdapter.Route({
            router: vm.envAddress("TEST_SWAP_ROUTER_ADDRESS"),
            tokenIn: address(usdg),
            tokenOut: address(stock),
            selector: FloatsTestSwapRouter.swapExactInput.selector
        });
        Rebalancer.Instruction memory instruction = Rebalancer.Instruction({
            id: keccak256("FLOATS_TESTNET_REBALANCE_CANARY_V1"),
            route: route,
            amountIn: amountIn,
            slippageBps: 0,
            routerCalldata: abi.encodeCall(
                FloatsTestSwapRouter.swapExactInput,
                (route.tokenIn, route.tokenOut, amountIn)
            )
        });
        instructionHash = rebalancer.hashInstruction(instruction);
        uint256 usdgBefore = usdg.balanceOf(address(vault));
        uint256 stockBefore = stock.balanceOf(address(vault));

        vm.startBroadcast(key);
        usdg.approve(address(vault), depositAssets);
        vault.deposit(depositAssets, account);
        amountOut = rebalancer.executeInstruction(instruction);
        vm.stopBroadcast();

        if (
            !rebalancer.isExecuted(instructionHash)
                || usdg.balanceOf(address(vault)) != usdgBefore + depositAssets - amountIn
                || stock.balanceOf(address(vault)) != stockBefore + amountOut || amountOut == 0
        ) revert RebalanceInvariantFailed();

        emit RebalanceCanaryCompleted(instructionHash, amountOut);
    }
}
