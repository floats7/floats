// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OApp } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import { NavMessage } from "./NavMessage.sol";

/// @title NavMirror
/// @notice Stores authenticated informational NAV data; it never authorizes token minting.
contract NavMirror is OApp {
    error FutureTimestamp(uint256 publishedAt, uint256 currentTimestamp);
    error InvalidMessageLength(uint256 actual);
    error InvalidStaleness(uint256 value);
    error InvalidSnapshot();
    error OutOfOrderSequence(uint256 received, uint256 latest);
    error StaleNav(uint256 publishedAt, uint256 currentTimestamp, uint256 maxStaleness);
    error OwnershipRenunciationDisabled();

    event MaxStalenessSet(uint256 previousValue, uint256 newValue);
    event NavReceived(
        bytes32 indexed guid,
        uint32 indexed sourceEid,
        uint256 indexed sequence,
        uint256 nav18,
        uint256 publishedAt,
        uint256 totalSupply18
    );

    uint256 public maxStaleness;
    NavMessage.Snapshot private _latest;

    constructor(address endpoint_, address delegate_, uint256 maxStaleness_)
        OApp(endpoint_, delegate_)
        Ownable(delegate_)
    {
        if (maxStaleness_ == 0) revert InvalidStaleness(maxStaleness_);
        maxStaleness = maxStaleness_;
    }

    function setMaxStaleness(uint256 newValue) external onlyOwner {
        if (newValue == 0) revert InvalidStaleness(newValue);
        uint256 previousValue = maxStaleness;
        maxStaleness = newValue;
        emit MaxStalenessSet(previousValue, newValue);
    }

    function latestNav() external view returns (NavMessage.Snapshot memory current) {
        current = _latest;
        if (current.publishedAt == 0) revert InvalidSnapshot();
        if (block.timestamp > current.publishedAt + maxStaleness) {
            revert StaleNav(current.publishedAt, block.timestamp, maxStaleness);
        }
    }

    function _lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address,
        bytes calldata
    ) internal override {
        if (message.length != NavMessage.ENCODED_LENGTH) {
            revert InvalidMessageLength(message.length);
        }

        NavMessage.Snapshot memory incoming = NavMessage.decode(message);
        if (incoming.sequence <= _latest.sequence) {
            revert OutOfOrderSequence(incoming.sequence, _latest.sequence);
        }
        if (incoming.nav18 == 0 || incoming.publishedAt == 0 || incoming.totalSupply18 == 0) {
            revert InvalidSnapshot();
        }
        if (incoming.publishedAt > block.timestamp) {
            revert FutureTimestamp(incoming.publishedAt, block.timestamp);
        }

        _latest = incoming;
        emit NavReceived(
            guid,
            origin.srcEid,
            incoming.sequence,
            incoming.nav18,
            incoming.publishedAt,
            incoming.totalSupply18
        );
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
