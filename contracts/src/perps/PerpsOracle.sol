// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IPerpsMarketRegistry } from "./interfaces/IPerpsMarketRegistry.sol";
import { IPerpsOracle } from "./interfaces/IPerpsOracle.sol";
import { PerpsTypes } from "./PerpsTypes.sol";

interface IPerpsPriceFeed {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract PerpsOracle is IPerpsOracle {
    error FeedDecimalsUnavailable(address feed);
    error InvalidFeedDecimals(address feed, uint8 decimals);
    error InvalidPrice(bytes32 marketId);
    error MarketNotFound(bytes32 marketId);
    error PriceStale(bytes32 marketId, uint256 updatedAt, uint256 maximumAge);

    uint8 public constant MAX_FEED_DECIMALS = 36;
    uint256 public constant PRICE_SCALE = 1e18;

    IPerpsMarketRegistry public immutable registry;

    constructor(address registry_) {
        if (registry_ == address(0)) revert MarketNotFound(bytes32(0));
        registry = IPerpsMarketRegistry(registry_);
    }

    function getPrice(bytes32 marketId) external view returns (Price memory price) {
        if (!registry.marketExists(marketId)) revert MarketNotFound(marketId);
        // State and session are intentionally ignored; prices remain readable for safe close paths.
        // forge-lint: disable-next-line(unused-return)
        (PerpsTypes.MarketConfig memory config,,) = registry.getMarket(marketId);

        uint8 feedDecimals = 0;
        try IPerpsPriceFeed(config.priceFeed).decimals() returns (uint8 decimals_) {
            feedDecimals = decimals_;
        } catch {
            revert FeedDecimalsUnavailable(config.priceFeed);
        }
        if (feedDecimals > MAX_FEED_DECIMALS) {
            revert InvalidFeedDecimals(config.priceFeed, feedDecimals);
        }

        try IPerpsPriceFeed(config.priceFeed).latestRoundData() returns (
            uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80 answeredInRound
        ) {
            // Timestamp comparison is required for oracle round validation.
            // forge-lint: disable-start(block-timestamp)
            if (
                answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp
                    || answeredInRound < roundId
            ) revert InvalidPrice(marketId);
            // forge-lint: disable-end(block-timestamp)
            // Timestamp comparison is required for oracle freshness enforcement.
            // forge-lint: disable-next-line(block-timestamp)
            if (block.timestamp - updatedAt > config.maxPriceAge) {
                revert PriceStale(marketId, updatedAt, config.maxPriceAge);
            }

            // Safe because the non-positive answer branch reverted above.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 unsignedAnswer = uint256(answer);
            uint256 normalized = _normalize(unsignedAnswer, feedDecimals);
            if (normalized == 0) revert InvalidPrice(marketId);
            if (updatedAt > type(uint48).max) revert InvalidPrice(marketId);

            // Safe because the explicit uint48 bound check passed above.
            // forge-lint: disable-next-line(unsafe-typecast)
            return Price({ markPriceUsd18: normalized, updatedAt: uint48(updatedAt) });
        } catch (bytes memory reason) {
            if (reason.length == 0) revert InvalidPrice(marketId);
            assembly ("memory-safe") {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    function _normalize(uint256 value, uint8 decimals_) private pure returns (uint256) {
        if (decimals_ == 18) return value;
        if (decimals_ < 18) return value * (10 ** (18 - decimals_));
        return value / (10 ** (decimals_ - 18));
    }
}
