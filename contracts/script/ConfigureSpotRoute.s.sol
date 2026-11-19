// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Rebalancer } from "../src/rebalance/Rebalancer.sol";
import { SwapAdapter } from "../src/swap/SwapAdapter.sol";

interface ConfigureSpotRouteVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

interface ISpotPoolInspection {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

interface ISpotFactoryInspection {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

/// @notice Configures one verified USDG-to-asset route without a fixed asset count.
abstract contract SpotRouteConfiguration {
    ConfigureSpotRouteVm internal constant vm =
        ConfigureSpotRouteVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);
    error InvalidAddress();
    error MissingCode(address target);
    error InvalidPool(address expected, address actual);
    error InvalidPoolPair(address token0, address token1);
    error InvalidFeeTier(uint256 fee);
    error InvalidSelector(uint256 selector);
    error InvalidChunkLimit();

    struct RouteConfiguration {
        address router;
        address usdg;
        address token;
        bytes4 selector;
        uint256 chunkLimit;
    }

    function _operation()
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
        RouteConfiguration memory config = _validatedConfiguration();
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        SwapAdapter adapter = SwapAdapter(vm.envAddress("SWAP_ADAPTER_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        _requireCode(address(timelock));
        _requireCode(address(adapter));
        _requireCode(address(rebalancer));
        SwapAdapter.Route memory route = SwapAdapter.Route({
            router: config.router,
            tokenIn: config.usdg,
            tokenOut: config.token,
            selector: config.selector
        });

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(adapter);
        payloads[0] = abi.encodeCall(SwapAdapter.setRoute, (route, true));
        targets[1] = address(rebalancer);
        payloads[1] = abi.encodeCall(Rebalancer.setChunkLimit, (config.usdg, config.chunkLimit));
        salt = keccak256(
            abi.encode(
                "FLOATS_SPOT_ROUTE_V1",
                block.chainid,
                adapter.routeKey(route),
                config.chunkLimit,
                vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }

    function _validatedConfiguration() internal returns (RouteConfiguration memory config) {
        config.router = vm.envAddress("SPOT_ROUTE_ROUTER_ADDRESS");
        address factory = vm.envAddress("SPOT_ROUTE_FACTORY_ADDRESS");
        address pool = vm.envAddress("SPOT_ROUTE_POOL_ADDRESS");
        config.usdg = vm.envAddress("USDG_ADDRESS");
        config.token = vm.envAddress("SPOT_ROUTE_TOKEN_ADDRESS");
        if (
            config.router == address(0) || factory == address(0) || pool == address(0)
                || config.usdg == address(0) || config.token == address(0)
        ) {
            revert InvalidAddress();
        }
        _requireCode(config.router);
        _requireCode(factory);
        _requireCode(pool);
        _requireCode(config.usdg);
        _requireCode(config.token);
        uint256 rawFee = vm.envUint("SPOT_ROUTE_FEE");
        if (rawFee > type(uint24).max) revert InvalidFeeTier(rawFee);
        uint24 fee = uint24(rawFee);
        ISpotPoolInspection inspectedPool = ISpotPoolInspection(pool);
        address token0 = inspectedPool.token0();
        address token1 = inspectedPool.token1();
        if (!((token0 == config.usdg && token1 == config.token)
                    || (token0 == config.token && token1 == config.usdg))) {
            revert InvalidPoolPair(token0, token1);
        }
        if (inspectedPool.fee() != fee) revert InvalidFeeTier(fee);
        address canonicalPool =
            ISpotFactoryInspection(factory).getPool(config.usdg, config.token, fee);
        if (canonicalPool != pool) revert InvalidPool(pool, canonicalPool);
        uint256 rawSelector = vm.envUint("SPOT_ROUTE_SELECTOR");
        if (rawSelector > type(uint32).max) revert InvalidSelector(rawSelector);
        config.selector = bytes4(uint32(rawSelector));
        config.chunkLimit = vm.envUint("SPOT_ROUTE_REBALANCE_CHUNK_USDG");
        if (config.chunkLimit == 0) revert InvalidChunkLimit();
    }

    function _requireCode(address target) internal view {
        if (target.code.length == 0) revert MissingCode(target);
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

contract ScheduleSpotRoute is SpotRouteConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        return _schedule(timelock, targets, values, payloads, salt);
    }
}

contract ExecuteSpotRoute is SpotRouteConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        return _execute(timelock, targets, values, payloads, salt);
    }
}
