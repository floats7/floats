// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IPerpsOracle {
    struct Price {
        uint256 markPriceUsd18;
        uint48 updatedAt;
    }

    function getPrice(bytes32 marketId) external view returns (Price memory price);
}

