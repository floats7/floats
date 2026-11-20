// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { OptionToken } from "../src/options/OptionToken.sol";
import { OptionsVault } from "../src/options/OptionsVault.sol";
import { QuoteVerifier } from "../src/options/QuoteVerifier.sol";
import { RiskManager } from "../src/options/RiskManager.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";
import { SettlementEngine } from "../src/options/SettlementEngine.sol";

interface ConfigureOptionsVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract OptionsConfiguration {
    ConfigureOptionsVm internal constant vm =
        ConfigureOptionsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        timelock = TimelockController(payable(vm.envAddress("TIMELOCK_ADDRESS")));
        SeriesRegistry registry = SeriesRegistry(vm.envAddress("OPTIONS_SERIES_REGISTRY_ADDRESS"));
        OptionToken token = OptionToken(vm.envAddress("OPTION_TOKEN_ADDRESS"));
        OptionsVault vault = OptionsVault(vm.envAddress("OPTIONS_VAULT_ADDRESS"));
        QuoteVerifier verifier = QuoteVerifier(vm.envAddress("QUOTE_VERIFIER_ADDRESS"));
        SettlementEngine engine =
            SettlementEngine(vm.envAddress("OPTIONS_SETTLEMENT_ENGINE_ADDRESS"));
        RiskManager risk = RiskManager(vm.envAddress("OPTIONS_RISK_MANAGER_ADDRESS"));
        address market = vm.envAddress("OPTIONS_MARKET_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        targets = new address[](15);
        values = new uint256[](15);
        payloads = new bytes[](15);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(SeriesRegistry.setSettlementEngine, (address(engine)));
        targets[1] = address(registry);
        payloads[1] = abi.encodeCall(SeriesRegistry.setKeeper, (keeper, true));
        targets[2] = address(token);
        payloads[2] = abi.encodeCall(OptionToken.setMarket, (market));
        targets[3] = address(token);
        payloads[3] = abi.encodeCall(OptionToken.setSettlementEngine, (address(engine)));
        targets[4] = address(vault);
        payloads[4] = abi.encodeCall(OptionsVault.setMarket, (address(engine)));
        targets[5] = address(vault);
        payloads[5] = abi.encodeCall(OptionsVault.setSettlementEngine, (address(engine)));
        targets[6] = address(vault);
        payloads[6] = abi.encodeCall(OptionsVault.setKeeper, (keeper, true));
        targets[7] = address(verifier);
        payloads[7] = abi.encodeCall(QuoteVerifier.setMarket, (market));
        targets[8] = address(verifier);
        payloads[8] = abi.encodeCall(
            QuoteVerifier.setSigner, (vm.envAddress("OPTIONS_QUOTE_SIGNER_ADDRESS"), true)
        );
        targets[9] = address(engine);
        payloads[9] = abi.encodeCall(SettlementEngine.setMarket, (market));
        targets[10] = address(engine);
        payloads[10] = abi.encodeCall(SettlementEngine.setRiskManager, (address(risk)));
        targets[11] = address(risk);
        payloads[11] = abi.encodeCall(RiskManager.setMarket, (market));
        targets[12] = address(risk);
        payloads[12] = abi.encodeCall(RiskManager.setSettlementEngine, (address(engine)));
        targets[13] = address(vault);
        payloads[13] = abi.encodeCall(
            OptionsVault.configureYieldVault, (IERC4626(vm.envAddress("FUSD_VAULT_ADDRESS")))
        );
        targets[14] = address(vault);
        payloads[14] = abi.encodeCall(
            OptionsVault.setYieldBufferBps, (vm.envUint("OPTIONS_YIELD_BUFFER_BPS"))
        );
        salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_CONFIGURATION", block.chainid, vm.envString("DEPLOYMENT_VERSION")
            )
        );
    }
}

contract ScheduleOptionsConfiguration is OptionsConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), salt, timelock.getMinDelay());
        vm.stopBroadcast();
    }
}

contract ExecuteOptionsConfiguration is OptionsConfiguration {
    function run() external returns (bytes32 operationId) {
        (
            TimelockController timelock,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory payloads,
            bytes32 salt
        ) = _operation();
        operationId = timelock.hashOperationBatch(targets, values, payloads, bytes32(0), salt);
        vm.startBroadcast(vm.envUint("ADMIN_PRIVATE_KEY"));
        timelock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.stopBroadcast();
    }
}
