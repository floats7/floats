// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IFUSDRateSource {
    function pricePerShare18() external view returns (uint256);
}

/// @title fUSD Rate Oracle
/// @notice Minimal immutable rate source for DeFi integrations and cross-chain NAV publication.
contract FUSDRateOracle {
    error InvalidAddress();

    IFUSDRateSource public immutable fusd;

    constructor(IFUSDRateSource fusd_) {
        if (address(fusd_) == address(0)) revert InvalidAddress();
        fusd = fusd_;
    }

    function pricePerShare18() external view returns (uint256) {
        return fusd.pricePerShare18();
    }
}
