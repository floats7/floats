// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ControlledOFTAdapter } from "./ControlledOFTAdapter.sol";

/// @title FLOATSOFTAdapter
/// @notice Locks the canonical fixed-supply FLOATS token on its origin chain.
contract FLOATSOFTAdapter is ControlledOFTAdapter {
    constructor(address token_, address endpoint_, address delegate_, address guardian_)
        ControlledOFTAdapter(token_, endpoint_, delegate_, guardian_)
    { }
}
