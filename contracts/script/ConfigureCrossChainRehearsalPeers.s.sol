// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";

interface ConfigureCrossChainRehearsalPeersVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

interface IRehearsalPeer {
    function setPeer(uint32 eid, bytes32 peer) external;
}

interface IRehearsalRateLimit {
    function setRateLimit(uint32 eid, bool inbound, uint128 capacity, uint64 window) external;
}

/// @notice Schedules and executes the peer/rate-limit batch through the local chain timelock.
contract ConfigureCrossChainRehearsalPeers {
    error UnsupportedChain(uint256 chainId);
    error InvalidUint32(uint256 value);
    error InvalidUint128(uint256 value);
    error InvalidUint64(uint256 value);

    struct Configuration {
        TimelockController timelock;
        address fipo;
        address nav;
        address remoteFipo;
        address remoteNav;
        uint32 remoteEid;
        uint128 inboundCapacity;
        uint128 outboundCapacity;
        uint64 rateWindow;
        uint256 operatorKey;
        string version;
    }

    ConfigureCrossChainRehearsalPeersVm private constant vm = ConfigureCrossChainRehearsalPeersVm(
        address(uint160(uint256(keccak256("hevm cheat code"))))
    );

    function run() external returns (bytes32 operationId) {
        Configuration memory config = _configuration();
        (address[] memory targets, uint256[] memory values, bytes[] memory payloads, bytes32 salt) =
            _operation(config);
        uint256 delay = config.timelock.getMinDelay();

        vm.startBroadcast(config.operatorKey);
        config.timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, delay);
        vm.stopBroadcast();
        return config.timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
    }

    function execute() external returns (bytes32 operationId) {
        Configuration memory config = _configuration();
        (address[] memory targets, uint256[] memory values, bytes[] memory payloads, bytes32 salt) =
            _operation(config);
        operationId =
            config.timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);

        vm.startBroadcast(config.operatorKey);
        config.timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }

    function _configuration() private returns (Configuration memory config) {
        uint256 hubChainId = vm.envUint("CROSSCHAIN_HUB_CHAIN_ID");
        uint256 spokeChainId = vm.envUint("CROSSCHAIN_SPOKE_CHAIN_ID");
        uint256 inbound = vm.envUint("CROSSCHAIN_FIPO_INBOUND_CAPACITY");
        uint256 outbound = vm.envUint("CROSSCHAIN_FIPO_OUTBOUND_CAPACITY");
        uint256 window = vm.envUint("CROSSCHAIN_FIPO_RATE_WINDOW_SECONDS");
        uint256 remoteEid;
        if (inbound == 0 || inbound > type(uint128).max) revert InvalidUint128(inbound);
        if (outbound == 0 || outbound > type(uint128).max) revert InvalidUint128(outbound);
        if (window == 0 || window > type(uint64).max) revert InvalidUint64(window);

        config.inboundCapacity = uint128(inbound);
        config.outboundCapacity = uint128(outbound);
        config.rateWindow = uint64(window);
        config.version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");

        if (block.chainid == hubChainId) {
            config.timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
            config.fipo = vm.envAddress("CROSSCHAIN_HUB_FIPO_ADDRESS");
            config.nav = vm.envAddress("CROSSCHAIN_HUB_NAV_ADDRESS");
            config.remoteFipo = vm.envAddress("CROSSCHAIN_SPOKE_FIPO_ADDRESS");
            config.remoteNav = vm.envAddress("CROSSCHAIN_SPOKE_NAV_ADDRESS");
            remoteEid = vm.envUint("CROSSCHAIN_SPOKE_EID");
            config.operatorKey = vm.envUint("ADMIN_PRIVATE_KEY");
        } else if (block.chainid == spokeChainId) {
            config.timelock =
                TimelockController(payable(vm.envAddress("CROSSCHAIN_SPOKE_TIMELOCK_ADDRESS")));
            config.fipo = vm.envAddress("CROSSCHAIN_SPOKE_FIPO_ADDRESS");
            config.nav = vm.envAddress("CROSSCHAIN_SPOKE_NAV_ADDRESS");
            config.remoteFipo = vm.envAddress("CROSSCHAIN_HUB_FIPO_ADDRESS");
            config.remoteNav = vm.envAddress("CROSSCHAIN_HUB_NAV_ADDRESS");
            remoteEid = vm.envUint("CROSSCHAIN_HUB_EID");
            config.operatorKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        } else {
            revert UnsupportedChain(block.chainid);
        }

        if (remoteEid == 0 || remoteEid > type(uint32).max) revert InvalidUint32(remoteEid);
        config.remoteEid = uint32(remoteEid);
    }

    function _operation(Configuration memory config)
        private
        view
        returns (
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        )
    {
        targets = new address[](4);
        values = new uint256[](4);
        payloads = new bytes[](4);
        targets[0] = config.fipo;
        targets[1] = config.nav;
        targets[2] = config.fipo;
        targets[3] = config.fipo;
        payloads[0] = abi.encodeCall(
            IRehearsalPeer.setPeer, (config.remoteEid, bytes32(uint256(uint160(config.remoteFipo))))
        );
        payloads[1] = abi.encodeCall(
            IRehearsalPeer.setPeer, (config.remoteEid, bytes32(uint256(uint160(config.remoteNav))))
        );
        payloads[2] = abi.encodeCall(
            IRehearsalRateLimit.setRateLimit,
            (config.remoteEid, false, config.outboundCapacity, config.rateWindow)
        );
        payloads[3] = abi.encodeCall(
            IRehearsalRateLimit.setRateLimit,
            (config.remoteEid, true, config.inboundCapacity, config.rateWindow)
        );
        salt = keccak256(
            abi.encode("FLOATS_SEPOLIA_REHEARSAL_PEERS", block.chainid, config.version)
        );
    }
}
