// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import {
    OApp,
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import { NavMessage } from "./NavMessage.sol";

interface IFloatsVaultSnapshot is IERC20 {
    function totalAssets() external view returns (uint256);
}

/// @title NavPublisher
/// @notice Publishes an informational fIPO NAV snapshot from Robinhood Chain.
contract NavPublisher is OApp {
    error InvalidAddress();
    error NotKeeper(address caller);
    error ZeroSupply();
    error OwnershipRenunciationDisabled();

    event KeeperSet(address indexed previousKeeper, address indexed newKeeper);
    event NavPublished(
        bytes32 indexed guid,
        uint32 indexed destinationEid,
        uint256 indexed sequence,
        uint256 nav18,
        uint256 publishedAt,
        uint256 totalSupply18
    );

    IFloatsVaultSnapshot public immutable vault;
    address public keeper;
    uint256 public sequence;

    constructor(address vault_, address endpoint_, address delegate_, address keeper_)
        OApp(endpoint_, delegate_)
        Ownable(delegate_)
    {
        if (vault_ == address(0) || keeper_ == address(0)) revert InvalidAddress();
        vault = IFloatsVaultSnapshot(vault_);
        keeper = keeper_;
    }

    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert InvalidAddress();
        address previousKeeper = keeper;
        keeper = newKeeper;
        emit KeeperSet(previousKeeper, newKeeper);
    }

    function snapshot() public view returns (NavMessage.Snapshot memory current) {
        uint256 supply = vault.totalSupply();
        if (supply == 0) revert ZeroSupply();

        current = NavMessage.Snapshot({
            sequence: sequence + 1,
            nav18: Math.mulDiv(vault.totalAssets(), 1e30, supply),
            publishedAt: block.timestamp,
            totalSupply18: supply
        });
    }

    function quote(uint32 destinationEid, bytes calldata options)
        external
        view
        returns (MessagingFee memory fee)
    {
        return _quote(destinationEid, NavMessage.encode(snapshot()), options, false);
    }

    function publish(uint32 destinationEid, bytes calldata options, address refundAddress)
        external
        payable
        returns (MessagingReceipt memory receipt)
    {
        if (msg.sender != keeper) revert NotKeeper(msg.sender);
        if (refundAddress == address(0)) revert InvalidAddress();

        NavMessage.Snapshot memory current = snapshot();
        sequence = current.sequence;
        MessagingFee memory fee = MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 });
        receipt = _lzSend(destinationEid, NavMessage.encode(current), options, fee, refundAddress);
        emit NavPublished(
            receipt.guid,
            destinationEid,
            current.sequence,
            current.nav18,
            current.publishedAt,
            current.totalSupply18
        );
    }

    function _lzReceive(Origin calldata, bytes32, bytes calldata, address, bytes calldata)
        internal
        pure
        override
    {
        revert();
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
