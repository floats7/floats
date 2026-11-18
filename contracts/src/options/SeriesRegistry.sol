// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OptionsTypes } from "./OptionsTypes.sol";

contract SeriesRegistry {
    error InvalidAddress();
    error InvalidSeriesTerms();
    error Unauthorized();
    error GloballyPaused();
    error SeriesAlreadyExists(bytes32 seriesId);
    error SeriesNotFound(bytes32 seriesId);
    error UnsupportedUnderlying(address underlying);
    error UnderlyingConfigurationMismatch(address underlying);
    error InvalidStateTransition(OptionsTypes.SeriesState current, OptionsTypes.SeriesState next);

    event KeeperSet(address indexed keeper, bool allowed);
    event SettlementEngineSet(address indexed settlementEngine);
    event GlobalPauseSet(bool paused, address indexed caller);
    event UnderlyingConfigured(
        address indexed underlying,
        bytes32 indexed underlyingUid,
        address indexed priceSource,
        bool enabled
    );
    event SeriesCreated(
        bytes32 indexed seriesId,
        address indexed underlying,
        address indexed priceSource,
        OptionsTypes.OptionKind kind,
        uint256 strikeUsd18,
        uint256 capUsd18,
        uint48 expiry,
        uint256 contractSize18,
        bytes32 underlyingUid,
        uint32 corporateActionPolicyVersion
    );
    event SeriesStateChanged(
        bytes32 indexed seriesId,
        OptionsTypes.SeriesState previousState,
        OptionsTypes.SeriesState newState,
        address indexed caller
    );

    address public immutable admin;
    address public immutable guardian;
    address public settlementEngine;
    bool public globallyPaused;

    mapping(address keeper => bool allowed) public isKeeper;
    mapping(address underlying => bool enabled) public isUnderlyingEnabled;
    mapping(address underlying => bytes32 uid) public underlyingUid;
    mapping(address underlying => address source) public underlyingPriceSource;
    mapping(bytes32 seriesId => OptionsTypes.SeriesTerms terms) private _terms;
    mapping(bytes32 seriesId => OptionsTypes.SeriesState state) private _states;
    mapping(bytes32 seriesId => bool exists) public seriesExists;

    constructor(address admin_, address guardian_) {
        if (admin_ == address(0) || guardian_ == address(0)) {
            revert InvalidAddress();
        }
        admin = admin_;
        guardian = guardian_;
    }

    function setKeeper(address keeper, bool allowed) external {
        _requireAdmin();
        if (keeper == address(0)) revert InvalidAddress();
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setSettlementEngine(address settlementEngine_) external {
        _requireAdmin();
        if (settlementEngine_ == address(0)) revert InvalidAddress();
        if (settlementEngine != address(0)) revert InvalidAddress();
        settlementEngine = settlementEngine_;
        emit SettlementEngineSet(settlementEngine_);
    }

    function configureUnderlying(address underlying, bytes32 uid, address priceSource, bool enabled)
        external
    {
        _requireAdmin();
        if (underlying == address(0)) revert InvalidAddress();
        if (enabled && (uid == bytes32(0) || priceSource == address(0))) {
            revert InvalidSeriesTerms();
        }
        isUnderlyingEnabled[underlying] = enabled;
        underlyingUid[underlying] = uid;
        underlyingPriceSource[underlying] = priceSource;
        emit UnderlyingConfigured(underlying, uid, priceSource, enabled);
    }

    function createSeries(OptionsTypes.SeriesTerms calldata terms)
        external
        returns (bytes32 seriesId)
    {
        _requireOperator();
        if (globallyPaused) revert GloballyPaused();
        _validate(terms);
        seriesId = computeSeriesId(terms);
        if (seriesExists[seriesId]) revert SeriesAlreadyExists(seriesId);

        seriesExists[seriesId] = true;
        _terms[seriesId] = terms;
        _states[seriesId] = OptionsTypes.SeriesState.Active;

        emit SeriesCreated(
            seriesId,
            terms.underlying,
            terms.priceSource,
            terms.kind,
            terms.strikeUsd18,
            terms.capUsd18,
            terms.expiry,
            terms.contractSize18,
            terms.underlyingUid,
            terms.corporateActionPolicyVersion
        );
    }

    function setSeriesState(bytes32 seriesId, OptionsTypes.SeriesState next) external {
        if (!seriesExists[seriesId]) revert SeriesNotFound(seriesId);
        OptionsTypes.SeriesState current = _states[seriesId];
        _authorizeTransition(next);
        if (!_canTransition(current, next)) revert InvalidStateTransition(current, next);
        _states[seriesId] = next;
        emit SeriesStateChanged(seriesId, current, next, msg.sender);
    }

    function setGlobalPause(bool paused) external {
        if (paused) {
            if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
        } else {
            _requireAdmin();
        }
        globallyPaused = paused;
        emit GlobalPauseSet(paused, msg.sender);
    }

    function getSeries(bytes32 seriesId)
        external
        view
        returns (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state)
    {
        if (!seriesExists[seriesId]) revert SeriesNotFound(seriesId);
        return (_terms[seriesId], _states[seriesId]);
    }

    function getSeriesState(bytes32 seriesId) external view returns (OptionsTypes.SeriesState) {
        if (!seriesExists[seriesId]) revert SeriesNotFound(seriesId);
        return _states[seriesId];
    }

    function computeSeriesId(OptionsTypes.SeriesTerms calldata terms)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                terms.underlying,
                terms.underlyingUid,
                terms.priceSource,
                terms.kind,
                terms.strikeUsd18,
                terms.capUsd18,
                terms.expiry,
                terms.contractSize18,
                terms.corporateActionPolicyVersion
            )
        );
    }

    function _validate(OptionsTypes.SeriesTerms calldata terms) private view {
        if (!isUnderlyingEnabled[terms.underlying]) {
            revert UnsupportedUnderlying(terms.underlying);
        }
        if (
            terms.underlyingUid != underlyingUid[terms.underlying]
                || terms.priceSource != underlyingPriceSource[terms.underlying]
        ) revert UnderlyingConfigurationMismatch(terms.underlying);
        if (
            terms.priceSource == address(0) || terms.underlyingUid == bytes32(0)
                || terms.strikeUsd18 == 0 || terms.contractSize18 == 0
                || terms.expiry <= block.timestamp || terms.corporateActionPolicyVersion == 0
        ) revert InvalidSeriesTerms();

        if (terms.kind == OptionsTypes.OptionKind.CappedCall) {
            if (terms.capUsd18 <= terms.strikeUsd18) revert InvalidSeriesTerms();
        } else if (terms.capUsd18 != 0) {
            revert InvalidSeriesTerms();
        }
    }

    function _canTransition(OptionsTypes.SeriesState current, OptionsTypes.SeriesState next)
        private
        pure
        returns (bool)
    {
        if (current == next || current == OptionsTypes.SeriesState.Archived) return false;
        if (next == OptionsTypes.SeriesState.Suspended) {
            return current == OptionsTypes.SeriesState.Active
                || current == OptionsTypes.SeriesState.TradingClosed;
        }
        if (next == OptionsTypes.SeriesState.ManualSettlementRequired) {
            return current == OptionsTypes.SeriesState.Suspended
                || current == OptionsTypes.SeriesState.TradingClosed;
        }
        if (next == OptionsTypes.SeriesState.TradingClosed) {
            return current == OptionsTypes.SeriesState.Active
                || current == OptionsTypes.SeriesState.Suspended;
        }
        if (next == OptionsTypes.SeriesState.Settled) {
            return current == OptionsTypes.SeriesState.TradingClosed
                || current == OptionsTypes.SeriesState.ManualSettlementRequired;
        }
        return
            next == OptionsTypes.SeriesState.Archived && current == OptionsTypes.SeriesState.Settled;
    }

    function _requireAdmin() private view {
        if (msg.sender != admin) revert Unauthorized();
    }

    function _requireOperator() private view {
        if (msg.sender != admin && !isKeeper[msg.sender]) revert Unauthorized();
    }

    function _authorizeTransition(OptionsTypes.SeriesState next) private view {
        if (next == OptionsTypes.SeriesState.Settled && msg.sender == settlementEngine) return;
        if (next == OptionsTypes.SeriesState.Suspended) {
            if (msg.sender != admin && msg.sender != guardian) revert Unauthorized();
            return;
        }
        if (next == OptionsTypes.SeriesState.TradingClosed) {
            _requireOperator();
            return;
        }
        _requireAdmin();
    }
}
