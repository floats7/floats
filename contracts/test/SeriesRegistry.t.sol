// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";

contract SeriesRegistryTest {
    address private constant FIPO = address(0xF1F0);
    address private constant FEED = address(0xF33D);
    bytes32 private constant UID = keccak256("fIPO");

    SeriesRegistry private registry;
    RegistryCaller private guardian;
    RegistryCaller private keeper;

    function setUp() public {
        guardian = new RegistryCaller();
        keeper = new RegistryCaller();
        registry = new SeriesRegistry(address(this), address(guardian));
        registry.configureUnderlying(FIPO, UID, FEED, true);
        registry.setKeeper(address(keeper), true);
    }

    function testCreatesDeterministicImmutableSeries() public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();
        bytes32 expected = registry.computeSeriesId(terms);
        bytes32 seriesId = registry.createSeries(terms);
        require(seriesId == expected, "series id mismatch");

        (OptionsTypes.SeriesTerms memory stored, OptionsTypes.SeriesState state) =
            registry.getSeries(seriesId);
        require(stored.underlying == FIPO, "underlying mismatch");
        require(stored.underlyingUid == UID, "uid mismatch");
        require(stored.priceSource == FEED, "feed mismatch");
        require(stored.strikeUsd18 == 100e18, "strike mismatch");
        require(stored.capUsd18 == 200e18, "cap mismatch");
        require(state == OptionsTypes.SeriesState.Active, "initial state mismatch");

        _expectCreateRevert(terms, SeriesRegistry.SeriesAlreadyExists.selector);
    }

    function testSupportsEveryApprovedUnderlyingAndRejectsUnapprovedAssets() public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();
        terms.underlying = address(0xBAD);
        _expectCreateRevert(terms, SeriesRegistry.UnsupportedUnderlying.selector);

        address secondAsset = address(0xA55E7);
        bytes32 secondUid = keccak256("SECOND");
        address secondFeed = address(0xBEEF);
        registry.configureUnderlying(secondAsset, secondUid, secondFeed, true);
        terms = _callTerms();
        terms.underlying = secondAsset;
        terms.underlyingUid = secondUid;
        terms.priceSource = secondFeed;
        bytes32 secondSeries = registry.createSeries(terms);
        (OptionsTypes.SeriesTerms memory stored,) = registry.getSeries(secondSeries);
        require(stored.underlying == secondAsset, "approved asset mismatch");

        terms.priceSource = FEED;
        _expectCreateRevert(terms, SeriesRegistry.UnderlyingConfigurationMismatch.selector);

        registry.configureUnderlying(secondAsset, secondUid, secondFeed, false);
        terms.priceSource = secondFeed;
        terms.strikeUsd18 = 101e18;
        _expectCreateRevert(terms, SeriesRegistry.UnsupportedUnderlying.selector);
    }

    function testRejectsInvalidPayoffTerms() public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();

        terms.capUsd18 = terms.strikeUsd18;
        _expectCreateRevert(terms, SeriesRegistry.InvalidSeriesTerms.selector);

        terms = _putTerms();
        terms.capUsd18 = 1;
        _expectCreateRevert(terms, SeriesRegistry.InvalidSeriesTerms.selector);
    }

    function testKeeperCanCreateAndCloseButCannotSettle() public {
        bytes32 seriesId = keeper.create(registry, _callTerms());
        keeper.setState(registry, seriesId, OptionsTypes.SeriesState.TradingClosed);

        try keeper.setState(registry, seriesId, OptionsTypes.SeriesState.Settled) {
            revert("expected authorization revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SeriesRegistry.Unauthorized.selector);
        }

        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.Settled);
        (, OptionsTypes.SeriesState state) = registry.getSeries(seriesId);
        require(state == OptionsTypes.SeriesState.Settled, "settlement state mismatch");
    }

    function testGuardianCanPauseAndSuspendButCannotResumeOrSettle() public {
        bytes32 seriesId = registry.createSeries(_callTerms());
        guardian.setState(registry, seriesId, OptionsTypes.SeriesState.Suspended);

        try guardian.setState(registry, seriesId, OptionsTypes.SeriesState.TradingClosed) {
            revert("expected transition authorization revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SeriesRegistry.Unauthorized.selector);
        }

        guardian.setGlobalPause(registry, true);
        _expectCreateRevert(_putTerms(), SeriesRegistry.GloballyPaused.selector);

        try guardian.setGlobalPause(registry, false) {
            revert("expected unpause authorization revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SeriesRegistry.Unauthorized.selector);
        }

        registry.setGlobalPause(false);
        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.ManualSettlementRequired);
        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.Settled);
    }

    function _callTerms() private view returns (OptionsTypes.SeriesTerms memory) {
        return OptionsTypes.SeriesTerms({
            underlying: FIPO,
            underlyingUid: UID,
            priceSource: FEED,
            kind: OptionsTypes.OptionKind.CappedCall,
            strikeUsd18: 100e18,
            capUsd18: 200e18,
            expiry: uint48(block.timestamp + 7 days),
            contractSize18: 1e18,
            corporateActionPolicyVersion: 1
        });
    }

    function _putTerms() private view returns (OptionsTypes.SeriesTerms memory terms) {
        terms = _callTerms();
        terms.kind = OptionsTypes.OptionKind.Put;
        terms.capUsd18 = 0;
    }

    function _expectCreateRevert(OptionsTypes.SeriesTerms memory terms, bytes4 selector) private {
        try registry.createSeries(terms) {
            revert("expected create revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, selector);
        }
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing selector");
        bytes4 actual;
        assembly {
            actual := mload(add(reason, 32))
        }
        require(actual == expected, "selector mismatch");
    }
}

contract RegistryCaller {
    function create(SeriesRegistry registry, OptionsTypes.SeriesTerms memory terms)
        external
        returns (bytes32)
    {
        return registry.createSeries(terms);
    }

    function setState(SeriesRegistry registry, bytes32 seriesId, OptionsTypes.SeriesState state)
        external
    {
        registry.setSeriesState(seriesId, state);
    }

    function setGlobalPause(SeriesRegistry registry, bool paused) external {
        registry.setGlobalPause(paused);
    }
}
