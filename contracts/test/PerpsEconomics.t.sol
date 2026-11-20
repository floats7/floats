// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { FundingEngine } from "../src/perps/FundingEngine.sol";
import { InsuranceFund } from "../src/perps/InsuranceFund.sol";
import { MarginAccount } from "../src/perps/MarginAccount.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsOracle } from "../src/perps/PerpsOracle.sol";
import { RiskEngine } from "../src/perps/RiskEngine.sol";
import { IPerpsPositionSource } from "../src/perps/interfaces/IPerpsPositionSource.sol";
import { PerpsTypes } from "../src/perps/PerpsTypes.sol";

interface EconomicsVm {
    function warp(uint256 newTimestamp) external;
}

contract PerpsEconomicsTest {
    EconomicsVm private constant vm =
        EconomicsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MARKET_ID = keccak256("SPCX-PERP");
    address private constant TRADER = address(0xBEEF);

    EconomicsUsd private usdg;
    EconomicsFeed private feed;
    PerpsMarketRegistry private registry;
    PerpsOracle private oracle;
    EconomicsPositionSource private positions;
    FundingEngine private funding;
    MarginAccount private margin;
    RiskEngine private risk;
    PerpsLiquidityVault private vault;
    EconomicsVaultActor private lp;
    InsuranceFund private insurance;

    function setUp() public {
        vm.warp(10_000);
        usdg = new EconomicsUsd();
        feed = new EconomicsFeed();
        feed.setPrice(100e8, 10_000);
        registry = new PerpsMarketRegistry(address(this), address(0xA11CE));
        registry.createMarket(MARKET_ID, _marketConfig());
        oracle = new PerpsOracle(address(registry));
        positions = new EconomicsPositionSource();
        funding = new FundingEngine(address(this), address(registry));
        funding.setPositionSource(address(positions));
        funding.configureMarket(MARKET_ID, 1e14, 5e14);
        margin = new MarginAccount(address(usdg), address(registry), address(this));
        risk = new RiskEngine(address(this), address(margin), address(registry), address(oracle));
        risk.setSources(address(positions), address(funding));
        margin.setRiskEngine(address(risk));

        vault = new PerpsLiquidityVault(address(usdg), address(this), address(0xA11CE), 1 days);
        vault.setOperationsPaused(false);
        vault.setOperator(address(this), true);
        lp = new EconomicsVaultActor();
        usdg.mint(address(lp), 1000e6);
        lp.approve(usdg, address(vault), type(uint256).max);

        insurance = new InsuranceFund(address(usdg), address(this));
        insurance.setOperator(address(this), true);
    }

    function testFundingTracksSkewAndContinuesWithoutSessionDependency() public {
        positions.setOpenInterest(MARKET_ID, 150e18, 50e18);
        vm.warp(13_600);
        int256 index = funding.updateFunding(MARKET_ID);
        require(index == 5e13, "positive skew funding mismatch");

        positions.setOpenInterest(MARKET_ID, 50e18, 150e18);
        vm.warp(17_200);
        index = funding.updateFunding(MARKET_ID);
        require(index == 0, "negative skew should reverse funding");
    }

    function testRiskSeparatesCrossAndIsolatedHealth() public {
        positions.setPosition(
            TRADER,
            MARKET_ID,
            PerpsTypes.Position({
                size18: 1e18,
                entryPriceUsd18: 100e18,
                lastFundingIndex18: 0,
                realizedPnlUsd18: 0,
                pendingFeesUsd18: 0
            })
        );
        positions.setOpenInterest(MARKET_ID, 1e18, 1e18);
        margin.setOperator(address(this), true);
        margin.setPositionOpen(TRADER, MARKET_ID, true);

        usdg.mint(TRADER, 50e6);
        EconomicsMarginActor trader = new EconomicsMarginActor();
        usdg.mint(address(trader), 50e6);
        trader.approve(usdg, address(margin), type(uint256).max);
        trader.deposit(margin, 50e6);
        trader.addIsolatedMargin(margin, MARKET_ID, 50e6);

        positions.movePosition(TRADER, address(trader), MARKET_ID);
        margin.setPositionOpen(TRADER, MARKET_ID, false);
        margin.setPositionOpen(address(trader), MARKET_ID, true);
        feed.setPrice(110e8, 10_000);

        PerpsTypes.AccountHealth memory isolated = risk.isolatedHealth(address(trader), MARKET_ID);
        require(isolated.equityUsd18 == 60e18, "isolated equity mismatch");
        require(isolated.initialMarginUsd18 == 22e18, "initial margin mismatch");
        require(isolated.maintenanceMarginUsd18 == 11e18, "maintenance mismatch");
        require(!isolated.liquidatable, "healthy isolated position");
        uint256 liquidationPrice = risk.isolatedLiquidationPrice(address(trader), MARKET_ID);
        require(liquidationPrice > 55e18 && liquidationPrice < 56e18, "liquidation price mismatch");

        PerpsTypes.AccountHealth memory cross = risk.crossHealth(address(trader));
        require(cross.equityUsd18 == 0, "isolated position leaked into cross equity");
        require(cross.initialMarginUsd18 == 0, "isolated position leaked into cross margin");
    }

    function testVaultReservesLiabilityAndCompletesDatedWithdrawal() public {
        uint256 shares = lp.deposit(vault, 1000e6);
        require(shares == 1000e6, "initial shares mismatch");
        vault.reserveLiability(200e6);
        require(vault.reservedTraderLiability() == 200e6, "reserve mismatch");
        require(vault.availableLiquidity() == 800e6, "available liquidity mismatch");

        vault.releaseLiability(200e6);
        uint256 requestId = lp.requestWithdrawal(vault, 250e6);
        vm.warp(block.timestamp + 1 days);
        vault.processWithdrawal(requestId);
        vault.claimWithdrawal(requestId);
        require(usdg.balanceOf(address(lp)) == 250e6, "claimed assets mismatch");
        require(vault.totalAssets() == 750e6, "remaining LP equity mismatch");
    }

    function testInsurancePaysBadDebtBeforeLpVault() public {
        usdg.mint(address(this), 100e6);
        usdg.approve(address(insurance), 100e6);
        insurance.fund(100e6);
        insurance.coverBadDebt(address(vault), 40e6);
        require(usdg.balanceOf(address(insurance)) == 60e6, "insurance balance mismatch");
        require(usdg.balanceOf(address(vault)) == 40e6, "vault recovery mismatch");
    }

    function testLiquidityVaultDeploysPaused() public {
        PerpsLiquidityVault fresh =
            new PerpsLiquidityVault(address(usdg), address(this), address(0xA11CE), 1 days);
        require(fresh.operationsPaused(), "fresh vault must be paused");
        require(fresh.maxDeposit(address(lp)) == 0, "paused vault exposed deposits");
    }

    function testFuzzSignedPnlFundingFeesLeverageAndRounding(
        uint96 rawSize,
        uint16 rawEntry,
        uint16 rawMark,
        uint64 rawFunding,
        uint64 rawPendingFee
    ) public {
        uint256 magnitude = (uint256(rawSize) % 1000e18) + 1;
        int256 size = rawSize & 1 == 0 ? int256(magnitude) : -int256(magnitude);
        uint256 entry = (uint256(rawEntry) % 10_000 + 1) * 1e18;
        uint256 mark = (uint256(rawMark) % 10_000 + 1) * 1e18;
        int256 lastFundingIndex = int256(uint256(rawFunding) % 2e16) - 1e16;
        uint256 pendingFee = uint256(rawPendingFee) % 100e18;

        positions.setPosition(
            TRADER,
            MARKET_ID,
            PerpsTypes.Position({
                size18: size,
                entryPriceUsd18: entry,
                lastFundingIndex18: lastFundingIndex,
                realizedPnlUsd18: 0,
                pendingFeesUsd18: pendingFee
            })
        );
        feed.setPrice(int256(mark / 1e10), 10_000);

        (
            int256 pnl,
            int256 fundingOwed,
            uint256 notional,
            uint256 initialMargin,
            uint256 maintenanceMargin
        ) = risk.positionMetrics(TRADER, MARKET_ID);
        int256 expectedPnl = size * (int256(mark) - int256(entry)) / 1e18;
        int256 expectedFunding = size * (0 - lastFundingIndex) / 1e18;
        uint256 expectedNotional = magnitude * mark / 1e18;
        require(pnl == expectedPnl, "signed PnL rounding mismatch");
        require(fundingOwed == expectedFunding, "signed funding rounding mismatch");
        require(notional == expectedNotional, "notional mismatch");
        require(initialMargin == _mulDivUp(expectedNotional, 2000, 10_000), "initial margin rounding mismatch");
        require(maintenanceMargin == _mulDivUp(expectedNotional, 1000, 10_000), "maintenance rounding mismatch");

        PerpsTypes.AccountHealth memory health = risk.isolatedHealth(TRADER, MARKET_ID);
        require(
            health.equityUsd18 == expectedPnl - expectedFunding - int256(pendingFee),
            "fee-adjusted equity mismatch"
        );
    }

    function _mulDivUp(uint256 value, uint256 numerator, uint256 denominator)
        private
        pure
        returns (uint256)
    {
        if (value == 0 || numerator == 0) return 0;
        return (value * numerator + denominator - 1) / denominator;
    }

    function _marketConfig() private view returns (PerpsTypes.MarketConfig memory) {
        return PerpsTypes.MarketConfig({
            underlying: address(0x5AC),
            underlyingUid: keccak256("SPCX"),
            symbol: bytes32("SPCX-PERP"),
            priceFeed: address(feed),
            maxLeverageBps: 50_000,
            initialMarginBps: 2000,
            maintenanceMarginBps: 1000,
            openInterestCapBps: 800,
            baseSpreadBps: 20,
            tradingFeeBps: 6,
            extendedSpreadMultiplierBps: 20_000,
            extendedLeverageDivisorBps: 20_000,
            maxPriceAge: 1 days,
            isolatedOnly: false
        });
    }
}

contract EconomicsUsd is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract EconomicsFeed {
    int256 private _answer;
    uint256 private _updatedAt;

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function setPrice(int256 answer, uint256 updatedAt) external {
        _answer = answer;
        _updatedAt = updatedAt;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }
}

contract EconomicsPositionSource is IPerpsPositionSource {
    mapping(address => mapping(bytes32 => PerpsTypes.Position)) private _positions;
    mapping(bytes32 => uint256) private _longOi;
    mapping(bytes32 => uint256) private _shortOi;

    function setPosition(address account, bytes32 marketId, PerpsTypes.Position memory position)
        external
    {
        _positions[account][marketId] = position;
    }

    function movePosition(address from, address to, bytes32 marketId) external {
        _positions[to][marketId] = _positions[from][marketId];
        delete _positions[from][marketId];
    }

    function setOpenInterest(bytes32 marketId, uint256 longOi, uint256 shortOi) external {
        _longOi[marketId] = longOi;
        _shortOi[marketId] = shortOi;
    }

    function getPosition(address account, bytes32 marketId)
        external
        view
        returns (PerpsTypes.Position memory position)
    {
        return _positions[account][marketId];
    }

    function openInterest(bytes32 marketId) external view returns (uint256, uint256) {
        return (_longOi[marketId], _shortOi[marketId]);
    }
}

contract EconomicsVaultActor {
    function approve(ERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function deposit(PerpsLiquidityVault vault, uint256 assets) external returns (uint256) {
        return vault.deposit(assets, address(this));
    }

    function requestWithdrawal(PerpsLiquidityVault vault, uint256 shares)
        external
        returns (uint256)
    {
        return vault.requestWithdrawal(shares, address(this));
    }
}

contract EconomicsMarginActor {
    function approve(ERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function deposit(MarginAccount account, uint256 assets) external {
        account.deposit(assets);
    }

    function addIsolatedMargin(MarginAccount account, bytes32 marketId, uint256 assets) external {
        account.addIsolatedMargin(marketId, assets);
    }
}
