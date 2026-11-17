// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { FloatsVault, IFloatsIndexRegistry, IFloatsNavOracle } from "../src/core/FloatsVault.sol";
import { FeeModule, IFeeShareVault } from "../src/fees/FeeModule.sol";
import { NavOracle } from "../src/oracle/NavOracle.sol";
import { INavPriceOracle, SwapQuoteOracle } from "../src/oracle/SwapQuoteOracle.sol";
import {
    Rebalancer,
    IRebalanceSwapAdapter,
    IRebalanceVault
} from "../src/rebalance/Rebalancer.sol";
import { IndexRegistry } from "../src/registry/IndexRegistry.sol";
import { SwapAdapter } from "../src/swap/SwapAdapter.sol";

interface DeployVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function addr(uint256 privateKey) external returns (address keyAddr);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deterministic CREATE2 deployment. Governance configuration is a separate timelock step.
contract DeployCore {
    DeployVm private constant vm =
        DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Deployment {
        TimelockController timelock;
        IndexRegistry indexRegistry;
        NavOracle navOracle;
        SwapQuoteOracle swapQuoteOracle;
        SwapAdapter swapAdapter;
        FloatsVault floatsVault;
        FeeModule feeModule;
        Rebalancer rebalancer;
    }

    struct Config {
        uint256 deployerKey;
        address deployer;
        address governanceAdmin;
        address guardian;
        address treasury;
        address usdg;
        uint256 initialTvlCap;
        uint256 timelockDelay;
        string version;
        bytes32 rootSalt;
    }

    event CoreDeployed(
        string version,
        address timelock,
        address indexRegistry,
        address navOracle,
        address swapQuoteOracle,
        address swapAdapter,
        address floatsVault,
        address feeModule,
        address rebalancer
    );

    function run() external returns (Deployment memory deployed) {
        Config memory config = _loadConfig();
        vm.startBroadcast(config.deployerKey);
        deployed.timelock = _deployTimelock(config);
        _deployModules(config, deployed);
        vm.stopBroadcast();
        _emitDeployment(config.version, deployed);
    }

    function _loadConfig() private returns (Config memory config) {
        config.deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        config.deployer = vm.addr(config.deployerKey);
        config.governanceAdmin = vm.envAddress("ADMIN_ADDRESS");
        config.guardian = vm.envAddress("GUARDIAN_ADDRESS");
        config.treasury = vm.envAddress("TREASURY_ADDRESS");
        config.usdg = vm.envAddress("USDG_ADDRESS");
        config.initialTvlCap = vm.envUint("INITIAL_TVL_CAP");
        config.timelockDelay = vm.envUint("TIMELOCK_DELAY_SECONDS");
        config.version = vm.envString("DEPLOYMENT_VERSION");
        config.rootSalt = keccak256(abi.encode("FLOATS_CORE", block.chainid, config.version));
    }

    function _deployTimelock(Config memory config)
        private
        returns (TimelockController timelock)
    {
        address[] memory proposers = new address[](2);
        proposers[0] = config.governanceAdmin;
        proposers[1] = config.deployer;
        address[] memory executors = new address[](2);
        executors[0] = config.governanceAdmin;
        executors[1] = config.deployer;
        timelock = new TimelockController{ salt: _salt(config.rootSalt, "TIMELOCK") }(
            config.timelockDelay, proposers, executors, address(0)
        );
    }

    function _deployModules(Config memory config, Deployment memory deployed) private {
        address timelock = address(deployed.timelock);

        deployed.indexRegistry =
            new IndexRegistry{ salt: _salt(config.rootSalt, "INDEX_REGISTRY") }(
                timelock, uint48(config.timelockDelay)
            );
        deployed.navOracle =
            new NavOracle{ salt: _salt(config.rootSalt, "NAV_ORACLE") }(timelock);
        deployed.swapQuoteOracle = new SwapQuoteOracle{
            salt: _salt(config.rootSalt, "SWAP_QUOTE_ORACLE")
        }(
            config.usdg, INavPriceOracle(address(deployed.navOracle))
        );
        deployed.swapAdapter = new SwapAdapter{ salt: _salt(config.rootSalt, "SWAP_ADAPTER") }(
            timelock, address(deployed.swapQuoteOracle)
        );
        deployed.floatsVault = new FloatsVault{ salt: _salt(config.rootSalt, "FLOATS_VAULT") }(
            IERC20(config.usdg),
            timelock,
            config.guardian,
            IFloatsIndexRegistry(address(deployed.indexRegistry)),
            IFloatsNavOracle(address(deployed.navOracle)),
            config.initialTvlCap,
            "Floats IPO Index",
            "fIPO"
        );
        deployed.feeModule = new FeeModule{ salt: _salt(config.rootSalt, "FEE_MODULE") }(
            timelock,
            IFeeShareVault(address(deployed.floatsVault)),
            config.treasury,
            FeeModule.Rates({ managementBps: 0, cashBps: 0, inKindBps: 0, offHoursBps: 0 })
        );
        deployed.rebalancer = new Rebalancer{ salt: _salt(config.rootSalt, "REBALANCER") }(
            timelock,
            IRebalanceVault(address(deployed.floatsVault)),
            IRebalanceSwapAdapter(address(deployed.swapAdapter))
        );
    }

    function _salt(bytes32 rootSalt, string memory component) private pure returns (bytes32) {
        return keccak256(abi.encode(rootSalt, component));
    }

    function _emitDeployment(string memory version, Deployment memory deployed) private {
        emit CoreDeployed(
            version,
            address(deployed.timelock),
            address(deployed.indexRegistry),
            address(deployed.navOracle),
            address(deployed.swapQuoteOracle),
            address(deployed.swapAdapter),
            address(deployed.floatsVault),
            address(deployed.feeModule),
            address(deployed.rebalancer)
        );
    }
}
