// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IPerpsMarketRegistry } from "./interfaces/IPerpsMarketRegistry.sol";
import { PerpsTypes } from "./PerpsTypes.sol";

contract PerpsMarketRegistry is IPerpsMarketRegistry {
    error InvalidAddress();
    error InvalidConfiguration();
    error MarketAlreadyExists(bytes32 marketId);
    error MarketNotFound(bytes32 marketId);
    error Unauthorized();

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed underlying,
        bytes32 indexed underlyingUid,
        bytes32 symbol,
        address priceFeed,
        bool isolatedOnly
    );
    event MarketConfigurationUpdated(bytes32 indexed marketId);
    event MarketStateChanged(
        bytes32 indexed marketId,
        PerpsTypes.MarketState previousState,
        PerpsTypes.MarketState newState,
        address indexed caller
    );
    event SessionStateChanged(
        bytes32 indexed marketId,
        PerpsTypes.SessionState previousState,
        PerpsTypes.SessionState newState,
        address indexed caller
    );
    event KeeperSet(address indexed keeper, bool allowed);

    uint32 public constant BPS = 10_000;
    uint32 public constant MAX_LEVERAGE_BPS = 100_000;
    uint32 public constant MIN_MAINTENANCE_MARGIN_BPS = 500;
    uint32 public constant MAX_OPEN_INTEREST_CAP_BPS = 10_000;
    uint32 public constant MAX_TRADING_FEE_BPS = 100;
    uint32 public constant MAX_BASE_SPREAD_BPS = 500;
    uint48 public constant MIN_PRICE_AGE = 30;
    uint48 public constant MAX_PRICE_AGE = 1 days;

    address public immutable admin;
    address public immutable guardian;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(bytes32 marketId => bool exists) public override marketExists;
    mapping(bytes32 marketId => PerpsTypes.MarketState state) public override marketState;
    mapping(bytes32 marketId => PerpsTypes.SessionState session) public override sessionState;
    mapping(bytes32 marketId => PerpsTypes.MarketConfig config) private _marketConfig;

    constructor(address admin_, address guardian_) {
        if (admin_ == address(0) || guardian_ == address(0)) revert InvalidAddress();
        admin = admin_;
        guardian = guardian_;
    }

    function createMarket(bytes32 marketId, PerpsTypes.MarketConfig calldata config) external {
        _requireAdmin();
        if (marketId == bytes32(0)) revert InvalidConfiguration();
        if (marketExists[marketId]) revert MarketAlreadyExists(marketId);
        _validate(config);

        marketExists[marketId] = true;
        _marketConfig[marketId] = config;
        marketState[marketId] = PerpsTypes.MarketState.Disabled;
        sessionState[marketId] = PerpsTypes.SessionState.Closed;

        emit MarketCreated(
            marketId,
            config.underlying,
            config.underlyingUid,
            config.symbol,
            config.priceFeed,
            config.isolatedOnly
        );
    }

    function updateMarket(bytes32 marketId, PerpsTypes.MarketConfig calldata config) external {
        _requireAdmin();
        _requireMarket(marketId);
        _validate(config);

        PerpsTypes.MarketConfig storage current = _marketConfig[marketId];
        if (
            current.underlying != config.underlying || current.underlyingUid != config.underlyingUid
                || current.symbol != config.symbol
        ) revert InvalidConfiguration();

        _marketConfig[marketId] = config;
        emit MarketConfigurationUpdated(marketId);
    }

    function setMarketState(bytes32 marketId, PerpsTypes.MarketState next) external {
        _requireMarket(marketId);
        PerpsTypes.MarketState current = marketState[marketId];
        if (current == next) revert InvalidConfiguration();

        if (next == PerpsTypes.MarketState.Disabled) {
            if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        } else if (next == PerpsTypes.MarketState.ReduceOnly) {
            if (msg.sender != admin && msg.sender != guardian && !isKeeper[msg.sender]) {
                revert Unauthorized();
            }
        } else {
            _requireAdmin();
        }

        marketState[marketId] = next;
        emit MarketStateChanged(marketId, current, next, msg.sender);
    }

    function setSessionState(bytes32 marketId, PerpsTypes.SessionState next) external {
        _requireMarket(marketId);
        if (msg.sender != admin && !isKeeper[msg.sender]) revert Unauthorized();
        PerpsTypes.SessionState current = sessionState[marketId];
        if (current == next) revert InvalidConfiguration();
        sessionState[marketId] = next;
        emit SessionStateChanged(marketId, current, next, msg.sender);
    }

    function setKeeper(address keeper, bool allowed) external {
        _requireAdmin();
        if (keeper == address(0)) revert InvalidAddress();
        // The adjacent KeeperSet event provides the access-control audit trail.
        // forge-lint: disable-next-line(missing-events-access-control)
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function getMarket(bytes32 marketId)
        external
        view
        override
        returns (
            PerpsTypes.MarketConfig memory config,
            PerpsTypes.MarketState state,
            PerpsTypes.SessionState session
        )
    {
        _requireMarket(marketId);
        return (_marketConfig[marketId], marketState[marketId], sessionState[marketId]);
    }

    function computeMarketId(bytes32 underlyingUid) external pure returns (bytes32) {
        if (underlyingUid == bytes32(0)) revert InvalidConfiguration();
        return keccak256(abi.encode("FLOATS_PERPS_V1", underlyingUid));
    }

    function _validate(PerpsTypes.MarketConfig calldata config) private pure {
        if (
            config.underlying == address(0) || config.underlyingUid == bytes32(0)
                || config.symbol == bytes32(0) || config.priceFeed == address(0)
        ) revert InvalidConfiguration();
        if (
            config.maxLeverageBps < BPS || config.maxLeverageBps > MAX_LEVERAGE_BPS
                || config.initialMarginBps == 0 || config.initialMarginBps > BPS
                || config.maintenanceMarginBps < MIN_MAINTENANCE_MARGIN_BPS
                || config.maintenanceMarginBps >= config.initialMarginBps
        ) revert InvalidConfiguration();
        if (
            config.openInterestCapBps == 0 || config.openInterestCapBps > MAX_OPEN_INTEREST_CAP_BPS
                || config.baseSpreadBps > MAX_BASE_SPREAD_BPS
                || config.tradingFeeBps > MAX_TRADING_FEE_BPS
        ) revert InvalidConfiguration();
        if (
            config.extendedSpreadMultiplierBps < BPS || config.extendedLeverageDivisorBps < BPS
                || config.maxPriceAge < MIN_PRICE_AGE || config.maxPriceAge > MAX_PRICE_AGE
        ) revert InvalidConfiguration();

        uint256 minimumInitialMarginBps =
            (uint256(BPS) * BPS + config.maxLeverageBps - 1) / config.maxLeverageBps;
        if (config.initialMarginBps < minimumInitialMarginBps) revert InvalidConfiguration();
    }

    function _requireMarket(bytes32 marketId) private view {
        if (!marketExists[marketId]) revert MarketNotFound(marketId);
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }
}
