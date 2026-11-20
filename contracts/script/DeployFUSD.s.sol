// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FUSDRateOracle, IFUSDRateSource } from "../src/fusd/FUSDRateOracle.sol";
import { FUSDVault } from "../src/fusd/FUSDVault.sol";
import { MorphoUSDGStrategy } from "../src/fusd/MorphoUSDGStrategy.sol";
import { IMorphoVaultV2 } from "../src/fusd/interfaces/IMorphoVaultV2.sol";

interface DeployFUSDVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys fUSD in a paused state. Strategy configuration and activation require governance.
contract DeployFUSD {
    DeployFUSDVm private constant vm =
        DeployFUSDVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);

    struct Deployment {
        FUSDVault vault;
        MorphoUSDGStrategy strategy;
        FUSDRateOracle rateOracle;
    }

    event FUSDDeployed(
        string version, address vault, address strategy, address rateOracle, bool depositsPaused
    );

    function run() external returns (Deployment memory deployed) {
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdg = vm.envAddress("USDG_ADDRESS");
        address morphoVault = vm.envAddress("FUSD_MORPHO_VAULT_ADDRESS");
        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address feeRecipient = vm.envAddress("TREASURY_ADDRESS");
        string memory version = vm.envString("FUSD_DEPLOYMENT_VERSION");
        bytes32 root = keccak256(abi.encode("FLOATS_FUSD", block.chainid, version));

        vm.startBroadcast(key);
        deployed.vault = new FUSDVault{ salt: _salt(root, "FUSD_VAULT") }(
            IERC20Metadata(usdg),
            governance,
            guardian,
            feeRecipient,
            vm.envUint("FUSD_INITIAL_TVL_CAP"),
            vm.envUint("FUSD_TARGET_BUFFER_BPS"),
            vm.envUint("FUSD_PERFORMANCE_FEE_BPS")
        );
        deployed.strategy = new MorphoUSDGStrategy{ salt: _salt(root, "FUSD_STRATEGY") }(
            IERC20Metadata(usdg), IMorphoVaultV2(morphoVault), address(deployed.vault)
        );
        deployed.rateOracle = new FUSDRateOracle{ salt: _salt(root, "FUSD_RATE_ORACLE") }(
            IFUSDRateSource(address(deployed.vault))
        );
        vm.stopBroadcast();

        emit FUSDDeployed(
            version,
            address(deployed.vault),
            address(deployed.strategy),
            address(deployed.rateOracle),
            deployed.vault.depositsPaused()
        );
    }

    function _salt(bytes32 root, string memory component) private pure returns (bytes32) {
        return keccak256(abi.encode(root, component));
    }
}
