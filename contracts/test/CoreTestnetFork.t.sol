// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ForkVm {
    function envAddress(string calldata name) external view returns (address);
}

interface IForkVault {
    function asset() external view returns (address);
    function owner() external view returns (address);
    function indexRegistry() external view returns (address);
    function navOracle() external view returns (address);
    function feeModule() external view returns (address);
    function rebalancer() external view returns (address);
    function depositsPaused() external view returns (bool);
    function cashOperationsPaused() external view returns (bool);
}

interface IForkRegistry {
    function admin() external view returns (address);
    function minimumDelay() external view returns (uint48);
    function pendingConfigurationHash() external view returns (bytes32);
    function getActiveTokens() external view returns (address[] memory);
    function getConstituent(address token)
        external
        view
        returns (
            address feed,
            bytes32 uid,
            uint16 targetWeightBps,
            uint48 eligibleFrom,
            uint48 exitAfter,
            uint8 status
        );
}

interface IForkNavOracle {
    function admin() external view returns (address);
    function normalizedPrice(address token) external view returns (uint256);
}

interface IForkQuoteOracle {
    function usdg() external view returns (address);
    function navOracle() external view returns (address);
    function quote(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256);
}

interface IForkFeeModule {
    function admin() external view returns (address);
    function vault() external view returns (address);
    function treasury() external view returns (address);
}

interface IForkRebalancer {
    function admin() external view returns (address);
    function vault() external view returns (address);
    function swapAdapter() external view returns (address);
    function isKeeper(address keeper) external view returns (bool);
}

interface IForkSwapAdapter {
    function admin() external view returns (address);
    function quoteOracle() external view returns (address);
    function isExecutor(address executor) external view returns (bool);
}

contract CoreTestnetForkTest {
    ForkVm private constant vm =
        ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private vaultAddress;
    address private registryAddress;
    address private navOracleAddress;
    address private quoteOracleAddress;
    address private adapterAddress;
    address private feeModuleAddress;
    address private rebalancerAddress;
    address private usdgAddress;
    address private timelockAddress;
    address private keeperAddress;
    address private treasuryAddress;

    function setUp() public {
        vaultAddress = vm.envAddress("FLOATS_VAULT_ADDRESS");
        registryAddress = vm.envAddress("INDEX_REGISTRY_ADDRESS");
        navOracleAddress = vm.envAddress("NAV_ORACLE_ADDRESS");
        quoteOracleAddress = vm.envAddress("SWAP_QUOTE_ORACLE_ADDRESS");
        adapterAddress = vm.envAddress("SWAP_ADAPTER_ADDRESS");
        feeModuleAddress = vm.envAddress("FEE_MODULE_ADDRESS");
        rebalancerAddress = vm.envAddress("REBALANCER_ADDRESS");
        usdgAddress = vm.envAddress("USDG_ADDRESS");
        timelockAddress = vm.envAddress("TIMELOCK_ADDRESS");
        keeperAddress = vm.envAddress("KEEPER_ADDRESS");
        treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
    }

    function testDeployedCoreWiringAndLiveQuoteFlow() public view {
        require(block.chainid == 46_630, "wrong fork chain");
        _requireCode(vaultAddress);
        _requireCode(registryAddress);
        _requireCode(navOracleAddress);
        _requireCode(quoteOracleAddress);
        _requireCode(adapterAddress);
        _requireCode(feeModuleAddress);
        _requireCode(rebalancerAddress);

        IForkVault vault = IForkVault(vaultAddress);
        require(vault.asset() == usdgAddress, "vault asset mismatch");
        require(vault.owner() == timelockAddress, "vault owner mismatch");
        require(vault.indexRegistry() == registryAddress, "registry wiring mismatch");
        require(vault.navOracle() == navOracleAddress, "NAV wiring mismatch");
        require(vault.feeModule() == feeModuleAddress, "fee wiring mismatch");
        require(vault.rebalancer() == rebalancerAddress, "rebalancer wiring mismatch");
        require(!vault.depositsPaused(), "deposits paused");
        require(!vault.cashOperationsPaused(), "cash operations paused");

        IForkRegistry registry = IForkRegistry(registryAddress);
        require(registry.admin() == timelockAddress, "registry admin mismatch");
        require(registry.minimumDelay() == 5 minutes, "registry delay mismatch");
        require(registry.pendingConfigurationHash() == bytes32(0), "pending configuration");
        address[] memory tokens = registry.getActiveTokens();
        require(tokens.length != 0, "empty active registry");

        uint256 totalWeight;
        IForkNavOracle navOracle = IForkNavOracle(navOracleAddress);
        require(navOracle.admin() == timelockAddress, "oracle admin mismatch");
        IForkQuoteOracle quoteOracle = IForkQuoteOracle(quoteOracleAddress);
        require(quoteOracle.usdg() == usdgAddress, "quote USDG mismatch");
        require(quoteOracle.navOracle() == navOracleAddress, "quote oracle wiring mismatch");

        for (uint256 i; i < tokens.length; ++i) {
            (,, uint16 weight,,, uint8 status) = registry.getConstituent(tokens[i]);
            require(status == 1, "inactive registry token");
            totalWeight += weight;
            require(navOracle.normalizedPrice(tokens[i]) != 0, "unavailable active price");
            require(
                quoteOracle.quote(tokens[i], usdgAddress, 1 ether) != 0,
                "empty stock quote"
            );
            require(
                quoteOracle.quote(usdgAddress, tokens[i], 1e6) != 0,
                "empty USDG quote"
            );
        }
        require(totalWeight == 10_000, "registry weights mismatch");

        IForkFeeModule feeModule = IForkFeeModule(feeModuleAddress);
        require(feeModule.admin() == timelockAddress, "fee admin mismatch");
        require(feeModule.vault() == vaultAddress, "fee vault mismatch");
        require(feeModule.treasury() == treasuryAddress, "treasury mismatch");

        IForkRebalancer rebalancer = IForkRebalancer(rebalancerAddress);
        require(rebalancer.admin() == timelockAddress, "rebalancer admin mismatch");
        require(rebalancer.vault() == vaultAddress, "rebalancer vault mismatch");
        require(rebalancer.swapAdapter() == adapterAddress, "adapter wiring mismatch");
        require(rebalancer.isKeeper(keeperAddress), "keeper missing");

        IForkSwapAdapter adapter = IForkSwapAdapter(adapterAddress);
        require(adapter.admin() == timelockAddress, "adapter admin mismatch");
        require(adapter.quoteOracle() == quoteOracleAddress, "adapter quote mismatch");
        require(adapter.isExecutor(rebalancerAddress), "rebalancer executor missing");
    }

    function _requireCode(address target) private view {
        require(target.code.length != 0, "missing deployed code");
    }
}
