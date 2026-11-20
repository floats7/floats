// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { PerpsTypes } from "../PerpsTypes.sol";

interface IPerpsPositionSource {
    function getPosition(address account, bytes32 marketId)
        external
        view
        returns (PerpsTypes.Position memory position);

    function openInterest(bytes32 marketId)
        external
        view
        returns (uint256 longOpenInterestUsd18, uint256 shortOpenInterestUsd18);
}
