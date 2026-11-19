// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CrossChainControls } from "./CrossChainControls.sol";

/// @notice Shared lockbox implementation for canonical Floats tokens.
abstract contract ControlledOFTAdapter is OFTAdapter, CrossChainControls {
    error OwnershipRenunciationDisabled();

    constructor(address token_, address endpoint_, address delegate_, address guardian_)
        OFTAdapter(token_, endpoint_, delegate_)
        CrossChainControls(guardian_)
        Ownable(delegate_)
    { }

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
