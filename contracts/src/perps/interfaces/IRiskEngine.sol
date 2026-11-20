// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { PerpsTypes } from "../PerpsTypes.sol";

interface IRiskEngine {
    function crossHealth(address account)
        external
        view
        returns (PerpsTypes.AccountHealth memory health);

    function isolatedHealth(address account, bytes32 marketId)
        external
        view
        returns (PerpsTypes.AccountHealth memory health);
}

