// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OptionToken } from "../src/options/OptionToken.sol";
import { OptionsMarket } from "../src/options/OptionsMarket.sol";
import { OptionsVault } from "../src/options/OptionsVault.sol";
import { QuoteVerifier } from "../src/options/QuoteVerifier.sol";
import { RiskManager } from "../src/options/RiskManager.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";
import { SettlementEngine } from "../src/options/SettlementEngine.sol";

interface DeployOptionsVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deterministically deploys Options modules. Wiring is a separate timelock batch.
contract DeployOptions {
    DeployOptionsVm private constant vm =
        DeployOptionsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Deployment {
        SeriesRegistry registry;
        OptionToken optionToken;
        OptionsVault vault;
        QuoteVerifier quoteVerifier;
        SettlementEngine settlementEngine;
        RiskManager riskManager;
        OptionsMarket market;
    }

    event OptionsDeployed(
        string version,
        address registry,
        address optionToken,
        address vault,
        address quoteVerifier,
        address settlementEngine,
        address riskManager,
        address market
    );

    function run() external returns (Deployment memory deployed) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address usdg = vm.envAddress("USDG_ADDRESS");
        string memory version = vm.envString("DEPLOYMENT_VERSION");
        bytes32 root = keccak256(abi.encode("FLOATS_OPTIONS", block.chainid, version));

        vm.startBroadcast(key);
        deployed.registry =
            new SeriesRegistry{ salt: _salt(root, "SERIES_REGISTRY") }(admin, guardian);
        deployed.optionToken = new OptionToken{ salt: _salt(root, "OPTION_TOKEN") }(
            admin, "ipfs://floats-options/{id}.json"
        );
        deployed.vault =
            new OptionsVault{ salt: _salt(root, "OPTIONS_VAULT") }(usdg, admin, guardian);
        deployed.quoteVerifier = new QuoteVerifier{ salt: _salt(root, "QUOTE_VERIFIER") }(
            admin, address(deployed.registry)
        );
        deployed.settlementEngine = new SettlementEngine{ salt: _salt(root, "SETTLEMENT_ENGINE") }(
            admin,
            address(deployed.registry),
            address(deployed.optionToken),
            address(deployed.vault),
            uint48(vm.envUint("OPTIONS_MAX_OBSERVATION_DELAY_SECONDS"))
        );
        deployed.riskManager = new RiskManager{ salt: _salt(root, "RISK_MANAGER") }(
            admin,
            address(deployed.registry),
            address(deployed.vault),
            RiskManager.Limits({
                utilizationBps: uint16(vm.envUint("OPTIONS_UTILIZATION_LIMIT_BPS")),
                underlyingBps: uint16(vm.envUint("OPTIONS_UNDERLYING_LIMIT_BPS")),
                expiryBps: uint16(vm.envUint("OPTIONS_EXPIRY_LIMIT_BPS")),
                seriesBps: uint16(vm.envUint("OPTIONS_SERIES_LIMIT_BPS"))
            })
        );
        deployed.market = new OptionsMarket{ salt: _salt(root, "OPTIONS_MARKET") }(
            usdg,
            address(deployed.vault),
            address(deployed.quoteVerifier),
            address(deployed.settlementEngine),
            address(deployed.optionToken),
            address(deployed.riskManager)
        );
        vm.stopBroadcast();

        emit OptionsDeployed(
            version,
            address(deployed.registry),
            address(deployed.optionToken),
            address(deployed.vault),
            address(deployed.quoteVerifier),
            address(deployed.settlementEngine),
            address(deployed.riskManager),
            address(deployed.market)
        );
    }

    function _salt(bytes32 root, string memory component) private pure returns (bytes32) {
        return keccak256(abi.encode(root, component));
    }
}
