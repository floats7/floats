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

    function oraclePaused() external view returns (bool) {
        return paused;
    }

    function setOraclePaused(bool value) external {
        paused = value;
    }
}

contract MockAggregator {
    uint8 public immutable decimals;
    uint80 private roundId;
    int256 private answer;
    uint256 private updatedAt;
    uint80 private answeredInRound;

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
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
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
