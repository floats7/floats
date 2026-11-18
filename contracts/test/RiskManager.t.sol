// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { RiskManager } from "../src/options/RiskManager.sol";

contract RiskManagerTest {
    address private constant UNDERLYING = address(0xF1F0);
    bytes32 private constant SERIES_ID = keccak256("fIPO-CALL-100");
    uint48 private constant EXPIRY = 1_800_000_000;

    RiskRegistryMock private registry;
    RiskVaultMock private vault;
    RiskManager private riskManager;

    function setUp() public {
        registry = new RiskRegistryMock();
        vault = new RiskVaultMock();
        registry.setSeries(SERIES_ID, _terms(), OptionsTypes.SeriesState.Active);
        vault.setAccounting(900e6, 100e6);
        riskManager = new RiskManager(address(this), address(registry), address(vault), _limits());
        riskManager.setMarket(address(this));
        riskManager.setSettlementEngine(address(this));
    }

    function testOpenAndCloseTrackEveryExposureBucket() public {
        riskManager.recordOpen(SERIES_ID, 100e6);

        require(riskManager.seriesExposure6(SERIES_ID) == 100e6, "series exposure mismatch");
        require(
            riskManager.underlyingExposure6(UNDERLYING) == 100e6, "underlying exposure mismatch"
        );
        require(riskManager.expiryExposure6(EXPIRY) == 100e6, "expiry exposure mismatch");

        riskManager.recordClose(SERIES_ID, 40e6);
        require(riskManager.seriesExposure6(SERIES_ID) == 60e6, "series close mismatch");
        require(riskManager.underlyingExposure6(UNDERLYING) == 60e6, "underlying close mismatch");
        require(riskManager.expiryExposure6(EXPIRY) == 60e6, "expiry close mismatch");
    }

    function testOpenRevertsAtomicallyWhenSeriesLimitIsExceeded() public {
        vault.setAccounting(899e6, 101e6);
        (bool success,) =
            address(riskManager).call(abi.encodeCall(RiskManager.recordOpen, (SERIES_ID, 101e6)));

        require(!success, "risk limit accepted");
        require(riskManager.seriesExposure6(SERIES_ID) == 0, "failed trade changed series");
        require(riskManager.underlyingExposure6(UNDERLYING) == 0, "failed trade changed underlying");
        require(riskManager.expiryExposure6(EXPIRY) == 0, "failed trade changed expiry");
    }

    function testSettlementClearsExposureAndUnauthorizedCallerIsRejected() public {
        riskManager.recordOpen(SERIES_ID, 100e6);
        riskManager.recordSettlement(SERIES_ID, 100e6);
        require(riskManager.seriesExposure6(SERIES_ID) == 0, "settled exposure remains");

        RiskCaller caller = new RiskCaller();
        (bool success,) = caller.recordSettlement(riskManager, SERIES_ID, 1);
        require(!success, "unauthorized settlement accepted");
    }

    function testGovernanceCannotRaiseLimitsAboveHardCaps() public {
        RiskManager.Limits memory invalid = _limits();
        invalid.utilizationBps = riskManager.MAX_UTILIZATION_BPS() + 1;
        (bool success,) =
            address(riskManager).call(abi.encodeCall(RiskManager.setLimits, (invalid)));
        require(!success, "hard cap bypassed");
    }

    function _limits() private pure returns (RiskManager.Limits memory) {
        return RiskManager.Limits({
            utilizationBps: 8000, underlyingBps: 2500, expiryBps: 4000, seriesBps: 1000
        });
    }

    function _terms() private pure returns (OptionsTypes.SeriesTerms memory) {
        return OptionsTypes.SeriesTerms({
            underlying: UNDERLYING,
            underlyingUid: keccak256("fIPO"),
            priceSource: address(0xBEEF),
            kind: OptionsTypes.OptionKind.CappedCall,
            strikeUsd18: 100e18,
            capUsd18: 200e18,
            expiry: EXPIRY,
            contractSize18: 1e18,
            corporateActionPolicyVersion: 1
        });
    }
}

contract RiskRegistryMock {
    mapping(bytes32 seriesId => OptionsTypes.SeriesTerms terms) private termsById;
    mapping(bytes32 seriesId => OptionsTypes.SeriesState state) private stateById;

    function setSeries(
        bytes32 seriesId,
        OptionsTypes.SeriesTerms calldata terms,
        OptionsTypes.SeriesState state
    ) external {
        termsById[seriesId] = terms;
        stateById[seriesId] = state;
    }

    function getSeries(bytes32 seriesId)
        external
        view
        returns (OptionsTypes.SeriesTerms memory, OptionsTypes.SeriesState)
    {
        return (termsById[seriesId], stateById[seriesId]);
    }
}

contract RiskVaultMock {
    uint256 public totalAssets;
    uint256 public reservedCollateral;

    function setAccounting(uint256 totalAssets_, uint256 reservedCollateral_) external {
        totalAssets = totalAssets_;
        reservedCollateral = reservedCollateral_;
    }
}

contract RiskCaller {
    function recordSettlement(RiskManager riskManager, bytes32 seriesId, uint256 liability6)
        external
        returns (bool, bytes memory)
    {
        return address(riskManager)
            .call(abi.encodeCall(RiskManager.recordSettlement, (seriesId, liability6)));
    }
}
