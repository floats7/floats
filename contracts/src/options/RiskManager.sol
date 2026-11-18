// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { OptionsTypes } from "./OptionsTypes.sol";

interface IRiskSeriesRegistry {
    function getSeries(bytes32 seriesId)
        external
        view
        returns (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state);
}

interface IRiskOptionsVault {
    function totalAssets() external view returns (uint256);
    function reservedCollateral() external view returns (uint256);
}

contract RiskManager {
    struct Limits {
        uint16 utilizationBps;
        uint16 underlyingBps;
        uint16 expiryBps;
        uint16 seriesBps;
    }

    error InvalidAddress();
    error InvalidLimits();
    error Unauthorized();
    error AlreadyConfigured();
    error InvalidExposureChange();
    error RiskLimitExceeded(bytes32 limit, uint256 exposure, uint256 maximum);

    event MarketSet(address indexed market);
    event SettlementEngineSet(address indexed settlementEngine);
    event LimitsSet(
        uint16 utilizationBps, uint16 underlyingBps, uint16 expiryBps, uint16 seriesBps
    );
    event ExposureOpened(
        bytes32 indexed seriesId,
        address indexed underlying,
        uint48 indexed expiry,
        uint256 liability6
    );
    event ExposureClosed(bytes32 indexed seriesId, uint256 liability6);
    event ExposureSettled(bytes32 indexed seriesId, uint256 liability6);

    uint16 public constant MAX_UTILIZATION_BPS = 9000;
    uint16 public constant MAX_UNDERLYING_BPS = 5000;
    uint16 public constant MAX_EXPIRY_BPS = 6000;
    uint16 public constant MAX_SERIES_BPS = 2500;
    uint256 private constant BPS = 10_000;

    bytes32 private constant UTILIZATION_LIMIT = keccak256("UTILIZATION_LIMIT");
    bytes32 private constant UNDERLYING_LIMIT = keccak256("UNDERLYING_LIMIT");
    bytes32 private constant EXPIRY_LIMIT = keccak256("EXPIRY_LIMIT");
    bytes32 private constant SERIES_LIMIT = keccak256("SERIES_LIMIT");

    address public immutable admin;
    IRiskSeriesRegistry public immutable registry;
    IRiskOptionsVault public immutable vault;
    address public market;
    address public settlementEngine;
    Limits public limits;

    mapping(bytes32 seriesId => uint256 liability6) public seriesExposure6;
    mapping(address underlying => uint256 liability6) public underlyingExposure6;
    mapping(uint48 expiry => uint256 liability6) public expiryExposure6;

    constructor(address admin_, address registry_, address vault_, Limits memory initialLimits) {
        if (admin_ == address(0) || registry_ == address(0) || vault_ == address(0)) {
            revert InvalidAddress();
        }
        admin = admin_;
        registry = IRiskSeriesRegistry(registry_);
        vault = IRiskOptionsVault(vault_);
        _setLimits(initialLimits);
    }

    function setMarket(address market_) external {
        _requireAdmin();
        if (market_ == address(0)) revert InvalidAddress();
        if (market != address(0)) revert AlreadyConfigured();
        market = market_;
        emit MarketSet(market_);
    }

    function setSettlementEngine(address settlementEngine_) external {
        _requireAdmin();
        if (settlementEngine_ == address(0)) revert InvalidAddress();
        if (settlementEngine != address(0)) revert AlreadyConfigured();
        settlementEngine = settlementEngine_;
        emit SettlementEngineSet(settlementEngine_);
    }

    function setLimits(Limits calldata next) external {
        _requireAdmin();
        _setLimits(next);
    }

    function recordOpen(bytes32 seriesId, uint256 liability6) external {
        _requireMarket();
        if (liability6 == 0) revert InvalidExposureChange();
        (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
            registry.getSeries(seriesId);
        if (state != OptionsTypes.SeriesState.Active) revert InvalidExposureChange();

        seriesExposure6[seriesId] += liability6;
        underlyingExposure6[terms.underlying] += liability6;
        expiryExposure6[terms.expiry] += liability6;
        _enforce(seriesId, terms.underlying, terms.expiry);
        emit ExposureOpened(seriesId, terms.underlying, terms.expiry, liability6);
    }

    function recordClose(bytes32 seriesId, uint256 liability6) external {
        _requireMarket();
        _decrease(seriesId, liability6, false);
    }

    function recordSettlement(bytes32 seriesId, uint256 liability6) external {
        if (msg.sender != settlementEngine || settlementEngine == address(0)) {
            revert Unauthorized();
        }
        _decrease(seriesId, liability6, true);
    }

    function _decrease(bytes32 seriesId, uint256 liability6, bool settlement) private {
        if (liability6 == 0 || liability6 > seriesExposure6[seriesId]) {
            revert InvalidExposureChange();
        }
        (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
            registry.getSeries(seriesId);
        if (state == OptionsTypes.SeriesState.Archived) revert InvalidExposureChange();
        seriesExposure6[seriesId] -= liability6;
        underlyingExposure6[terms.underlying] -= liability6;
        expiryExposure6[terms.expiry] -= liability6;
        if (settlement) emit ExposureSettled(seriesId, liability6);
        else emit ExposureClosed(seriesId, liability6);
    }

    function _enforce(bytes32 seriesId, address underlying, uint48 expiry) private view {
        uint256 reserved = vault.reservedCollateral();
        uint256 capital = vault.totalAssets() + reserved;
        if (capital == 0) revert RiskLimitExceeded(UTILIZATION_LIMIT, reserved, 0);

        _requireWithin(UTILIZATION_LIMIT, reserved, limits.utilizationBps, capital);
        _requireWithin(
            UNDERLYING_LIMIT, underlyingExposure6[underlying], limits.underlyingBps, capital
        );
        _requireWithin(EXPIRY_LIMIT, expiryExposure6[expiry], limits.expiryBps, capital);
        _requireWithin(SERIES_LIMIT, seriesExposure6[seriesId], limits.seriesBps, capital);
    }

    function _requireWithin(bytes32 limit, uint256 exposure, uint16 limitBps, uint256 capital)
        private
        pure
    {
        uint256 maximum = Math.mulDiv(capital, limitBps, BPS);
        if (exposure > maximum) revert RiskLimitExceeded(limit, exposure, maximum);
    }

    function _setLimits(Limits memory next) private {
        if (
            next.utilizationBps == 0 || next.utilizationBps > MAX_UTILIZATION_BPS
                || next.underlyingBps == 0 || next.underlyingBps > MAX_UNDERLYING_BPS
                || next.expiryBps == 0 || next.expiryBps > MAX_EXPIRY_BPS || next.seriesBps == 0
                || next.seriesBps > MAX_SERIES_BPS
        ) revert InvalidLimits();
        limits = next;
        emit LimitsSet(next.utilizationBps, next.underlyingBps, next.expiryBps, next.seriesBps);
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }

    function _requireMarket() private view {
        if (msg.sender != market || market == address(0)) revert Unauthorized();
    }
}
