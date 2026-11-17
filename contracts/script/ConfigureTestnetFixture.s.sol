// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { NavOracle } from "../src/oracle/NavOracle.sol";
import { Rebalancer, IRebalanceSwapAdapter } from "../src/rebalance/Rebalancer.sol";
import { SwapAdapter } from "../src/swap/SwapAdapter.sol";
import { FloatsTestStock } from "../src/testnet/FloatsTestStock.sol";
import { FloatsTestSwapRouter } from "../src/testnet/FloatsTestSwapRouter.sol";

interface FixtureConfigVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract TestnetFixtureConfiguration {
    FixtureConfigVm internal constant vm =
        FixtureConfigVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint32 internal constant FIXTURE_MAX_AGE = 30 days;

    error TestnetOnly(uint256 chainId);

    function _guardTestnet() internal view {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert TestnetOnly(block.chainid);
    }

    function _input() internal returns (IndexRegistry.ConstituentInput[] memory inputs) {
        inputs = new IndexRegistry.ConstituentInput[](1);
        inputs[0] = IndexRegistry.ConstituentInput({
            token: vm.envAddress("TEST_STOCK_ADDRESS"),
            feed: vm.envAddress("TEST_PRICE_FEED_ADDRESS"),
            uid: FloatsTestStock(vm.envAddress("TEST_STOCK_ADDRESS")).ASSET_UID(),
            targetWeightBps: 10_000,
            eligibleFrom: 0,
            exitAfter: 0
        });
    }

    function _route() internal returns (IRebalanceSwapAdapter.Route memory route) {
        route = IRebalanceSwapAdapter.Route({
            router: vm.envAddress("TEST_SWAP_ROUTER_ADDRESS"),
            tokenIn: vm.envAddress("USDG_ADDRESS"),
            tokenOut: vm.envAddress("TEST_STOCK_ADDRESS"),
            selector: FloatsTestSwapRouter.swapExactInput.selector
        });
    }

    function _instruction() internal returns (Rebalancer.Instruction memory instruction) {
        IRebalanceSwapAdapter.Route memory route = _route();
        uint256 amountIn = vm.envUint("REBALANCE_FIXTURE_AMOUNT");
        instruction = Rebalancer.Instruction({
            id: keccak256("FLOATS_TESTNET_REBALANCE_CANARY_V1"),
            route: route,
            amountIn: amountIn,
            slippageBps: 0,
            routerCalldata: abi.encodeCall(
                FloatsTestSwapRouter.swapExactInput,
                (route.tokenIn, route.tokenOut, amountIn)
            )
        });
    }

    function _setupOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        _guardTestnet();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        NavOracle oracle = NavOracle(vm.envAddress("NAV_ORACLE_ADDRESS"));
        SwapAdapter adapter = SwapAdapter(vm.envAddress("SWAP_ADAPTER_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _input();
        IRebalanceSwapAdapter.Route memory route = _route();

        targets = new address[](5);
        values = new uint256[](5);
        payloads = new bytes[](5);

        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(
            IndexRegistry.proposeConfiguration,
            (inputs, uint48(vm.envUint("FIXTURE_REGISTRY_VALID_AFTER")))
        );

        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory maxAges = new uint32[](1);
        tokens[0] = route.tokenOut;
        feeds[0] = vm.envAddress("TEST_PRICE_FEED_ADDRESS");
        maxAges[0] = FIXTURE_MAX_AGE;
        targets[1] = address(oracle);
        payloads[1] = abi.encodeCall(NavOracle.configureFeeds, (tokens, feeds, maxAges));

        targets[2] = address(adapter);
        payloads[2] = abi.encodeCall(SwapAdapter.setRoute, (SwapAdapter.Route({
            router: route.router,
            tokenIn: route.tokenIn,
            tokenOut: route.tokenOut,
            selector: route.selector
        }), true));
        targets[3] = address(rebalancer);
        payloads[3] = abi.encodeCall(
            Rebalancer.setChunkLimit,
            (route.tokenIn, vm.envUint("REBALANCE_FIXTURE_AMOUNT"))
        );
        targets[4] = address(rebalancer);
        payloads[4] = abi.encodeCall(
            Rebalancer.setKeeper,
            (vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY")), true)
        );
        salt = keccak256("FLOATS_TESTNET_FIXTURE_SETUP_V1");
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
        _guardTestnet();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        IndexRegistry registry = IndexRegistry(vm.envAddress("INDEX_REGISTRY_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        IndexRegistry.ConstituentInput[] memory inputs = _input();
        Rebalancer.Instruction memory instruction = _instruction();

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(IndexRegistry.executeConfiguration, (inputs));
        targets[1] = address(rebalancer);
        payloads[1] = abi.encodeCall(
            Rebalancer.authorizeInstruction,
            (
                rebalancer.hashInstruction(instruction),
                uint48(0),
                uint48(vm.envUint("FIXTURE_INSTRUCTION_DEADLINE"))
            )
        );
        salt = keccak256("FLOATS_TESTNET_FIXTURE_ACTIVATION_V1");
    }

    function _cleanupOperation()
        internal
        returns (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        _guardTestnet();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        targets = new address[](1);
        values = new uint256[](1);
        payloads = new bytes[](1);
        targets[0] = address(rebalancer);
        payloads[0] = abi.encodeCall(
            Rebalancer.setKeeper,
            (vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY")), false)
        );
        salt = keccak256("FLOATS_TESTNET_FIXTURE_KEEPER_CLEANUP_V1");
    }
}

contract ScheduleTestnetFixtureSetup is TestnetFixtureConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _setupOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }
}

contract ExecuteTestnetFixtureSetup is TestnetFixtureConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _setupOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ScheduleTestnetFixtureActivation is TestnetFixtureConfiguration {
    function run() external returns (bytes32 activationId, bytes32 cleanupId) {
        activationId = _scheduleActivation();
        cleanupId = _scheduleCleanup();
    }

    function _scheduleActivation() private returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _activationOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }

    function _scheduleCleanup() private returns (bytes32 operationId) {
        (TimelockController cleanupTimelock, address[] memory cleanupTargets,
            uint256[] memory cleanupValues, bytes[] memory cleanupPayloads, bytes32 cleanupSalt) =
            _cleanupOperation();
        operationId = cleanupTimelock.hashOperationBatch(
            cleanupTargets, cleanupValues, cleanupPayloads, bytes32(0), cleanupSalt
        );
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        cleanupTimelock.scheduleBatch(
            cleanupTargets, cleanupValues, cleanupPayloads, bytes32(0), cleanupSalt,
            cleanupTimelock.getMinDelay()
        );
        vm.stopBroadcast();
    }
}

contract ExecuteTestnetFixtureActivation is TestnetFixtureConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _activationOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}

contract ExecuteTestnetFixtureCleanup is TestnetFixtureConfiguration {
    function run() external returns (bytes32 operationId) {
        (TimelockController timelock, address[] memory targets, uint256[] memory values,
            bytes[] memory payloads, bytes32 salt) = _cleanupOperation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}
