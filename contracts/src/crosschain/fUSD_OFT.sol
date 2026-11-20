// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ControlledOFT } from "./ControlledOFT.sol";

/// @title fUSD OFT
/// @notice Remote representation of canonical fUSD shares locked on Robinhood Chain.
contract fUSD_OFT is ControlledOFT {
    constructor(address endpoint_, address delegate_, address guardian_)
        ControlledOFT("Floats Dollar", "fUSD", endpoint_, delegate_, guardian_)
    {
        bridgePaused = true;
        emit BridgePauseSet(true, msg.sender);
    }
}
