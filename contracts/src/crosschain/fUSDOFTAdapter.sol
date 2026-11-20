// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ControlledOFTAdapter } from "./ControlledOFTAdapter.sol";

/// @title fUSD OFT Adapter
/// @notice Locks canonical fUSD shares on Robinhood Chain for LayerZero transfers.
contract fUSDOFTAdapter is ControlledOFTAdapter {
    error InvalidDecimals(uint8 actual);

    constructor(address token_, address endpoint_, address delegate_, address guardian_)
        ControlledOFTAdapter(token_, endpoint_, delegate_, guardian_)
    {
        uint8 actual = IERC20Metadata(token_).decimals();
        if (actual != 18) revert InvalidDecimals(actual);
        bridgePaused = true;
        emit BridgePauseSet(true, msg.sender);
    }
}
