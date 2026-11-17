// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface observed in Robinhood Stock Token documentation and RPC calls.
/// @dev This is not a claim that the complete implementation ABI has been source-verified.
interface IStockToken {
    function balanceOf(address account) external view returns (uint256);

    function balanceOfUI(address account) external view returns (uint256);

    function decimals() external view returns (uint8);

    function effectiveAt() external view returns (uint256);

    function newUIMultiplier() external view returns (uint256);

    function oraclePaused() external view returns (bool);

    function symbol() external view returns (string memory);

    function totalSupply() external view returns (uint256);

    function totalSupplyUI() external view returns (uint256);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function uiMultiplier() external view returns (uint256);

    function uid() external view returns (bytes32);
}
