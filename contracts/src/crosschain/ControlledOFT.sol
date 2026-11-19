// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CrossChainControls } from "./CrossChainControls.sol";

/// @notice Shared burn-and-mint implementation for Floats representations on Zero.
abstract contract ControlledOFT is OFT, CrossChainControls {
    error OwnershipRenunciationDisabled();

    constructor(
        string memory name_,
        string memory symbol_,
        address endpoint_,
        address delegate_,
        address guardian_
    ) OFT(name_, symbol_, endpoint_, delegate_) CrossChainControls(guardian_) Ownable(delegate_) { }

    function _debit(address from, uint256 amount, uint256 minimum, uint32 destinationEid)
        internal
        override
        returns (uint256 amountSent, uint256 amountReceived)
    {
        (amountSent, amountReceived) = super._debit(from, amount, minimum, destinationEid);
        _consumeRateLimit(destinationEid, false, amountSent);
    }

    function _credit(address recipient, uint256 amount, uint32 sourceEid)
        internal
        override
        returns (uint256 amountReceived)
    {
        _consumeRateLimit(sourceEid, true, amount);
        return super._credit(recipient, amount, sourceEid);
    }

    function _governance() internal view override returns (address) {
        return owner();
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
