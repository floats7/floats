// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { FUSDToFIPORouter } from "../src/fusd/FUSDToFIPORouter.sol";

interface DeployFUSDToFIPORouterVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deterministically deploys the fUSD-to-fIPO router in its default paused state.
contract DeployFUSDToFIPORouter {
    DeployFUSDToFIPORouterVm private constant vm =
        DeployFUSDToFIPORouterVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error ChainIdMismatch(uint256 expected, uint256 actual);

    event FUSDToFIPORouterDeployed(
        string version, address router, address fusd, address fipo, bool conversionsPaused
    );

    function run() external returns (FUSDToFIPORouter router) {
        uint256 expectedChainId = vm.envUint("CHAIN_ID");
        if (block.chainid != expectedChainId) {
            revert ChainIdMismatch(expectedChainId, block.chainid);
        }

        IERC4626 fusd = IERC4626(vm.envAddress("FUSD_VAULT_ADDRESS"));
        IERC4626 fipo = IERC4626(vm.envAddress("FLOATS_VAULT_ADDRESS"));
        address governance = vm.envAddress("TIMELOCK_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        string memory version = vm.envString("FUSD_ROUTER_DEPLOYMENT_VERSION");
        bytes32 salt = keccak256(abi.encode("FLOATS_FUSD_TO_FIPO_ROUTER", block.chainid, version));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        router = new FUSDToFIPORouter{ salt: salt }(fusd, fipo, governance, guardian);
        vm.stopBroadcast();

        emit FUSDToFIPORouterDeployed(
            version, address(router), address(fusd), address(fipo), router.conversionsPaused()
        );
    }
}
