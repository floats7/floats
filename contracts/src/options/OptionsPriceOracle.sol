// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IFloatsNavOracle {
    enum Health { Unconfigured, Live, Stale, Paused, Invalid }
    struct Observation { uint256 normalizedPrice; uint256 updatedAt; Health health; }
    function observe(address token) external view returns (Observation memory observation);
}

/// @notice Adapts Core NAV observations to the live and expiry-price Options interfaces.
contract OptionsPriceOracle {
    struct FinalObservation { uint256 priceUsd18; uint48 observedAt; bool finalized; }

    error InvalidAddress();
    error InvalidExpiry();
    error PriceUnavailable(address underlying);
    error Unauthorized();
    error AlreadyFinalized(address underlying, uint48 expiry);

    event KeeperSet(address indexed keeper, bool allowed);
    event SettlementPriceFinalized(
        address indexed underlying, uint48 indexed expiry, uint256 priceUsd18, uint48 observedAt
    );

    address public immutable admin;
    IFloatsNavOracle public immutable navOracle;
    uint48 public immutable maximumObservationDelay;
    mapping(address keeper => bool allowed) public isKeeper;
    mapping(address underlying => mapping(uint48 expiry => FinalObservation observation))
        private _finalObservations;

    constructor(address admin_, address navOracle_, uint48 maximumObservationDelay_) {
        if (admin_ == address(0) || navOracle_ == address(0)) revert InvalidAddress();
        if (maximumObservationDelay_ == 0 || maximumObservationDelay_ > 7 days) {
            revert InvalidExpiry();
        }
        admin = admin_;
        navOracle = IFloatsNavOracle(navOracle_);
        maximumObservationDelay = maximumObservationDelay_;
    }

    function setKeeper(address keeper, bool allowed) external {
        if (msg.sender != admin) revert Unauthorized();
        if (keeper == address(0)) revert InvalidAddress();
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function currentPrice(address underlying)
        external view returns (uint256 priceUsd18, bool healthy)
    {
        IFloatsNavOracle.Observation memory observation = navOracle.observe(underlying);
        healthy = observation.health == IFloatsNavOracle.Health.Live;
        priceUsd18 = healthy ? observation.normalizedPrice : 0;
    }

    function finalizeSettlementPrice(address underlying, uint48 expiry) external {
        if (msg.sender != admin && !isKeeper[msg.sender]) revert Unauthorized();
        if (
            expiry == 0 || block.timestamp < expiry
                || block.timestamp > uint256(expiry) + maximumObservationDelay
        ) revert InvalidExpiry();
        FinalObservation storage finalObservation = _finalObservations[underlying][expiry];
        if (finalObservation.finalized) revert AlreadyFinalized(underlying, expiry);

        IFloatsNavOracle.Observation memory observation = navOracle.observe(underlying);
        if (
            observation.health != IFloatsNavOracle.Health.Live
                || observation.normalizedPrice == 0 || observation.updatedAt < expiry
                || observation.updatedAt > uint256(expiry) + maximumObservationDelay
        ) revert PriceUnavailable(underlying);

        finalObservation.priceUsd18 = observation.normalizedPrice;
        finalObservation.observedAt = uint48(observation.updatedAt);
        finalObservation.finalized = true;
        emit SettlementPriceFinalized(
            underlying, expiry, observation.normalizedPrice, uint48(observation.updatedAt)
        );
    }

    function settlementPrice(address underlying, uint48 expiry)
        external view returns (uint256 priceUsd18, uint48 observedAt, bool finalObservation)
    {
        FinalObservation memory observation = _finalObservations[underlying][expiry];
        return (observation.priceUsd18, observation.observedAt, observation.finalized);
    }
}
