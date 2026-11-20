// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { PerpsTypes } from "../PerpsTypes.sol";

interface IMarginAccount {
    function freeCollateral(address account) external view returns (uint256);

    function crossCollateral(address account) external view returns (uint256);

    function isolatedMargin(address account, bytes32 marketId) external view returns (uint256);

    function marginMode(address account, bytes32 marketId)
        external
        view
        returns (PerpsTypes.MarginMode);

    function activeMarkets(address account) external view returns (bytes32[] memory marketIds);
}

