// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsTestPriceFeed } from "../src/testnet/FloatsTestPriceFeed.sol";
import { FloatsTestStock } from "../src/testnet/FloatsTestStock.sol";
import { FloatsTestSwapRouter } from "../src/testnet/FloatsTestSwapRouter.sol";

interface FixtureDeployVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys explicitly labelled Floats-owned fixtures only on Robinhood Chain Testnet.
contract DeployTestnetFixture {
    FixtureDeployVm private constant vm =
        FixtureDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    uint256 private constant FIXTURE_SUPPLY = 1_000e18;

    error TestnetOnly(uint256 chainId);

    event TestnetFixtureDeployed(address indexed stock, address indexed feed, address router);

    function run()
        external
        returns (FloatsTestStock stock, FloatsTestPriceFeed feed, FloatsTestSwapRouter router)
    {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert TestnetOnly(block.chainid);
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address operator = vm.addr(key);
        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));

        vm.startBroadcast(key);
        stock = new FloatsTestStock(operator, FIXTURE_SUPPLY);
        feed = new FloatsTestPriceFeed();
        router = new FloatsTestSwapRouter(usdg, stock);
        stock.transfer(address(router), FIXTURE_SUPPLY);
        vm.stopBroadcast();

        emit TestnetFixtureDeployed(address(stock), address(feed), address(router));
    }
}
