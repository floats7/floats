// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IFIPOVaultNav {
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
}

/// @notice Chainlink-compatible view over the canonical onchain fIPO share NAV.
/// @dev The vault remains authoritative and fails closed when its NAV inputs are unavailable.
contract FIPONavPriceFeed {
    error InvalidAddress();
    error InvalidNav();

    uint8 public constant decimals = 18;
    uint256 public constant ONE_SHARE = 1e18;
    uint256 private constant USDG_TO_PRICE_SCALE = 1e12;

    IFIPOVaultNav public immutable vault;

    constructor(address vault_) {
        if (vault_ == address(0)) revert InvalidAddress();
        vault = IFIPOVaultNav(vault_);
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        uint256 assets6 = vault.convertToAssets(ONE_SHARE);
        uint256 nav18 = assets6 * USDG_TO_PRICE_SCALE;
        // type(int256).max is positive and exactly representable as uint256.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (nav18 == 0 || nav18 > uint256(type(int256).max) || block.number > type(uint80).max) {
            revert InvalidNav();
        }
        // The explicit block-number bound above guarantees a lossless cast.
        // forge-lint: disable-next-line(unsafe-typecast)
        roundId = uint80(block.number);
        // The explicit signed-value bound above guarantees a lossless cast.
        // forge-lint: disable-next-line(unsafe-typecast)
        answer = int256(nav18);
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = roundId;
    }
}
