// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsVault } from "../src/core/FloatsVault.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { NavOracle } from "../src/oracle/NavOracle.sol";
import { Rebalancer, IRebalanceSwapAdapter } from "../src/rebalance/Rebalancer.sol";
import { SwapAdapter } from "../src/swap/SwapAdapter.sol";
import { FloatsTestFastEntryStock } from "../src/testnet/FloatsTestFastEntryStock.sol";
import { FloatsTestStock } from "../src/testnet/FloatsTestStock.sol";
import { FloatsTestSwapRouter } from "../src/testnet/FloatsTestSwapRouter.sol";

interface FastEntryVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract FastEntryConfiguration {
    FastEntryVm internal constant vm =
        FastEntryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error TestnetOnly(uint256 chainId);

    struct TimelockOperation {
        TimelockController timelock;
        address[] targets;
        uint256[] values;
        bytes[] payloads;
        bytes32 salt;
    }

    function _guard() internal view {
        if (block.chainid != 46_630) revert TestnetOnly(block.chainid);
    }

    function _inputs() internal returns (IndexRegistry.ConstituentInput[] memory inputs) {
        address first = vm.envAddress("TEST_STOCK_ADDRESS");
        address second = vm.envAddress("FAST_ENTRY_STOCK_ADDRESS");
        inputs = new IndexRegistry.ConstituentInput[](2);
        inputs[0] = IndexRegistry.ConstituentInput({
            token: first,
            feed: vm.envAddress("TEST_PRICE_FEED_ADDRESS"),
            uid: FloatsTestStock(first).ASSET_UID(),
            targetWeightBps: 5_000,
            eligibleFrom: 0,
            exitAfter: 0
        });
        inputs[1] = IndexRegistry.ConstituentInput({
            token: second,
            feed: vm.envAddress("FAST_ENTRY_PRICE_FEED_ADDRESS"),
            uid: FloatsTestFastEntryStock(second).ASSET_UID(),
            targetWeightBps: 5_000,
            eligibleFrom: 0,
            exitAfter: 0
        });
    }

    function _route() internal returns (IRebalanceSwapAdapter.Route memory route) {
        route = IRebalanceSwapAdapter.Route({
            router: vm.envAddress("FAST_ENTRY_SWAP_ROUTER_ADDRESS"),
            tokenIn: vm.envAddress("USDG_ADDRESS"),
            tokenOut: vm.envAddress("FAST_ENTRY_STOCK_ADDRESS"),
            selector: FloatsTestSwapRouter.swapExactInput.selector
        });
    }

    function _instruction() internal returns (Rebalancer.Instruction memory instruction) {
        IRebalanceSwapAdapter.Route memory route = _route();
        uint256 amount = vm.envUint("FAST_ENTRY_REBALANCE_AMOUNT");
        instruction = Rebalancer.Instruction({
            id: keccak256("FLOATS_TESTNET_FAST_ENTRY_CANARY_V1"),
            route: route,
            amountIn: amount,
            slippageBps: 0,
            routerCalldata: abi.encodeCall(
                FloatsTestSwapRouter.swapExactInput,
                (route.tokenIn, route.tokenOut, amount)
            )
        });
    }

    function _proposalOperation() internal returns (TimelockOperation memory op) {
        _guard();
        op.timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        NavOracle oracle = NavOracle(vm.envAddress("NAV_ORACLE_ADDRESS"));
        SwapAdapter adapter = SwapAdapter(vm.envAddress("SWAP_ADAPTER_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _inputs();
        IRebalanceSwapAdapter.Route memory route = _route();
        op.targets = new address[](4);
        op.values = new uint256[](4);
        op.payloads = new bytes[](4);

        op.targets[0] = address(registry);
        op.payloads[0] = abi.encodeCall(
            IndexRegistry.proposeConfiguration,
            (inputs, uint48(vm.envUint("FAST_ENTRY_REGISTRY_VALID_AFTER")))
        );
        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory ages = new uint32[](1);
        tokens[0] = route.tokenOut;
        feeds[0] = vm.envAddress("FAST_ENTRY_PRICE_FEED_ADDRESS");
        ages[0] = 30 days;
        op.targets[1] = address(oracle);
        op.payloads[1] = abi.encodeCall(NavOracle.configureFeeds, (tokens, feeds, ages));
        op.targets[2] = address(adapter);
        op.payloads[2] = abi.encodeCall(SwapAdapter.setRoute, (SwapAdapter.Route({
            router: route.router,
            tokenIn: route.tokenIn,
            tokenOut: route.tokenOut,
            selector: route.selector
        }), true));
        op.targets[3] = address(rebalancer);
        op.payloads[3] = abi.encodeCall(
            Rebalancer.setKeeper,
            (vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY")), true)
        );
        op.salt = keccak256("FLOATS_FAST_ENTRY_PROPOSAL_V1");
    }

    function _activationOperation() internal returns (TimelockOperation memory op) {
        _guard();
        op.timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        Rebalancer.Instruction memory instruction = _instruction();
        op.targets = new address[](2);
        op.values = new uint256[](2);
        op.payloads = new bytes[](2);
        op.targets[0] = address(registry);
        op.payloads[0] = abi.encodeCall(IndexRegistry.executeConfiguration, (_inputs()));
        op.targets[1] = address(rebalancer);
        op.payloads[1] = abi.encodeCall(
            Rebalancer.authorizeInstruction,
            (
                rebalancer.hashInstruction(instruction),
                uint48(0),
                uint48(vm.envUint("FAST_ENTRY_INSTRUCTION_DEADLINE"))
            )
        );
        op.salt = keccak256("FLOATS_FAST_ENTRY_ACTIVATION_V1");
    }

    function _cleanupOperation() internal returns (TimelockOperation memory op) {
        _guard();
        op.timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        op.targets = new address[](1);
        op.values = new uint256[](1);
        op.payloads = new bytes[](1);
        op.targets[0] = address(rebalancer);
        op.payloads[0] = abi.encodeCall(
            Rebalancer.setKeeper,
            (vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY")), false)
        );
        op.salt = keccak256("FLOATS_FAST_ENTRY_CLEANUP_V1");
    }

    function _schedule(TimelockOperation memory op) internal returns (bytes32 operationId) {
        operationId = op.timelock.hashOperationBatch(
            op.targets, op.values, op.payloads, bytes32(0), op.salt
        );
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        op.timelock.scheduleBatch(
            op.targets, op.values, op.payloads, bytes32(0), op.salt, op.timelock.getMinDelay()
        );
        vm.stopBroadcast();
    }

    function _execute(TimelockOperation memory op) internal returns (bytes32 operationId) {
        operationId = op.timelock.hashOperationBatch(
            op.targets, op.values, op.payloads, bytes32(0), op.salt
        );
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        op.timelock.executeBatch(op.targets, op.values, op.payloads, bytes32(0), op.salt);
        vm.stopBroadcast();
    }
}

contract ScheduleFastEntryProposal is FastEntryConfiguration {
    function run() external returns (bytes32) {
        return _schedule(_proposalOperation());
    }
}

contract ExecuteFastEntryProposal is FastEntryConfiguration {
    function run() external returns (bytes32) {
        return _execute(_proposalOperation());
    }
}

contract ScheduleFastEntryActivation is FastEntryConfiguration {
    function run() external returns (bytes32 activationId, bytes32 cleanupId) {
        activationId = _schedule(_activationOperation());
        cleanupId = _schedule(_cleanupOperation());
    }
}

contract ExecuteFastEntryActivation is FastEntryConfiguration {
    function run() external returns (bytes32) {
        return _execute(_activationOperation());
    }
}

contract ExecuteFastEntryCleanup is FastEntryConfiguration {
    function run() external returns (bytes32) {
        return _execute(_cleanupOperation());
    }
}

contract ExecuteFastEntryRebalance is FastEntryConfiguration {
    event FastEntryCompleted(bytes32 indexed instructionHash, uint256 amountOut);

    error FastEntryInvariantFailed();

    function run() external returns (bytes32 instructionHash, uint256 amountOut) {
        _guard();
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        FloatsVault vault = FloatsVault(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        IERC20 stock = IERC20(vm.envAddress("FAST_ENTRY_STOCK_ADDRESS"));
        Rebalancer.Instruction memory instruction = _instruction();
        instructionHash = rebalancer.hashInstruction(instruction);
        uint256 navBefore = vault.totalAssets();
        uint256 stockBefore = stock.balanceOf(address(vault));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        amountOut = rebalancer.executeInstruction(instruction);
        vm.stopBroadcast();

        if (
            !rebalancer.isExecuted(instructionHash)
                || stock.balanceOf(address(vault)) != stockBefore + amountOut
                || vault.totalAssets() != navBefore || amountOut == 0
        ) revert FastEntryInvariantFailed();
        emit FastEntryCompleted(instructionHash, amountOut);
    }
}
