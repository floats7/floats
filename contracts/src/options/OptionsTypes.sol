// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

library OptionsTypes {
    enum OptionKind {
        CappedCall,
        Put
    }

    enum SeriesState {
        Active,
        TradingClosed,
        Suspended,
        ManualSettlementRequired,
        Settled,
        Archived
    }

    struct SeriesTerms {
        address underlying;
        bytes32 underlyingUid;
        address priceSource;
        OptionKind kind;
        uint256 strikeUsd18;
        uint256 capUsd18;
        uint48 expiry;
        uint256 contractSize18;
        uint32 corporateActionPolicyVersion;
    }
}
