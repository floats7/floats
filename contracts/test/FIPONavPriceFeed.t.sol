// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { FIPONavPriceFeed } from "../src/perps/FIPONavPriceFeed.sol";

contract FIPONavPriceFeedTest {
    FIPONavMockVault private vault;
    FIPONavPriceFeed private feed;

    function setUp() public {
        vault = new FIPONavMockVault();
        feed = new FIPONavPriceFeed(address(vault));
    }

    function testConvertsCanonicalVaultNavFromSixToEighteenDecimals() public {
        vault.setAssetsPerShare(1_025_000);

        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();

        require(feed.decimals() == 18, "feed decimals mismatch");
        require(answer == 1_025_000_000_000_000_000, "NAV normalization mismatch");
        require(roundId == answeredInRound, "round incomplete");
        require(startedAt == updatedAt && updatedAt > 0, "timestamp mismatch");
        require(address(feed.vault()) == address(vault), "vault mismatch");
    }

    function testRevertsWhenCanonicalVaultReturnsZeroNav() public {
        try feed.latestRoundData() {
            revert("expected invalid NAV revert");
        } catch (bytes memory reason) {
            bytes4 selector;
            assembly {
                selector := mload(add(reason, 32))
            }
            require(selector == FIPONavPriceFeed.InvalidNav.selector, "unexpected selector");
        }
    }
}

contract FIPONavMockVault {
    uint256 private assetsPerShare;

    function setAssetsPerShare(uint256 assetsPerShare_) external {
        assetsPerShare = assetsPerShare_;
    }

    function convertToAssets(uint256 shares) external view returns (uint256 assets) {
        require(shares == 1e18, "unexpected share unit");
        return assetsPerShare;
    }
}
