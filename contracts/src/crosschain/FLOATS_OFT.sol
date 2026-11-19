// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ControlledOFT } from "./ControlledOFT.sol";

/// @title FLOATS_OFT
/// @notice Non-canonical FLOATS representation on Zero.
contract FLOATS_OFT is ControlledOFT {
    constructor(address endpoint_, address delegate_, address guardian_)
        ControlledOFT("Floats", "FLOATS", endpoint_, delegate_, guardian_)
    { }
}
