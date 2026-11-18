// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OptionsPriceOracle } from "../src/options/OptionsPriceOracle.sol";

interface DeployOptionsPriceOracleVm {
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployOptionsPriceOracle {
    DeployOptionsPriceOracleVm private constant vm =
        DeployOptionsPriceOracleVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event OptionsPriceOracleDeployed(address indexed priceOracle);

    function run() external returns (OptionsPriceOracle priceOracle) {
        bytes32 salt = keccak256(
            abi.encode(
                "FLOATS_OPTIONS_PRICE_ORACLE", block.chainid, vm.envString("DEPLOYMENT_VERSION")
            )
        );
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        priceOracle = new OptionsPriceOracle{ salt: salt }(
            vm.envAddress("TIMELOCK_ADDRESS"),
            vm.envAddress("NAV_ORACLE_ADDRESS"),
            uint48(vm.envUint("OPTIONS_MAX_OBSERVATION_DELAY_SECONDS"))
        );
        vm.stopBroadcast();
        emit OptionsPriceOracleDeployed(address(priceOracle));
    }
}
