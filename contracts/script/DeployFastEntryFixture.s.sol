// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FloatsTestFastEntryStock } from "../src/testnet/FloatsTestFastEntryStock.sol";
import { FloatsTestPriceFeed } from "../src/testnet/FloatsTestPriceFeed.sol";
import { FloatsTestSwapRouter } from "../src/testnet/FloatsTestSwapRouter.sol";

interface FastEntryDeployVm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployFastEntryFixture {
    FastEntryDeployVm private constant vm =
        FastEntryDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error TestnetOnly(uint256 chainId);

    event FastEntryFixtureDeployed(address indexed stock, address indexed feed, address router);

    function run()
        external
        returns (FloatsTestFastEntryStock stock, FloatsTestPriceFeed feed, FloatsTestSwapRouter router)
    {
        if (block.chainid != 46_630) revert TestnetOnly(block.chainid);
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address operator = vm.addr(key);
        IERC20 usdg = IERC20(vm.envAddress("USDG_ADDRESS"));

        vm.startBroadcast(key);
        stock = new FloatsTestFastEntryStock(operator, 1_000e18);
        feed = new FloatsTestPriceFeed();
        router = new FloatsTestSwapRouter(usdg, stock);
        stock.transfer(address(router), 1_000e18);
        vm.stopBroadcast();

        emit FastEntryFixtureDeployed(address(stock), address(feed), address(router));
    }
}
