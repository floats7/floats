// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

library NavMessage {
    uint256 internal constant ENCODED_LENGTH = 128;

    struct Snapshot {
        uint256 sequence;
        uint256 nav18;
        uint256 publishedAt;
        uint256 totalSupply18;
    }

    function encode(Snapshot memory snapshot) internal pure returns (bytes memory) {
        return abi.encode(
            snapshot.sequence, snapshot.nav18, snapshot.publishedAt, snapshot.totalSupply18
        );
    }

    function decode(bytes calldata message) internal pure returns (Snapshot memory snapshot) {
        (snapshot.sequence, snapshot.nav18, snapshot.publishedAt, snapshot.totalSupply18) =
            abi.decode(message, (uint256, uint256, uint256, uint256));
    }
}
