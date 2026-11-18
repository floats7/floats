// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { NavOracle } from "../src/oracle/NavOracle.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
}

contract NavOracleTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    NavOracle private oracle;
    MockStockToken private token;
    MockAggregator private feed;

    function setUp() public {
        vm.warp(10_000);
        oracle = new NavOracle(address(this));
        token = new MockStockToken();
        feed = new MockAggregator(8);
        feed.setRound(1, 12_345_000_000, 9950, 1);
        _configure(address(token), address(feed), 100);
    }

    function testNormalizesPriceAndCalculatesValue() public view {
        NavOracle.Observation memory observation = oracle.observe(address(token));
        _assertEq(observation.normalizedPrice, 123_450_000_000_000_000_000, "normalized price");
        _assertEq(uint256(observation.health), uint256(NavOracle.Health.Live), "health");
        _assertEq(
            oracle.constituentValue(address(token), 2 ether), 246_900_000_000_000_000_000, "value"
        );
    }

    function testTotalValueIncludesIdleUsdg() public view {
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2 ether;

        uint256 value = oracle.totalValue(tokens, amounts, 10_000_000);
        _assertEq(value, 256_900_000_000_000_000_000, "total value");
    }

    function testReportsStalePrice() public {
        feed.setRound(2, 12_345_000_000, 9899, 2);
        NavOracle.Observation memory observation = oracle.observe(address(token));
        _assertEq(uint256(observation.health), uint256(NavOracle.Health.Stale), "stale health");

        try oracle.constituentValue(address(token), 1 ether) {
            revert("expected stale price revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, NavOracle.PriceUnavailable.selector);
        }
    }

    function testReportsTokenOraclePause() public {
        token.setOraclePaused(true);
        NavOracle.Observation memory observation = oracle.observe(address(token));
        _assertEq(uint256(observation.health), uint256(NavOracle.Health.Paused), "paused health");
    }

    function testRejectsIncompleteRound() public {
        feed.setRound(3, 12_345_000_000, 9950, 2);
        NavOracle.Observation memory observation = oracle.observe(address(token));
        _assertEq(uint256(observation.health), uint256(NavOracle.Health.Invalid), "invalid health");
    }

    function testReportsUnconfiguredAndFailedTokenObservation() public {
        MockStockToken unconfiguredToken = new MockStockToken();
        NavOracle.Observation memory unconfigured = oracle.observe(address(unconfiguredToken));
        _assertEq(
            uint256(unconfigured.health), uint256(NavOracle.Health.Unconfigured), "unconfigured"
        );

        MockStockToken revertingToken = new MockStockToken();
        MockAggregator revertingTokenFeed = new MockAggregator(8);
        revertingTokenFeed.setRound(1, 1e8, block.timestamp, 1);
        _configure(address(revertingToken), address(revertingTokenFeed), 100);
        revertingToken.setReverts(true);

        NavOracle.Observation memory invalid = oracle.observe(address(revertingToken));
        _assertEq(uint256(invalid.health), uint256(NavOracle.Health.Invalid), "token call failure");
    }

    function testReportsFailedFeedObservation() public {
        feed.setReverts(true);
        NavOracle.Observation memory observation = oracle.observe(address(token));
        _assertEq(uint256(observation.health), uint256(NavOracle.Health.Invalid), "feed failure");
    }

    function testRejectsInvalidRoundValues() public {
        feed.setRound(2, 0, 9950, 2);
        _assertHealth(address(token), NavOracle.Health.Invalid, "zero answer");

        feed.setRound(3, -1, 9950, 3);
        _assertHealth(address(token), NavOracle.Health.Invalid, "negative answer");

        feed.setRound(4, 1, 0, 4);
        _assertHealth(address(token), NavOracle.Health.Invalid, "zero timestamp");

        feed.setRound(5, 1, block.timestamp + 1, 5);
        _assertHealth(address(token), NavOracle.Health.Invalid, "future timestamp");
    }

    function testRejectsConfigurationLengthMismatch() public {
        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](0);
        uint32[] memory maxAges = new uint32[](1);

        _expectConfigureRevert(tokens, feeds, maxAges, NavOracle.LengthMismatch.selector);
    }

    function testRejectsInvalidFeedConfiguration() public {
        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory maxAges = new uint32[](1);
        tokens[0] = address(token);
        feeds[0] = address(feed);
        maxAges[0] = 100;

        tokens[0] = address(0);
        _expectConfigureRevert(tokens, feeds, maxAges, NavOracle.InvalidAddress.selector);

        tokens[0] = address(token);
        feeds[0] = address(0);
        _expectConfigureRevert(tokens, feeds, maxAges, NavOracle.InvalidAddress.selector);

        feeds[0] = address(feed);
        maxAges[0] = 0;
        _expectConfigureRevert(tokens, feeds, maxAges, NavOracle.InvalidMaxAge.selector);
    }

    function testRejectsDuplicateTokenAndUnsupportedDecimals() public {
        address[] memory tokens = new address[](2);
        address[] memory feeds = new address[](2);
        uint32[] memory maxAges = new uint32[](2);
        tokens[0] = address(token);
        tokens[1] = address(token);
        feeds[0] = address(feed);
        feeds[1] = address(feed);
        maxAges[0] = 100;
        maxAges[1] = 100;
        _expectConfigureRevert(tokens, feeds, maxAges, NavOracle.DuplicateToken.selector);

        MockAggregator unsupportedFeed = new MockAggregator(37);
        tokens = new address[](1);
        feeds = new address[](1);
        maxAges = new uint32[](1);
        tokens[0] = address(new MockStockToken());
        feeds[0] = address(unsupportedFeed);
        maxAges[0] = 100;
        _expectConfigureRevert(tokens, feeds, maxAges, NavOracle.InvalidFeedDecimals.selector);
    }

    function testRejectsTotalValueLengthMismatch() public view {
        address[] memory tokens = new address[](1);
        uint256[] memory amounts = new uint256[](0);
        try oracle.totalValue(tokens, amounts, 0) {
            revert("expected total value length revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, NavOracle.LengthMismatch.selector);
        }
    }

    function testConstructorRejectsZeroAdmin() public {
        try new NavOracle(address(0)) {
            revert("expected zero admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, NavOracle.InvalidAddress.selector);
        }
    }

    function testOnlyAdminCanConfigure() public {
        UnauthorizedOracleCaller caller = new UnauthorizedOracleCaller();
        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory maxAges = new uint32[](1);
        tokens[0] = address(token);
        feeds[0] = address(feed);
        maxAges[0] = 100;

        try caller.configure(oracle, tokens, feeds, maxAges) {
            revert("expected admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, NavOracle.NotAdmin.selector);
        }
    }

    function testFuzzNormalizesFeedDecimals(uint8 decimalsSeed, uint96 priceSeed) public {
        uint8 feedDecimals = decimalsSeed % 19;
        uint256 scale = 10 ** feedDecimals;
        uint256 wholePrice = (uint256(priceSeed) % 1_000_000) + 1;
        MockAggregator fuzzFeed = new MockAggregator(feedDecimals);
        MockStockToken fuzzToken = new MockStockToken();
        fuzzFeed.setRound(1, int256(wholePrice * scale), block.timestamp, 1);
        _configure(address(fuzzToken), address(fuzzFeed), 100);

        NavOracle.Observation memory observation = oracle.observe(address(fuzzToken));
        _assertEq(observation.normalizedPrice, wholePrice * 1e18, "fuzz normalized price");
        _assertEq(uint256(observation.health), uint256(NavOracle.Health.Live), "fuzz health");
    }

    function _configure(address tokenAddress, address feedAddress, uint32 maxAge) private {
        address[] memory tokens = new address[](1);
        address[] memory feeds = new address[](1);
        uint32[] memory maxAges = new uint32[](1);
        tokens[0] = tokenAddress;
        feeds[0] = feedAddress;
        maxAges[0] = maxAge;
        oracle.configureFeeds(tokens, feeds, maxAges);
    }

    function _expectConfigureRevert(
        address[] memory tokens,
        address[] memory feeds,
        uint32[] memory maxAges,
        bytes4 expectedSelector
    ) private {
        try oracle.configureFeeds(tokens, feeds, maxAges) {
            revert("expected configuration revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, expectedSelector);
        }
    }

    function _assertHealth(address tokenAddress, NavOracle.Health expected, string memory message)
        private
        view
    {
        NavOracle.Observation memory observation = oracle.observe(tokenAddress);
        _assertEq(uint256(observation.health), uint256(expected), message);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing revert selector");
        bytes4 actual;
        assembly ("memory-safe") {
            actual := mload(add(reason, 0x20))
        }
        require(actual == expected, "unexpected revert selector");
    }
}

contract MockStockToken {
    bool private paused;
    bool private shouldRevert;

    function oraclePaused() external view returns (bool) {
        require(!shouldRevert, "token observation failed");
        return paused;
    }

    function setOraclePaused(bool value) external {
        paused = value;
    }

    function setReverts(bool value) external {
        shouldRevert = value;
    }
}

contract MockAggregator {
    uint8 public immutable decimals;
    uint80 private roundId;
    int256 private answer;
    uint256 private updatedAt;
    uint80 private answeredInRound;
    bool private shouldRevert;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function setRound(uint80 roundId_, int256 answer_, uint256 updatedAt_, uint80 answeredInRound_)
        external
    {
        roundId = roundId_;
        answer = answer_;
        updatedAt = updatedAt_;
        answeredInRound = answeredInRound_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!shouldRevert, "feed observation failed");
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }

    function setReverts(bool value) external {
        shouldRevert = value;
    }
}

contract UnauthorizedOracleCaller {
    function configure(
        NavOracle oracle,
        address[] memory tokens,
        address[] memory feeds,
        uint32[] memory maxAges
    ) external {
        oracle.configureFeeds(tokens, feeds, maxAges);
    }
}
