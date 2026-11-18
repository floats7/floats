// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Rebalancer } from "../src/rebalance/Rebalancer.sol";
import { SwapAdapter } from "../src/swap/SwapAdapter.sol";

interface MainnetRoutesVm {
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Timelock operations for the bounded mainnet beta buy routes.
abstract contract MainnetRebalanceRoutesConfiguration {
    MainnetRoutesVm internal constant vm =
        MainnetRoutesVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant MAINNET_CHAIN_ID = 4_663;

    error MainnetOnly(uint256 chainId);
    error SelectorOutOfRange(uint256 selector);

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
        if (block.chainid != MAINNET_CHAIN_ID) revert MainnetOnly(block.chainid);

        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        SwapAdapter adapter = SwapAdapter(vm.envAddress("SWAP_ADAPTER_ADDRESS"));
        Rebalancer rebalancer = Rebalancer(vm.envAddress("REBALANCER_ADDRESS"));
        address router = vm.envAddress("BETA_SWAP_ROUTER_ADDRESS");
        address usdg = vm.envAddress("USDG_ADDRESS");
        uint256 rawSelector = vm.envUint("BETA_SWAP_SELECTOR");
        if (rawSelector > type(uint32).max) revert SelectorOutOfRange(rawSelector);
        bytes4 selector = bytes4(uint32(rawSelector));

        SwapAdapter.Route memory crclRoute = SwapAdapter.Route({
            router: router,
            tokenIn: usdg,
            tokenOut: vm.envAddress("BETA_FIRST_TOKEN_ADDRESS"),
            selector: selector
        });
        SwapAdapter.Route memory spcxRoute = SwapAdapter.Route({
            router: router,
            tokenIn: usdg,
            tokenOut: vm.envAddress("BETA_SECOND_TOKEN_ADDRESS"),
            selector: selector
        });
        uint256 chunkLimit = vm.envUint("BETA_REBALANCE_CHUNK_USDG");

        targets = new address[](3);
        values = new uint256[](3);
        payloads = new bytes[](3);
        targets[0] = address(adapter);
        payloads[0] = abi.encodeCall(SwapAdapter.setRoute, (crclRoute, true));
        targets[1] = address(adapter);
        payloads[1] = abi.encodeCall(SwapAdapter.setRoute, (spcxRoute, true));
        targets[2] = address(rebalancer);
        payloads[2] = abi.encodeCall(Rebalancer.setChunkLimit, (usdg, chunkLimit));
        salt = keccak256(
            abi.encode(
                "FLOATS_MAINNET_BETA_BUY_ROUTES_V1",
                adapter.routeKey(crclRoute),
                adapter.routeKey(spcxRoute),
                chunkLimit
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
        timelock.scheduleBatch(
            targets, values, payloads, bytes32(0), salt, timelock.getMinDelay()
        );
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

contract ScheduleMainnetRebalanceRoutes is MainnetRebalanceRoutesConfiguration {
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

contract ExecuteMainnetRebalanceRoutes is MainnetRebalanceRoutesConfiguration {
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
