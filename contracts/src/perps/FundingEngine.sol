// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IFundingEngine } from "./interfaces/IFundingEngine.sol";
import { IPerpsMarketRegistry } from "./interfaces/IPerpsMarketRegistry.sol";
import { IPerpsPositionSource } from "./interfaces/IPerpsPositionSource.sol";

contract FundingEngine is IFundingEngine {
    error FundingTooEarly(bytes32 marketId, uint256 nextUpdateAt);
    error InvalidAddress();
    error InvalidFundingConfiguration();
    error MarketNotFound(bytes32 marketId);
    error PositionSourceAlreadyConfigured();
    error PositionSourceNotConfigured();
    error Unauthorized();

    event FundingConfigurationSet(
        bytes32 indexed marketId, uint256 skewCoefficient18, uint256 maximumRate18
    );
    event FundingUpdated(
        bytes32 indexed marketId,
        int256 fundingRate18,
        int256 cumulativeFundingIndex18,
        uint256 longOpenInterestUsd18,
        uint256 shortOpenInterestUsd18,
        uint48 updatedAt
    );
    event KeeperSet(address indexed keeper, bool allowed);
    event PositionSourceSet(address indexed positionSource);

    uint256 public constant RATE_SCALE = 1e18;
    uint256 public constant UPDATE_INTERVAL = 1 hours;
    uint256 public constant MAX_RATE_LIMIT_18 = 1e16;

    struct FundingState {
        int256 cumulativeIndex18;
        uint48 lastUpdatedAt;
        uint256 skewCoefficient18;
        uint256 maximumRate18;
        bool configured;
    }

    address public immutable admin;
    IPerpsMarketRegistry public immutable registry;
    IPerpsPositionSource public positionSource;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(bytes32 marketId => FundingState state) private _fundingState;

    constructor(address admin_, address registry_) {
        if (admin_ == address(0) || registry_ == address(0)) {
            revert InvalidAddress();
        }
        admin = admin_;
        registry = IPerpsMarketRegistry(registry_);
    }

    function setPositionSource(address positionSource_) external {
        _requireAdmin();
        if (positionSource_ == address(0)) revert InvalidAddress();
        if (address(positionSource) != address(0)) revert PositionSourceAlreadyConfigured();
        positionSource = IPerpsPositionSource(positionSource_);
        emit PositionSourceSet(positionSource_);
    }

    function configureMarket(bytes32 marketId, uint256 skewCoefficient18, uint256 maximumRate18)
        external
    {
        _requireAdmin();
        if (!registry.marketExists(marketId)) revert MarketNotFound(marketId);
        if (skewCoefficient18 == 0 || maximumRate18 == 0 || maximumRate18 > MAX_RATE_LIMIT_18) {
            revert InvalidFundingConfiguration();
        }

        FundingState storage state = _fundingState[marketId];
        state.skewCoefficient18 = skewCoefficient18;
        state.maximumRate18 = maximumRate18;
        state.configured = true;
        if (state.lastUpdatedAt == 0) {
            // block.timestamp is bounded far below uint48 for the lifetime of the protocol.
            // forge-lint: disable-next-line(unsafe-typecast)
            state.lastUpdatedAt = uint48(block.timestamp);
        }
        emit FundingConfigurationSet(marketId, skewCoefficient18, maximumRate18);
    }

    function updateFunding(bytes32 marketId) external returns (int256 cumulativeIndex18) {
        if (msg.sender != admin && !isKeeper[msg.sender]) revert Unauthorized();
        _requirePositionSource();
        FundingState storage state = _fundingState[marketId];
        if (!state.configured) revert InvalidFundingConfiguration();
        uint256 nextUpdateAt = uint256(state.lastUpdatedAt) + UPDATE_INTERVAL;
        // Timestamp comparison enforces the configured funding cadence.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < nextUpdateAt) revert FundingTooEarly(marketId, nextUpdateAt);

        (uint256 longOi, uint256 shortOi) = positionSource.openInterest(marketId);
        uint256 elapsed = block.timestamp - state.lastUpdatedAt;
        int256 rate18 = _fundingRate(longOi, shortOi, state.skewCoefficient18, state.maximumRate18);
        // Elapsed seconds and the one-hour constant remain far below int256 bounds.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 elapsedIndex = rate18 * int256(elapsed) / int256(UPDATE_INTERVAL);
        cumulativeIndex18 = state.cumulativeIndex18 + elapsedIndex;
        state.cumulativeIndex18 = cumulativeIndex18;
        // block.timestamp is bounded far below uint48 for the lifetime of the protocol.
        // forge-lint: disable-next-line(unsafe-typecast)
        state.lastUpdatedAt = uint48(block.timestamp);

        emit FundingUpdated(
            marketId, rate18, cumulativeIndex18, longOi, shortOi, state.lastUpdatedAt
        );
    }

    function currentFundingIndex(bytes32 marketId) external view override returns (int256 index18) {
        _requirePositionSource();
        FundingState memory state = _fundingState[marketId];
        if (!state.configured) revert InvalidFundingConfiguration();
        (uint256 longOi, uint256 shortOi) = positionSource.openInterest(marketId);
        uint256 elapsed = block.timestamp - state.lastUpdatedAt;
        int256 rate18 = _fundingRate(longOi, shortOi, state.skewCoefficient18, state.maximumRate18);
        // Elapsed seconds and the one-hour constant remain far below int256 bounds.
        // forge-lint: disable-next-line(unsafe-typecast)
        return state.cumulativeIndex18 + rate18 * int256(elapsed) / int256(UPDATE_INTERVAL);
    }

    function getFundingState(bytes32 marketId) external view returns (FundingState memory) {
        return _fundingState[marketId];
    }

    function setKeeper(address keeper, bool allowed) external {
        _requireAdmin();
        if (keeper == address(0)) revert InvalidAddress();
        // The adjacent KeeperSet event provides the access-control audit trail.
        // forge-lint: disable-next-line(missing-events-access-control)
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function _fundingRate(
        uint256 longOi,
        uint256 shortOi,
        uint256 skewCoefficient18,
        uint256 maximumRate18
    ) private pure returns (int256 rate18) {
        uint256 totalOi = longOi + shortOi;
        if (totalOi == 0 || longOi == shortOi) return 0;

        if (longOi > shortOi) {
            uint256 longRate = skewCoefficient18 * (longOi - shortOi) / totalOi;
            // The configured maximum is bounded to 1e16.
            // forge-lint: disable-next-line(unsafe-typecast)
            return int256(longRate > maximumRate18 ? maximumRate18 : longRate);
        }

        uint256 shortRate = skewCoefficient18 * (shortOi - longOi) / totalOi;
        // The configured maximum is bounded to 1e16.
        // forge-lint: disable-next-line(unsafe-typecast)
        return -int256(shortRate > maximumRate18 ? maximumRate18 : shortRate);
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }

    function _requirePositionSource() private view {
        if (address(positionSource) == address(0)) revert PositionSourceNotConfigured();
    }
}
