// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAggregatorV3 {
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

interface IOraclePausableToken {
    function oraclePaused() external view returns (bool);
}

/// @title NavOracle
/// @notice Normalizes configured price feeds and calculates Floats Core asset value.
contract NavOracle {
    uint256 public constant INTERNAL_SCALE = 1e18;
    uint256 public constant USDG_TO_INTERNAL_SCALE = 1e12;
    uint8 public constant MAX_FEED_DECIMALS = 36;

    enum Health {
        Unconfigured,
        Live,
        Stale,
        Paused,
        Invalid
    }

    struct FeedConfig {
        address feed;
        uint32 maxAge;
        uint8 decimals;
    }

    struct Observation {
        uint256 normalizedPrice;
        uint256 updatedAt;
        Health health;
    }

    error DuplicateToken(address token);
    error InvalidAddress();
    error InvalidFeedDecimals(address feed, uint8 decimals);
    error InvalidMaxAge(address token);
    error LengthMismatch(uint256 tokensLength, uint256 amountsLength);
    error NotAdmin(address caller);
    error PriceUnavailable(address token, Health health);

    event FeedConfigured(address indexed token, address indexed feed, uint32 maxAge);

    address public immutable admin;
    mapping(address token => FeedConfig config) private feedConfigs;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    constructor(address admin_) {
        if (admin_ == address(0)) revert InvalidAddress();
        admin = admin_;
    }

    function configureFeeds(
        address[] calldata tokens,
        address[] calldata feeds,
        uint32[] calldata maxAges
    ) external onlyAdmin {
        uint256 length = tokens.length;
        if (length != feeds.length || length != maxAges.length) {
            revert LengthMismatch(length, feeds.length);
        }

        for (uint256 i; i < length; ++i) {
            address token = tokens[i];
            address feed = feeds[i];
            // Reverts and metadata reads are intentional in this bounded admin loop.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (token == address(0) || feed == address(0)) revert InvalidAddress();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (maxAges[i] == 0) revert InvalidMaxAge(token);

            for (uint256 j; j < i; ++j) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (tokens[j] == token) revert DuplicateToken(token);
            }

            // forge-lint: disable-next-line(calls-loop)
            uint8 feedDecimals = IAggregatorV3(feed).decimals();
            if (feedDecimals > MAX_FEED_DECIMALS) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert InvalidFeedDecimals(feed, feedDecimals);
            }

            feedConfigs[token] =
                FeedConfig({ feed: feed, maxAge: maxAges[i], decimals: feedDecimals });
            emit FeedConfigured(token, feed, maxAges[i]);
        }
    }

    function getFeedConfig(address token) external view returns (FeedConfig memory) {
        return feedConfigs[token];
    }

    function observe(address token) public view returns (Observation memory observation) {
        FeedConfig memory config = feedConfigs[token];
        if (config.feed == address(0)) {
            return Observation({ normalizedPrice: 0, updatedAt: 0, health: Health.Unconfigured });
        }

        // External observations are isolated with try/catch and mapped to deterministic health.
        // forge-lint: disable-next-line(calls-loop)
        try IOraclePausableToken(token).oraclePaused() returns (bool isPaused) {
            if (isPaused) {
                return Observation({ normalizedPrice: 0, updatedAt: 0, health: Health.Paused });
            }
        } catch {
            return Observation({ normalizedPrice: 0, updatedAt: 0, health: Health.Invalid });
        }

        // forge-lint: disable-next-line(calls-loop)
        try IAggregatorV3(config.feed).latestRoundData() returns (
            uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80 answeredInRound
        ) {
            uint256 currentTime = block.timestamp;
            if (_isInvalidRound(roundId, answer, updatedAt, answeredInRound, currentTime)) {
                return
                    Observation({
                        normalizedPrice: 0, updatedAt: updatedAt, health: Health.Invalid
                    });
            }

            // Safe because the negative and zero answer branch returned above.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 normalizedAnswer = _normalize(uint256(answer), config.decimals);
            Health health =
                _isStale(updatedAt, currentTime, config.maxAge) ? Health.Stale : Health.Live;
            return Observation({
                normalizedPrice: normalizedAnswer, updatedAt: updatedAt, health: health
            });
        } catch {
            return Observation({ normalizedPrice: 0, updatedAt: 0, health: Health.Invalid });
        }
    }

    function constituentValue(address token, uint256 rawAmount)
        public
        view
        returns (uint256 value)
    {
        Observation memory observation = observe(token);
        // Intentional when called through the bounded totalValue aggregation loop.
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (observation.health != Health.Live) revert PriceUnavailable(token, observation.health);
        return rawAmount * observation.normalizedPrice / INTERNAL_SCALE;
    }

    function normalizedPrice(address token) external view returns (uint256 price) {
        Observation memory observation = observe(token);
        if (observation.health != Health.Live) revert PriceUnavailable(token, observation.health);
        return observation.normalizedPrice;
    }

    function totalValue(address[] calldata tokens, uint256[] calldata rawAmounts, uint256 idleUsdg)
        external
        view
        returns (uint256 value)
    {
        uint256 length = tokens.length;
        if (length != rawAmounts.length) revert LengthMismatch(length, rawAmounts.length);

        value = idleUsdg * USDG_TO_INTERNAL_SCALE;
        for (uint256 i; i < length; ++i) {
            value += constituentValue(tokens[i], rawAmounts[i]);
        }
    }

    function _normalize(uint256 price, uint8 feedDecimals) private pure returns (uint256) {
        if (feedDecimals == 18) return price;
        if (feedDecimals < 18) return price * (10 ** (18 - feedDecimals));
        return price / (10 ** (feedDecimals - 18));
    }

    function _isInvalidRound(
        uint80 roundId,
        int256 answer,
        uint256 updatedAt,
        uint80 answeredInRound,
        uint256 currentTime
    ) private pure returns (bool) {
        return answer <= 0 || updatedAt == 0 || updatedAt > currentTime || answeredInRound < roundId;
    }

    function _isStale(uint256 updatedAt, uint256 currentTime, uint32 maxAge)
        private
        pure
        returns (bool)
    {
        return currentTime - updatedAt > maxAge;
    }
}
