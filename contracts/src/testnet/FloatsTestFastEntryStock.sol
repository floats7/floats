// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Floats Test Fast Entry Stock
/// @notice Second public-testnet-only fixture. This contract is not a Robinhood Stock Token.
contract FloatsTestFastEntryStock is ERC20 {
    bytes32 public constant ASSET_UID = keccak256("FLOATS_TESTNET_FAST_ENTRY_STOCK_V1");

    bool public constant oraclePaused = false;

    constructor(address fixtureOperator, uint256 fixtureSupply)
        ERC20("Floats Test Fast Entry Stock - NOT CANONICAL", "tFAST")
    {
        _mint(fixtureOperator, fixtureSupply);
    }

    function uid() external pure returns (bytes32) {
        return ASSET_UID;
    }

    function uiMultiplier() external pure returns (uint256) {
        return 1e18;
    }
}
