// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { OApp } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import { NavMessage } from "./NavMessage.sol";

/// @title NavMirror
/// @notice Stores authenticated informational NAV data; it never authorizes token minting.
contract NavMirror is OApp {
    using SafeCast for uint256;

    uint256 public constant MAX_STALENESS = 7 days;

    error FutureTimestamp(uint256 publishedAt, uint256 currentTimestamp);
    error InvalidMessageLength(uint256 actual);
    error InvalidStaleness(uint256 value);
    error InvalidSnapshot();
    error OutOfOrderSequence(uint256 received, uint256 latest);
    error OutOfOrderTimestamp(uint256 received, uint256 latest);
    error StaleNav(uint256 publishedAt, uint256 currentTimestamp, uint256 maxStaleness);
    error OwnershipRenunciationDisabled();
    error InvalidRecoveryRecipient();

    event MaxStalenessSet(uint256 previousValue, uint256 newValue);
    event NativeRecovered(address indexed recipient, uint256 amount);
    event NavMirrored(
        bytes32 indexed guid,
        uint32 indexed sourceEid,
        uint64 indexed sequence,
        uint256 nav18,
        uint256 canonicalTotalSupply,
        uint48 observedAt
    );

    uint256 public maxStaleness;
    NavMessage.Snapshot private _latest;

    constructor(address endpoint_, address delegate_, uint256 maxStaleness_)
        OApp(endpoint_, delegate_)
        Ownable(delegate_)
    {
        if (maxStaleness_ == 0 || maxStaleness_ > MAX_STALENESS) {
            revert InvalidStaleness(maxStaleness_);
        }
        maxStaleness = maxStaleness_;
    }

    function setMaxStaleness(uint256 newValue) external onlyOwner {
        if (newValue == 0 || newValue > MAX_STALENESS) revert InvalidStaleness(newValue);
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
        if (
            incoming.sequence > type(uint64).max || incoming.nav18 == 0 || incoming.publishedAt == 0
                || incoming.publishedAt > type(uint48).max || incoming.totalSupply18 == 0
        ) {
            revert InvalidSnapshot();
        }
        if (incoming.publishedAt > block.timestamp) {
            revert FutureTimestamp(incoming.publishedAt, block.timestamp);
        }
        if (_latest.publishedAt != 0 && incoming.publishedAt <= _latest.publishedAt) {
            revert OutOfOrderTimestamp(incoming.publishedAt, _latest.publishedAt);
        }

        _latest = incoming;
        emit NavMirrored(
            guid,
            origin.srcEid,
            incoming.sequence.toUint64(),
            incoming.nav18,
            incoming.totalSupply18,
            incoming.publishedAt.toUint48()
        );
    }

    function recoverNative(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidRecoveryRecipient();
        uint256 amount = address(this).balance;
        Address.sendValue(recipient, amount);
        emit NativeRecovered(recipient, amount);
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
