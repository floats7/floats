// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IFUSDStrategy {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function deposit(uint256 assets) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver) external returns (uint256 shares);
    function redeemAll(address receiver) external returns (uint256 assets);
}
