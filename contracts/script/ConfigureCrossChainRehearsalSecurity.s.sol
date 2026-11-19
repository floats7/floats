// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import {
    IMessageLibManager,
    SetConfigParam
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";

interface ConfigureCrossChainRehearsalSecurityVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Pins the LayerZero libraries and two-DVN policy through the local governance timelock.
contract ConfigureCrossChainRehearsalSecurity {
    error InvalidAddress(string name);
    error InvalidUint32(uint256 value);
    error InvalidUint64(uint256 value);
    error UnsupportedChain(uint256 chainId);

    uint32 private constant EXECUTOR_CONFIG_TYPE = 1;
    uint32 private constant ULN_CONFIG_TYPE = 2;

    struct ExecutorConfig {
        uint32 maxMessageSize;
        address executor;
    }

    struct UlnConfig {
        uint64 confirmations;
        uint8 requiredDVNCount;
        uint8 optionalDVNCount;
        uint8 optionalDVNThreshold;
        address[] requiredDVNs;
        address[] optionalDVNs;
    }

    struct Configuration {
        TimelockController timelock;
        IMessageLibManager endpoint;
        address fipo;
        address nav;
        address sendLibrary;
        address receiveLibrary;
        address executor;
        address firstDvn;
        address secondDvn;
        uint32 remoteEid;
        uint32 maxMessageSize;
        uint64 sendConfirmations;
        uint64 receiveConfirmations;
        uint256 operatorKey;
        string version;
    }

    ConfigureCrossChainRehearsalSecurityVm private constant vm =
        ConfigureCrossChainRehearsalSecurityVm(
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
        uint256 remoteEid;
        uint256 maxMessageSize = vm.envUint("CROSSCHAIN_MAX_MESSAGE_SIZE");
        if (maxMessageSize == 0 || maxMessageSize > type(uint32).max) {
            revert InvalidUint32(maxMessageSize);
        }

        config.maxMessageSize = uint32(maxMessageSize);
        config.version = vm.envString("CROSSCHAIN_DEPLOYMENT_VERSION");

        if (block.chainid == hubChainId) {
            config.timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
            config.endpoint = IMessageLibManager(vm.envAddress("CROSSCHAIN_HUB_ENDPOINT_V2"));
            config.fipo = vm.envAddress("CROSSCHAIN_HUB_FIPO_ADDRESS");
            config.nav = vm.envAddress("CROSSCHAIN_HUB_NAV_ADDRESS");
            config.sendLibrary = vm.envAddress("CROSSCHAIN_HUB_SEND_LIBRARY");
            config.receiveLibrary = vm.envAddress("CROSSCHAIN_HUB_RECEIVE_LIBRARY");
            config.executor = vm.envAddress("CROSSCHAIN_HUB_EXECUTOR");
            config.firstDvn = vm.envAddress("CROSSCHAIN_HUB_DVN_1");
            config.secondDvn = vm.envAddress("CROSSCHAIN_HUB_DVN_2");
            config.sendConfirmations = _uint64("CROSSCHAIN_HUB_SEND_CONFIRMATIONS");
            config.receiveConfirmations = _uint64("CROSSCHAIN_HUB_RECEIVE_CONFIRMATIONS");
            remoteEid = vm.envUint("CROSSCHAIN_SPOKE_EID");
            config.operatorKey = vm.envUint("ADMIN_PRIVATE_KEY");
        } else if (block.chainid == spokeChainId) {
            config.timelock =
                TimelockController(payable(vm.envAddress("CROSSCHAIN_SPOKE_TIMELOCK_ADDRESS")));
            config.endpoint = IMessageLibManager(vm.envAddress("CROSSCHAIN_SPOKE_ENDPOINT_V2"));
            config.fipo = vm.envAddress("CROSSCHAIN_SPOKE_FIPO_ADDRESS");
            config.nav = vm.envAddress("CROSSCHAIN_SPOKE_NAV_ADDRESS");
            config.sendLibrary = vm.envAddress("CROSSCHAIN_SPOKE_SEND_LIBRARY");
            config.receiveLibrary = vm.envAddress("CROSSCHAIN_SPOKE_RECEIVE_LIBRARY");
            config.executor = vm.envAddress("CROSSCHAIN_SPOKE_EXECUTOR");
            config.firstDvn = vm.envAddress("CROSSCHAIN_SPOKE_DVN_1");
            config.secondDvn = vm.envAddress("CROSSCHAIN_SPOKE_DVN_2");
            config.sendConfirmations = _uint64("CROSSCHAIN_SPOKE_SEND_CONFIRMATIONS");
            config.receiveConfirmations = _uint64("CROSSCHAIN_SPOKE_RECEIVE_CONFIRMATIONS");
            remoteEid = vm.envUint("CROSSCHAIN_HUB_EID");
            config.operatorKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        } else {
            revert UnsupportedChain(block.chainid);
        }

        if (remoteEid == 0 || remoteEid > type(uint32).max) revert InvalidUint32(remoteEid);
        config.remoteEid = uint32(remoteEid);
        _validate(config);
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
        (bool fipoSendLibraryChange, bool fipoReceiveLibraryChange) =
            _libraryChanges(config, config.fipo);
        (bool navSendLibraryChange, bool navReceiveLibraryChange) =
            _libraryChanges(config, config.nav);
        uint256 operationCount = 4 + (fipoSendLibraryChange ? 1 : 0)
            + (fipoReceiveLibraryChange ? 1 : 0) + (navSendLibraryChange ? 1 : 0)
            + (navReceiveLibraryChange ? 1 : 0);
        targets = new address[](operationCount);
        values = new uint256[](operationCount);
        payloads = new bytes[](operationCount);
        address endpoint = address(config.endpoint);
        for (uint256 index; index < targets.length; ++index) {
            targets[index] = endpoint;
        }

        uint256 nextIndex = _writeOappOperations(
            config, config.fipo, payloads, 0, fipoSendLibraryChange, fipoReceiveLibraryChange
        );
        _writeOappOperations(
            config, config.nav, payloads, nextIndex, navSendLibraryChange, navReceiveLibraryChange
        );
        salt = _salt(config);
    }

    function _writeOappOperations(
        Configuration memory config,
        address oapp,
        bytes[] memory payloads,
        uint256 index,
        bool sendLibraryChange,
        bool receiveLibraryChange
    ) private pure returns (uint256 nextIndex) {
        if (sendLibraryChange) {
            payloads[index++] = abi.encodeCall(
                IMessageLibManager.setSendLibrary, (oapp, config.remoteEid, config.sendLibrary)
            );
        }
        if (receiveLibraryChange) {
            payloads[index++] = abi.encodeCall(
                IMessageLibManager.setReceiveLibrary,
                (oapp, config.remoteEid, config.receiveLibrary, 0)
            );
        }

        SetConfigParam[] memory sendParams = new SetConfigParam[](2);
        sendParams[0] = SetConfigParam({
            eid: config.remoteEid,
            configType: EXECUTOR_CONFIG_TYPE,
            config: abi.encode(
                ExecutorConfig({ maxMessageSize: config.maxMessageSize, executor: config.executor })
            )
        });
        sendParams[1] = SetConfigParam({
            eid: config.remoteEid,
            configType: ULN_CONFIG_TYPE,
            config: _encodedUln(config, config.sendConfirmations)
        });
        payloads[index++] =
            abi.encodeCall(IMessageLibManager.setConfig, (oapp, config.sendLibrary, sendParams));

        SetConfigParam[] memory receiveParams = new SetConfigParam[](1);
        receiveParams[0] = SetConfigParam({
            eid: config.remoteEid,
            configType: ULN_CONFIG_TYPE,
            config: _encodedUln(config, config.receiveConfirmations)
        });
        payloads[index++] = abi.encodeCall(
            IMessageLibManager.setConfig, (oapp, config.receiveLibrary, receiveParams)
        );
        return index;
    }

    function _libraryChanges(Configuration memory config, address oapp)
        private
        view
        returns (bool sendLibraryChange, bool receiveLibraryChange)
    {
        sendLibraryChange =
            config.endpoint.getSendLibrary(oapp, config.remoteEid) != config.sendLibrary;
        (address receiveLibrary,) = config.endpoint.getReceiveLibrary(oapp, config.remoteEid);
        receiveLibraryChange = receiveLibrary != config.receiveLibrary;
    }

    function _salt(Configuration memory config) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                "FLOATS_SEPOLIA_REHEARSAL_SECURITY",
                block.chainid,
                config.version,
                config.sendLibrary,
                config.receiveLibrary,
                config.executor,
                config.firstDvn,
                config.secondDvn,
                config.sendConfirmations,
                config.receiveConfirmations,
                config.maxMessageSize
            )
        );
    }

    function _encodedUln(Configuration memory config, uint64 confirmations)
        private
        pure
        returns (bytes memory)
    {
        address[] memory requiredDvns = new address[](2);
        (requiredDvns[0], requiredDvns[1]) = config.firstDvn < config.secondDvn
            ? (config.firstDvn, config.secondDvn)
            : (config.secondDvn, config.firstDvn);
        return abi.encode(
            UlnConfig({
                confirmations: confirmations,
                requiredDVNCount: 2,
                optionalDVNCount: 0,
                optionalDVNThreshold: 0,
                requiredDVNs: requiredDvns,
                optionalDVNs: new address[](0)
            })
        );
    }

    function _uint64(string memory name) private returns (uint64 value) {
        uint256 raw = vm.envUint(name);
        if (raw == 0 || raw > type(uint64).max) revert InvalidUint64(raw);
        value = uint64(raw);
    }

    function _validate(Configuration memory config) private pure {
        if (address(config.endpoint) == address(0)) revert InvalidAddress("endpoint");
        if (config.fipo == address(0)) revert InvalidAddress("fipo");
        if (config.nav == address(0)) revert InvalidAddress("nav");
        if (config.sendLibrary == address(0)) revert InvalidAddress("sendLibrary");
        if (config.receiveLibrary == address(0)) revert InvalidAddress("receiveLibrary");
        if (config.executor == address(0)) revert InvalidAddress("executor");
        if (config.firstDvn == address(0)) revert InvalidAddress("firstDvn");
        if (config.secondDvn == address(0)) revert InvalidAddress("secondDvn");
        if (config.firstDvn == config.secondDvn) revert InvalidAddress("duplicateDvn");
    }
}
