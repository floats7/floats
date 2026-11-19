// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ControlledOFT } from "./ControlledOFT.sol";

/// @title fIPO_OFT
/// @notice Non-canonical fIPO representation on Zero; minting is restricted to authenticated receipts.
contract fIPO_OFT is ControlledOFT {
    constructor(address endpoint_, address delegate_, address guardian_)
        ControlledOFT("Floats IPO Index", "fIPO", endpoint_, delegate_, guardian_)
    { }
}
