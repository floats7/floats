// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { PerpsTypes } from "../PerpsTypes.sol";

interface IPerpsMarketRegistry {
    function marketExists(bytes32 marketId) external view returns (bool);

    function marketState(bytes32 marketId) external view returns (PerpsTypes.MarketState);

    function sessionState(bytes32 marketId) external view returns (PerpsTypes.SessionState);

    function getMarket(bytes32 marketId)
        external
        view
        returns (
            PerpsTypes.MarketConfig memory config,
            PerpsTypes.MarketState state,
            PerpsTypes.SessionState session
        );
}

