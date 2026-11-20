// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FundingEngine } from "../src/perps/FundingEngine.sol";
import { InsuranceFund } from "../src/perps/InsuranceFund.sol";
import { LiquidationEngine } from "../src/perps/LiquidationEngine.sol";
import { MarginAccount } from "../src/perps/MarginAccount.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";
import { PerpsMarket } from "../src/perps/PerpsMarket.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { RiskEngine } from "../src/perps/RiskEngine.sol";

interface ConfigurePerpsVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract PerpsConfiguration {
    ConfigurePerpsVm internal constant vm =
        ConfigurePerpsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

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
        PerpsMarketRegistry registry = PerpsMarketRegistry(vm.envAddress("PERPS_REGISTRY_ADDRESS"));
        MarginAccount margin = MarginAccount(vm.envAddress("PERPS_MARGIN_ACCOUNT_ADDRESS"));
        PerpsLiquidityVault vault =
            PerpsLiquidityVault(vm.envAddress("PERPS_LIQUIDITY_VAULT_ADDRESS"));
        FundingEngine funding = FundingEngine(vm.envAddress("PERPS_FUNDING_ENGINE_ADDRESS"));
        RiskEngine risk = RiskEngine(vm.envAddress("PERPS_RISK_ENGINE_ADDRESS"));
        PerpsMarket market = PerpsMarket(vm.envAddress("PERPS_MARKET_ADDRESS"));
        InsuranceFund insurance = InsuranceFund(vm.envAddress("PERPS_INSURANCE_FUND_ADDRESS"));
        LiquidationEngine liquidation =
            LiquidationEngine(vm.envAddress("PERPS_LIQUIDATION_ENGINE_ADDRESS"));
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        targets = new address[](11);
        values = new uint256[](11);
        payloads = new bytes[](11);
        targets[0] = address(funding);
        payloads[0] = abi.encodeCall(FundingEngine.setPositionSource, (address(market)));
        targets[1] = address(risk);
        payloads[1] = abi.encodeCall(RiskEngine.setSources, (address(market), address(funding)));
        targets[2] = address(margin);
        payloads[2] = abi.encodeCall(MarginAccount.setRiskEngine, (address(risk)));
        targets[3] = address(margin);
        payloads[3] = abi.encodeCall(MarginAccount.setOperator, (address(market), true));
        targets[4] = address(vault);
        payloads[4] = abi.encodeCall(PerpsLiquidityVault.setOperator, (address(market), true));
        targets[5] = address(vault);
        payloads[5] = abi.encodeCall(PerpsLiquidityVault.setOperator, (address(liquidation), true));
        targets[6] = address(insurance);
        payloads[6] = abi.encodeCall(InsuranceFund.setOperator, (address(liquidation), true));
        targets[7] = address(market);
        payloads[7] = abi.encodeCall(PerpsMarket.setLiquidationEngine, (address(liquidation)));
        targets[8] = address(registry);
        payloads[8] = abi.encodeCall(PerpsMarketRegistry.setKeeper, (keeper, true));
        targets[9] = address(funding);
        payloads[9] = abi.encodeCall(FundingEngine.setKeeper, (keeper, true));
        targets[10] = address(liquidation);
        payloads[10] = abi.encodeCall(LiquidationEngine.setKeeper, (keeper, true));
        salt = keccak256(
            abi.encode(
                "FLOATS_PERPS_CONFIGURATION",
                block.chainid,
                vm.envString("PERPS_DEPLOYMENT_VERSION")
            )
        );
    }
}

contract SchedulePerpsConfiguration is PerpsConfiguration {
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

contract ExecutePerpsConfiguration is PerpsConfiguration {
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
