// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { FundingEngine } from "../src/perps/FundingEngine.sol";
import { InsuranceFund } from "../src/perps/InsuranceFund.sol";
import { LiquidationEngine } from "../src/perps/LiquidationEngine.sol";
import { MarginAccount } from "../src/perps/MarginAccount.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";
import { PerpsMarket } from "../src/perps/PerpsMarket.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsOracle } from "../src/perps/PerpsOracle.sol";
import { RiskEngine } from "../src/perps/RiskEngine.sol";
import { PerpsTypes } from "../src/perps/PerpsTypes.sol";

interface LiquidationVm {
    function warp(uint256 newTimestamp) external;
}

contract PerpsLiquidationTest {
    LiquidationVm private constant vm =
        LiquidationVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MARKET_ID = keccak256("SPCX-PERP");

    LiquidationUsd private usdg;
    LiquidationFeed private feed;
    PerpsMarketRegistry private registry;
    MarginAccount private margin;
    PerpsLiquidityVault private vault;
    InsuranceFund private insurance;
    PerpsMarket private market;
    RiskEngine private risk;
    LiquidationEngine private liquidation;
    LiquidationActor private trader;
    LiquidationActor private crossTrader;
    LiquidationActor private adlTrader;
    LiquidationActor private lp;
    LiquidationActor private funder;
    LiquidationKeeper private keeper;

    function setUp() public {
        vm.warp(10_000);
        usdg = new LiquidationUsd();
        feed = new LiquidationFeed();
        feed.setPrice(100e8, 10_000);

        registry = new PerpsMarketRegistry(address(this), address(0xA11CE));
        registry.createMarket(MARKET_ID, _config());
        registry.setMarketState(MARKET_ID, PerpsTypes.MarketState.Active);
        registry.setSessionState(MARKET_ID, PerpsTypes.SessionState.Regular);

        PerpsOracle oracle = new PerpsOracle(address(registry));
        margin = new MarginAccount(address(usdg), address(registry), address(this));
        vault = new PerpsLiquidityVault(address(usdg), address(this), address(0xA11CE), 1 days);
        vault.setOperationsPaused(false);
        insurance = new InsuranceFund(address(usdg), address(this));
        FundingEngine funding = new FundingEngine(address(this), address(registry));
        risk = new RiskEngine(address(this), address(margin), address(registry), address(oracle));
        market = new PerpsMarket(
            address(this),
            address(registry),
            address(oracle),
            address(funding),
            address(risk),
            address(margin),
            address(vault),
            address(this)
        );
        liquidation = new LiquidationEngine(
            address(this),
            address(market),
            address(margin),
            address(risk),
            address(insurance),
            address(vault)
        );

        funding.setPositionSource(address(market));
        funding.configureMarket(MARKET_ID, 1e14, 5e14);
        risk.setSources(address(market), address(funding));
        margin.setRiskEngine(address(risk));
        margin.setOperator(address(market), true);
        vault.setOperator(address(market), true);
        vault.setOperator(address(liquidation), true);
        insurance.setOperator(address(liquidation), true);
        market.setLiquidationEngine(address(liquidation));

        trader = new LiquidationActor();
        crossTrader = new LiquidationActor();
        adlTrader = new LiquidationActor();
        lp = new LiquidationActor();
        funder = new LiquidationActor();
        keeper = new LiquidationKeeper();
        liquidation.setKeeper(address(keeper), true);

        usdg.mint(address(trader), 30e6);
        usdg.mint(address(crossTrader), 30e6);
        usdg.mint(address(adlTrader), 30e6);
        usdg.mint(address(lp), 10_000e6);
        usdg.mint(address(funder), 100e6);
        trader.approve(usdg, address(margin), type(uint256).max);
        crossTrader.approve(usdg, address(margin), type(uint256).max);
        adlTrader.approve(usdg, address(margin), type(uint256).max);
        lp.approve(usdg, address(vault), type(uint256).max);
        funder.approve(usdg, address(insurance), type(uint256).max);
        trader.depositMargin(margin, 30e6);
        trader.addIsolatedMargin(margin, MARKET_ID, 25e6);
        crossTrader.depositMargin(margin, 30e6);
        crossTrader.setMarginMode(margin, MARKET_ID, PerpsTypes.MarginMode.Cross);
        crossTrader.addCrossMargin(margin, 25e6);
        adlTrader.depositMargin(margin, 30e6);
        adlTrader.addIsolatedMargin(margin, MARKET_ID, 25e6);
        lp.depositVault(vault, 10_000e6);
        funder.fundInsurance(insurance, 100e6);
    }

    function testFullIsolatedLiquidationCoversBadDebtFromInsurance() public {
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        uint256 freeBefore = margin.freeCollateral(address(trader));
        uint256 crossBefore = margin.crossCollateral(address(trader));
        uint256 insuranceBefore = usdg.balanceOf(address(insurance));
        uint256 vaultBefore = usdg.balanceOf(address(vault));

        feed.setPrice(60e8, 10_000);
        PerpsTypes.AccountHealth memory health = risk.isolatedHealth(address(trader), MARKET_ID);
        require(health.liquidatable, "position should be liquidatable");

        (uint256 closedSize18, uint256 badDebt6) =
            keeper.liquidate(liquidation, address(trader), MARKET_ID);

        require(closedSize18 == 1e18, "full size was not closed");
        require(badDebt6 != 0, "expected bad debt");
        require(market.getPosition(address(trader), MARKET_ID).size18 == 0, "position remains open");
        require(!margin.hasOpenPosition(address(trader), MARKET_ID), "active market remains");
        require(margin.isolatedMargin(address(trader), MARKET_ID) == 0, "margin not exhausted");
        require(margin.freeCollateral(address(trader)) == freeBefore, "free collateral changed");
        require(margin.crossCollateral(address(trader)) == crossBefore, "cross collateral changed");
        require(vault.recognizedBadDebt() == 0, "covered debt remains recognized");
        require(
            usdg.balanceOf(address(insurance)) == insuranceBefore - badDebt6, "insurance mismatch"
        );
        require(
            usdg.balanceOf(address(vault)) > vaultBefore + badDebt6,
            "seized margin and insurance were not received"
        );
        require(vault.reservedTraderLiability() == 0, "liability not released");
        require(
            usdg.balanceOf(address(margin)) == margin.totalAccountedCollateral(),
            "margin accounting diverged"
        );
    }

    function testFortyPercentUpsideGapLiquidatesUnsafeShort() public {
        trader.modifyPosition(market, MARKET_ID, -1e18, 99e18);
        feed.setPrice(140e8, 10_000);
        PerpsTypes.AccountHealth memory health = risk.isolatedHealth(address(trader), MARKET_ID);
        require(health.liquidatable, "40 percent upside gap must liquidate unsafe short");

        (uint256 closedSize18,) = keeper.liquidate(liquidation, address(trader), MARKET_ID);
        require(closedSize18 == 1e18, "gap liquidation did not close full short");
        require(market.getPosition(address(trader), MARKET_ID).size18 == 0, "short remains");
        require(vault.reservedTraderLiability() == 0, "short liability remains");
    }

    function testAdlIsBoundedToProfitableOppositePositionAfterInsurance() public {
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        adlTrader.modifyPosition(market, MARKET_ID, -1e18, 99e18);
        insurance.recover(address(this), usdg.balanceOf(address(insurance)));

        feed.setPrice(60e8, 10_000);
        (, uint256 badDebt6) = keeper.liquidate(liquidation, address(trader), MARKET_ID);
        uint256 pendingBefore = liquidation.pendingShortAdlDeficit6(MARKET_ID);
        require(badDebt6 != 0 && pendingBefore == badDebt6, "ADL deficit was not queued");
        uint256 recognizedBefore = vault.recognizedBadDebt();

        uint256 covered = keeper.executeAdl(
            liquidation, address(adlTrader), MARKET_ID, 25e16
        );

        require(covered != 0 && covered < pendingBefore, "invalid ADL coverage");
        require(
            liquidation.pendingShortAdlDeficit6(MARKET_ID) == pendingBefore - covered,
            "pending deficit mismatch"
        );
        require(
            vault.recognizedBadDebt() == recognizedBefore - covered,
            "LP bad debt was not reduced"
        );
        require(
            market.getPosition(address(adlTrader), MARKET_ID).size18 == -75e16,
            "ADL target size mismatch"
        );
        require(
            market.getPosition(address(adlTrader), MARKET_ID).realizedPnlUsd18 == 0,
            "foregone ADL profit must not be recorded as realized PnL"
        );

        try keeper.executeAdl(liquidation, address(adlTrader), MARKET_ID, 25e16) {
            revert("expected per-call ADL bound rejection");
        } catch (bytes memory reason) {
            _assertSelector(reason, LiquidationEngine.AdlCloseExceedsLimit.selector);
        }
    }

    function testRejectsHealthyPositionAndUnauthorizedKeeper() public {
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);

        try liquidation.liquidateIsolated(address(trader), MARKET_ID) {
            revert("expected unauthorized keeper rejection");
        } catch (bytes memory reason) {
            _assertSelector(reason, LiquidationEngine.Unauthorized.selector);
        }

        try keeper.liquidate(liquidation, address(trader), MARKET_ID) {
            revert("expected healthy-position rejection");
        } catch (bytes memory reason) {
            _assertSelector(reason, LiquidationEngine.AccountNotLiquidatable.selector);
        }
    }

    function testPartialLiquidationRestoresTwoPercentHealthBuffer() public {
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        feed.setPrice(83e8, 10_000);
        PerpsTypes.AccountHealth memory beforeHealth =
            risk.isolatedHealth(address(trader), MARKET_ID);
        require(beforeHealth.liquidatable, "position should require partial liquidation");
        require(beforeHealth.equityUsd18 > 0, "test must not use bad debt path");

        (uint256 closedSize18,) = keeper.liquidate(liquidation, address(trader), MARKET_ID);
        require(closedSize18 == 5e17, "expected half-size partial liquidation");
        PerpsTypes.AccountHealth memory afterHealth =
            risk.isolatedHealth(address(trader), MARKET_ID);
        require(!afterHealth.liquidatable, "partial liquidation did not restore health");
        require(
            uint256(afterHealth.equityUsd18) * 10_000
                >= afterHealth.maintenanceMarginUsd18 * 10_200,
            "post-liquidation buffer below two percent"
        );
    }

    function testCrossLiquidationClosesHighestRiskPosition() public {
        crossTrader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        uint256 freeBefore = margin.freeCollateral(address(crossTrader));
        uint256 isolatedBefore = margin.isolatedMargin(address(crossTrader), MARKET_ID);

        feed.setPrice(60e8, 10_000);
        require(
            risk.crossHealth(address(crossTrader)).liquidatable, "cross account should be unsafe"
        );

        (bytes32 selectedMarket, uint256 closedSize18, uint256 badDebt6) =
            keeper.liquidateCross(liquidation, address(crossTrader));

        require(selectedMarket == MARKET_ID, "wrong market selected");
        require(closedSize18 == 1e18, "full cross position was not closed");
        require(badDebt6 != 0, "expected cross bad debt");
        require(
            market.getPosition(address(crossTrader), MARKET_ID).size18 == 0,
            "cross position remains"
        );
        require(margin.crossCollateral(address(crossTrader)) == 0, "cross margin not exhausted");
        require(
            margin.freeCollateral(address(crossTrader)) == freeBefore, "free collateral changed"
        );
        require(
            margin.isolatedMargin(address(crossTrader), MARKET_ID) == isolatedBefore,
            "isolated collateral changed"
        );
        require(vault.recognizedBadDebt() == 0, "cross bad debt was not covered");
    }

    function testFuzzPartialAndFullLiquidationBoundaries(uint8 rawPrice) public {
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        uint256 price = uint256(rawPrice % 61 + 40);
        feed.setPrice(int256(price * 1e8), 10_000);
        PerpsTypes.AccountHealth memory beforeHealth =
            risk.isolatedHealth(address(trader), MARKET_ID);
        int256 originalSize = market.getPosition(address(trader), MARKET_ID).size18;

        if (!beforeHealth.liquidatable) {
            try keeper.liquidate(liquidation, address(trader), MARKET_ID) {
                revert("healthy boundary was liquidated");
            } catch (bytes memory reason) {
                _assertSelector(reason, LiquidationEngine.AccountNotLiquidatable.selector);
            }
            require(
                market.getPosition(address(trader), MARKET_ID).size18 == originalSize,
                "healthy rejection changed position"
            );
            _assertSystemSolvent();
            return;
        }

        bool expectFull = beforeHealth.equityUsd18 <= 0
            || uint256(beforeHealth.equityUsd18) * 2 < beforeHealth.maintenanceMarginUsd18;
        try keeper.liquidate(liquidation, address(trader), MARKET_ID) returns (
            uint256 closedSize18,
            uint256
        ) {
            if (expectFull) {
                require(closedSize18 == 1e18, "full boundary closed wrong size");
                require(
                    market.getPosition(address(trader), MARKET_ID).size18 == 0,
                    "full boundary left position"
                );
            } else {
                require(closedSize18 == 5e17, "partial boundary closed wrong size");
                PerpsTypes.AccountHealth memory afterHealth =
                    risk.isolatedHealth(address(trader), MARKET_ID);
                require(!afterHealth.liquidatable, "partial boundary remains liquidatable");
                require(
                    uint256(afterHealth.equityUsd18) * 10_000
                        >= afterHealth.maintenanceMarginUsd18 * 10_200,
                    "partial boundary missed buffer"
                );
            }
        } catch (bytes memory reason) {
            require(!expectFull, "full liquidation unexpectedly reverted");
            _assertSelector(reason, LiquidationEngine.PostLiquidationBufferNotMet.selector);
            require(
                market.getPosition(address(trader), MARKET_ID).size18 == originalSize,
                "failed partial liquidation did not roll back"
            );
        }
        _assertSystemSolvent();
    }

    function _assertSystemSolvent() private view {
        require(
            usdg.balanceOf(address(margin)) == margin.totalAccountedCollateral(),
            "margin custody is not fully accounted"
        );
        require(
            vault.reservedTraderLiability() + vault.payableWithdrawalAssets()
                + vault.recognizedBadDebt() <= usdg.balanceOf(address(vault)),
            "vault cannot cover recorded claims"
        );
        require(
            usdg.balanceOf(address(trader)) + usdg.balanceOf(address(crossTrader))
                + usdg.balanceOf(address(adlTrader)) + usdg.balanceOf(address(lp))
                + usdg.balanceOf(address(funder))
                + usdg.balanceOf(address(keeper)) + usdg.balanceOf(address(margin))
                + usdg.balanceOf(address(vault)) + usdg.balanceOf(address(insurance))
                + usdg.balanceOf(address(this)) == usdg.totalSupply(),
            "system USDG conservation failed"
        );
    }

    function _config() private view returns (PerpsTypes.MarketConfig memory) {
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

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing selector");
        bytes4 actual;
        assembly {
            actual := mload(add(reason, 32))
        }
        require(actual == expected, "selector mismatch");
    }
}

contract LiquidationActor {
    function approve(ERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function depositMargin(MarginAccount account, uint256 assets) external {
        account.deposit(assets);
    }

    function addIsolatedMargin(MarginAccount account, bytes32 marketId, uint256 assets) external {
        account.addIsolatedMargin(marketId, assets);
    }

    function setMarginMode(MarginAccount account, bytes32 marketId, PerpsTypes.MarginMode mode)
        external
    {
        account.setMarginMode(marketId, mode);
    }

    function addCrossMargin(MarginAccount account, uint256 assets) external {
        account.addCrossCollateral(assets);
    }

    function depositVault(PerpsLiquidityVault vault, uint256 assets) external {
        vault.deposit(assets, address(this));
    }

    function fundInsurance(InsuranceFund fund, uint256 assets) external {
        fund.fund(assets);
    }

    function modifyPosition(
        PerpsMarket perpsMarket,
        bytes32 marketId,
        int256 sizeDelta18,
        uint256 acceptablePriceUsd18
    ) external returns (uint256) {
        return perpsMarket.modifyPosition(marketId, sizeDelta18, acceptablePriceUsd18);
    }
}

contract LiquidationKeeper {
    function liquidate(LiquidationEngine engine, address account, bytes32 marketId)
        external
        returns (uint256 closedSize18, uint256 badDebt6)
    {
        return engine.liquidateIsolated(account, marketId);
    }

    function liquidateCross(LiquidationEngine engine, address account)
        external
        returns (bytes32 marketId, uint256 closedSize18, uint256 badDebt6)
    {
        return engine.liquidateCross(account);
    }

    function executeAdl(
        LiquidationEngine engine,
        address account,
        bytes32 marketId,
        uint256 closeSize18
    ) external returns (uint256 coveredDeficit6) {
        return engine.executeAdl(account, marketId, closeSize18);
    }
}

contract LiquidationUsd is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract LiquidationFeed {
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
