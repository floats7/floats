// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FundingEngine } from "../src/perps/FundingEngine.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsTypes } from "../src/perps/PerpsTypes.sol";

interface ConfigurePerpsMarketVm {
    function envAddress(string calldata name) external returns (address value);
    function envBool(string calldata name) external returns (bool value);
    function envBytes32(string calldata name) external returns (bytes32 value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract PerpsMarketConfiguration {
    ConfigurePerpsMarketVm internal constant vm =
        ConfigurePerpsMarketVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ConfigurationValueOutOfRange(string key, uint256 value);

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
        FundingEngine funding = FundingEngine(vm.envAddress("PERPS_FUNDING_ENGINE_ADDRESS"));
        bytes32 marketId = vm.envBytes32("PERPS_CONFIG_MARKET_ID");
        PerpsTypes.MarketConfig memory config = PerpsTypes.MarketConfig({
            underlying: vm.envAddress("PERPS_CONFIG_UNDERLYING_ADDRESS"),
            underlyingUid: vm.envBytes32("PERPS_CONFIG_UNDERLYING_UID"),
            symbol: vm.envBytes32("PERPS_CONFIG_SYMBOL"),
            priceFeed: vm.envAddress("PERPS_CONFIG_PRICE_FEED_ADDRESS"),
            maxLeverageBps: _uint32("PERPS_CONFIG_MAX_LEVERAGE_BPS"),
            initialMarginBps: _uint32("PERPS_CONFIG_INITIAL_MARGIN_BPS"),
            maintenanceMarginBps: _uint32("PERPS_CONFIG_MAINTENANCE_MARGIN_BPS"),
            openInterestCapBps: _uint32("PERPS_CONFIG_OPEN_INTEREST_CAP_BPS"),
            baseSpreadBps: _uint32("PERPS_CONFIG_BASE_SPREAD_BPS"),
            tradingFeeBps: _uint32("PERPS_CONFIG_TRADING_FEE_BPS"),
            extendedSpreadMultiplierBps: _uint32("PERPS_CONFIG_EXTENDED_SPREAD_MULTIPLIER_BPS"),
            extendedLeverageDivisorBps: _uint32("PERPS_CONFIG_EXTENDED_LEVERAGE_DIVISOR_BPS"),
            maxPriceAge: _uint48("PERPS_CONFIG_MAX_PRICE_AGE_SECONDS"),
            isolatedOnly: vm.envBool("PERPS_CONFIG_ISOLATED_ONLY")
        });

        targets = new address[](2);
        values = new uint256[](2);
        payloads = new bytes[](2);
        targets[0] = address(registry);
        payloads[0] = abi.encodeCall(PerpsMarketRegistry.createMarket, (marketId, config));
        targets[1] = address(funding);
        payloads[1] = abi.encodeCall(
            FundingEngine.configureMarket,
            (
                marketId,
                vm.envUint("PERPS_CONFIG_FUNDING_SKEW_COEFFICIENT_18"),
                vm.envUint("PERPS_CONFIG_MAX_FUNDING_RATE_18")
            )
        );
        salt = keccak256(
            abi.encode(
                "FLOATS_PERPS_MARKET_CONFIGURATION",
                block.chainid,
                vm.envString("PERPS_DEPLOYMENT_VERSION"),
                marketId
            )
        );
    }

    function _uint32(string memory key) private returns (uint32 result) {
        uint256 value = vm.envUint(key);
        if (value > type(uint32).max) revert ConfigurationValueOutOfRange(key, value);
        result = uint32(value);
    }

    function _uint48(string memory key) private returns (uint48 result) {
        uint256 value = vm.envUint(key);
        if (value > type(uint48).max) revert ConfigurationValueOutOfRange(key, value);
        result = uint48(value);
    }
}

contract SchedulePerpsMarketConfiguration is PerpsMarketConfiguration {
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

contract ExecutePerpsMarketConfiguration is PerpsMarketConfiguration {
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
