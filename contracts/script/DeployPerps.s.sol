// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { FundingEngine } from "../src/perps/FundingEngine.sol";
import { FIPONavPriceFeed } from "../src/perps/FIPONavPriceFeed.sol";
import { InsuranceFund } from "../src/perps/InsuranceFund.sol";
import { LiquidationEngine } from "../src/perps/LiquidationEngine.sol";
import { MarginAccount } from "../src/perps/MarginAccount.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";
import { PerpsMarket } from "../src/perps/PerpsMarket.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsOracle } from "../src/perps/PerpsOracle.sol";
import { RiskEngine } from "../src/perps/RiskEngine.sol";

interface DeployPerpsVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deterministically deploys disabled Perps modules. Governance performs all wiring.
contract DeployPerps {
    DeployPerpsVm private constant vm =
        DeployPerpsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);

    struct Deployment {
        PerpsMarketRegistry registry;
        PerpsOracle oracle;
        MarginAccount marginAccount;
        PerpsLiquidityVault liquidityVault;
        FundingEngine fundingEngine;
        RiskEngine riskEngine;
        PerpsMarket market;
        InsuranceFund insuranceFund;
        LiquidationEngine liquidationEngine;
        FIPONavPriceFeed fipoPriceFeed;
    }

    event PerpsDeployed(
        string version,
        address registry,
        address oracle,
        address marginAccount,
        address liquidityVault,
        address fundingEngine,
        address riskEngine,
        address market,
        address insuranceFund,
        address liquidationEngine,
        address fipoPriceFeed
    );

    function run() external returns (Deployment memory deployed) {
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        string memory version = vm.envString("PERPS_DEPLOYMENT_VERSION");
        bytes32 root = keccak256(abi.encode("FLOATS_PERPS", block.chainid, version));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        deployed = _deploy(root, governance);
        vm.stopBroadcast();

        _emitDeployment(version, deployed);
    }

    function _deploy(bytes32 root, address governance)
        private
        returns (Deployment memory deployed)
    {
        deployed.registry =
            new PerpsMarketRegistry{ salt: _salt(root, "REGISTRY") }(
                governance, vm.envAddress("GUARDIAN_ADDRESS")
            );
        deployed.fipoPriceFeed =
            new FIPONavPriceFeed{ salt: _salt(root, "FIPO_PRICE_FEED") }(
                vm.envAddress("FLOATS_VAULT_ADDRESS")
            );
        deployed.oracle = new PerpsOracle{ salt: _salt(root, "ORACLE") }(address(deployed.registry));
        deployed.marginAccount = new MarginAccount{ salt: _salt(root, "MARGIN_ACCOUNT") }(
            vm.envAddress("USDG_ADDRESS"), address(deployed.registry), governance
        );
        deployed.liquidityVault = new PerpsLiquidityVault{ salt: _salt(root, "LIQUIDITY_VAULT") }(
            vm.envAddress("USDG_ADDRESS"),
            governance,
            vm.envAddress("GUARDIAN_ADDRESS"),
            uint48(vm.envUint("PERPS_WITHDRAWAL_DELAY_SECONDS"))
        );
        deployed.fundingEngine = new FundingEngine{ salt: _salt(root, "FUNDING_ENGINE") }(
            governance, address(deployed.registry)
        );
        deployed.riskEngine = new RiskEngine{ salt: _salt(root, "RISK_ENGINE") }(
            governance,
            address(deployed.marginAccount),
            address(deployed.registry),
            address(deployed.oracle)
        );
        deployed.market = new PerpsMarket{ salt: _salt(root, "MARKET") }(
            governance,
            address(deployed.registry),
            address(deployed.oracle),
            address(deployed.fundingEngine),
            address(deployed.riskEngine),
            address(deployed.marginAccount),
            address(deployed.liquidityVault),
            vm.envAddress("TREASURY_ADDRESS")
        );
        deployed.insuranceFund =
            new InsuranceFund{ salt: _salt(root, "INSURANCE_FUND") }(
                vm.envAddress("USDG_ADDRESS"), governance
            );
        deployed.liquidationEngine = new LiquidationEngine{
            salt: _salt(root, "LIQUIDATION_ENGINE")
        }(
            governance,
            address(deployed.market),
            address(deployed.marginAccount),
            address(deployed.riskEngine),
            address(deployed.insuranceFund),
            address(deployed.liquidityVault)
        );
    }

    function _emitDeployment(string memory version, Deployment memory deployed) private {
        emit PerpsDeployed(
            version,
            address(deployed.registry),
            address(deployed.oracle),
            address(deployed.marginAccount),
            address(deployed.liquidityVault),
            address(deployed.fundingEngine),
            address(deployed.riskEngine),
            address(deployed.market),
            address(deployed.insuranceFund),
            address(deployed.liquidationEngine),
            address(deployed.fipoPriceFeed)
        );
    }

    function _salt(bytes32 root, string memory component) private pure returns (bytes32) {
        return keccak256(abi.encode(root, component));
    }
}
