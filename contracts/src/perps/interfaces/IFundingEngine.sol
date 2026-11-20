// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IFundingEngine {
    function currentFundingIndex(bytes32 marketId) external view returns (int256 index18);
}
