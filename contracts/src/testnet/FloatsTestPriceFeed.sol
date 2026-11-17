// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title Floats Test Price Feed
/// @notice Fixed public-testnet-only fixture. This contract is not a Chainlink feed.
contract FloatsTestPriceFeed {
    uint8 public constant decimals = 8;
    int256 public constant answer = 100e8;

    uint256 public immutable deployedAt;

    constructor() {
        deployedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 currentAnswer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, answer, deployedAt, deployedAt, 1);
    }
}
