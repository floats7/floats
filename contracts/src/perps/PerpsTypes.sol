// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

library PerpsTypes {
    enum MarginMode {
        Isolated,
        Cross
    }

    enum MarketState {
        Disabled,
        Active,
        ReduceOnly
    }

    enum SessionState {
        Regular,
        Extended,
        Overnight,
        Closed
    }

    struct MarketConfig {
        address underlying;
        bytes32 underlyingUid;
        bytes32 symbol;
        address priceFeed;
        uint32 maxLeverageBps;
        uint32 initialMarginBps;
        uint32 maintenanceMarginBps;
        uint32 openInterestCapBps;
        uint32 baseSpreadBps;
        uint32 tradingFeeBps;
        uint32 extendedSpreadMultiplierBps;
        uint32 extendedLeverageDivisorBps;
        uint48 maxPriceAge;
        bool isolatedOnly;
    }

    struct Position {
        int256 size18;
        uint256 entryPriceUsd18;
        int256 lastFundingIndex18;
        int256 realizedPnlUsd18;
        uint256 pendingFeesUsd18;
    }

    struct AccountHealth {
        int256 equityUsd18;
        uint256 initialMarginUsd18;
        uint256 maintenanceMarginUsd18;
        uint256 marginRatio18;
        bool liquidatable;
    }
}

