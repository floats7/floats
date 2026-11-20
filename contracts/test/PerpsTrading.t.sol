// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { FundingEngine } from "../src/perps/FundingEngine.sol";
import { MarginAccount } from "../src/perps/MarginAccount.sol";
import { PerpsLiquidityVault } from "../src/perps/PerpsLiquidityVault.sol";
import { PerpsMarket } from "../src/perps/PerpsMarket.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsOracle } from "../src/perps/PerpsOracle.sol";
import { RiskEngine } from "../src/perps/RiskEngine.sol";
import { PerpsTypes } from "../src/perps/PerpsTypes.sol";

interface TradingVm {
    function warp(uint256 newTimestamp) external;
}

contract PerpsTradingTest {
    TradingVm private constant vm =
        TradingVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MARKET_ID = keccak256("SPCX-PERP");

    TradingUsd private usdg;
    TradingFeed private feed;
    PerpsMarketRegistry private registry;
    MarginAccount private margin;
    PerpsLiquidityVault private vault;
    FundingEngine private funding;
    RiskEngine private risk;
    PerpsMarket private market;
    TradingActor private trader;
    TradingActor private lp;

    function setUp() public {
        vm.warp(10_000);
        usdg = new TradingUsd();
        feed = new TradingFeed();
        feed.setPrice(100e8, 10_000);
        registry = new PerpsMarketRegistry(address(this), address(0xA11CE));
        registry.createMarket(MARKET_ID, _config());
        registry.setMarketState(MARKET_ID, PerpsTypes.MarketState.Active);
        registry.setSessionState(MARKET_ID, PerpsTypes.SessionState.Regular);
        PerpsOracle oracle = new PerpsOracle(address(registry));
        margin = new MarginAccount(address(usdg), address(registry), address(this));
        vault = new PerpsLiquidityVault(address(usdg), address(this), address(0xA11CE), 1 days);
        vault.setOperationsPaused(false);
        funding = new FundingEngine(address(this), address(registry));
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
        funding.setPositionSource(address(market));
        funding.configureMarket(MARKET_ID, 1e14, 5e14);
        risk.setSources(address(market), address(funding));
        margin.setRiskEngine(address(risk));
        margin.setOperator(address(market), true);
        vault.setOperator(address(market), true);

        trader = new TradingActor();
        lp = new TradingActor();
        usdg.mint(address(trader), 1000e6);
        usdg.mint(address(lp), 10_000e6);
        trader.approve(usdg, address(margin), type(uint256).max);
        lp.approve(usdg, address(vault), type(uint256).max);
        trader.depositMargin(margin, 1000e6);
        trader.addIsolatedMargin(margin, MARKET_ID, 500e6);
        lp.depositVault(vault, 10_000e6);
    }

    function testOpensAndClosesIsolatedLongWithRealSettlement() public {
        uint256 entry = trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        require(entry > 100e18 && entry <= 101e18, "entry spread mismatch");
        PerpsTypes.Position memory opened = market.getPosition(address(trader), MARKET_ID);
        require(opened.size18 == 1e18, "position not opened");
        require(margin.hasOpenPosition(address(trader), MARKET_ID), "active market missing");
        require(vault.reservedTraderLiability() != 0, "liability not reserved");

        uint256 collateralAfterOpen = margin.isolatedMargin(address(trader), MARKET_ID);
        require(collateralAfterOpen < 500e6, "open fee was not paid");

        feed.setPrice(110e8, 10_000);
        uint256 exit = trader.modifyPosition(market, MARKET_ID, -1e18, 109e18);
        require(exit >= 109e18 && exit <= 110e18, "exit spread mismatch");
        PerpsTypes.Position memory closed = market.getPosition(address(trader), MARKET_ID);
        require(closed.size18 == 0, "position not closed");
        require(!margin.hasOpenPosition(address(trader), MARKET_ID), "active market not removed");
        require(vault.reservedTraderLiability() == 0, "liability not released");
        require(
            margin.isolatedMargin(address(trader), MARKET_ID) > collateralAfterOpen,
            "realized profit not credited"
        );
        require(
            usdg.balanceOf(address(margin)) == margin.totalAccountedCollateral(),
            "physical and accounted collateral diverged"
        );
    }

    function testTradingFeeRoutesOnceToLpAndProtocol() public {
        uint256 vaultBefore = usdg.balanceOf(address(vault));
        uint256 protocolBefore = usdg.balanceOf(address(this));
        PerpsMarket.TradePreview memory preview =
            market.previewPositionChange(address(trader), MARKET_ID, 1e18);

        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);

        uint256 lpFee = preview.feeUsd6 * 7000 / 10_000;
        uint256 protocolFee = preview.feeUsd6 - lpFee;
        require(usdg.balanceOf(address(vault)) - vaultBefore == lpFee, "LP fee mismatch");
        require(
            usdg.balanceOf(address(this)) - protocolBefore == protocolFee, "protocol fee mismatch"
        );
        require(lpFee + protocolFee == preview.feeUsd6, "fee value duplicated");
    }

    function testClosedSessionAllowsReduceButBlocksIncrease() public {
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        registry.setSessionState(MARKET_ID, PerpsTypes.SessionState.Closed);

        try trader.modifyPosition(market, MARKET_ID, 1e17, 101e18) {
            revert("expected closed-session increase rejection");
        } catch (bytes memory reason) {
            _assertSelector(reason, PerpsMarket.MarketNotActive.selector);
        }

        trader.modifyPosition(market, MARKET_ID, -5e17, 99e18);
        PerpsTypes.Position memory reduced = market.getPosition(address(trader), MARKET_ID);
        require(reduced.size18 == 5e17, "reduce-only path failed");
    }

    function testRejectsUnsafeLeverageAndPositionFlip() public {
        try trader.modifyPosition(market, MARKET_ID, 30e18, 101e18) {
            revert("expected unsafe leverage rejection");
        } catch (bytes memory reason) {
            bytes4 selector = _selector(reason);
            require(
                selector == PerpsMarket.UnsafeAccount.selector
                    || selector == PerpsMarket.ExposureLimitExceeded.selector,
                "unexpected leverage selector"
            );
        }

        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        try trader.modifyPosition(market, MARKET_ID, -2e18, 99e18) {
            revert("expected flip rejection");
        } catch (bytes memory reason) {
            _assertSelector(reason, PerpsMarket.PositionFlipNotAllowed.selector);
        }
    }

    function testPreviewsExecutionRiskBeforePositionSubmission() public view {
        PerpsMarket.TradePreview memory preview =
            market.previewPositionChange(address(trader), MARKET_ID, 1e18);
        require(preview.markPriceUsd18 == 100e18, "mark price mismatch");
        require(preview.executionPriceUsd18 > preview.markPriceUsd18, "long spread missing");
        require(preview.spreadBps != 0, "spread missing");
        require(preview.feeUsd6 != 0, "fee missing");
        require(preview.resultingNotionalUsd18 != 0, "notional missing");
        require(preview.requiredInitialMarginUsd18 != 0, "initial margin missing");
        require(preview.liquidationPriceUsd18 < preview.markPriceUsd18, "liquidation risk missing");
        require(preview.resultingSize18 == 1e18, "resulting size mismatch");
    }

    function testFuzzRoundTripPreservesSystemValue(uint16 rawExitPrice) public {
        uint256 supplyBefore = usdg.totalSupply();
        trader.modifyPosition(market, MARKET_ID, 1e18, 101e18);
        uint256 exitPrice = uint256(rawExitPrice % 11 + 95);
        feed.setPrice(int256(exitPrice * 1e8), 10_000);
        trader.modifyPosition(market, MARKET_ID, -1e18, exitPrice * 99e16 / 1e18);

        require(usdg.totalSupply() == supplyBefore, "round trip created token supply");
        require(
            usdg.balanceOf(address(trader)) + usdg.balanceOf(address(lp))
                + usdg.balanceOf(address(margin)) + usdg.balanceOf(address(vault))
                + usdg.balanceOf(address(this)) == supplyBefore,
            "system balances do not conserve USDG"
        );
        require(
            usdg.balanceOf(address(margin)) == margin.totalAccountedCollateral(),
            "margin assets diverged from accounting"
        );
        require(
            vault.reservedTraderLiability() + vault.payableWithdrawalAssets()
                + vault.recognizedBadDebt() <= usdg.balanceOf(address(vault)),
            "vault liabilities exceed managed assets"
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
        require(_selector(reason) == expected, "selector mismatch");
    }

    function _selector(bytes memory reason) private pure returns (bytes4 actual) {
        require(reason.length >= 4, "missing selector");
        assembly {
            actual := mload(add(reason, 32))
        }
    }
}

contract TradingActor {
    function approve(ERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function depositMargin(MarginAccount account, uint256 assets) external {
        account.deposit(assets);
    }

    function addIsolatedMargin(MarginAccount account, bytes32 marketId, uint256 assets) external {
        account.addIsolatedMargin(marketId, assets);
    }

    function depositVault(PerpsLiquidityVault vault, uint256 assets) external {
        vault.deposit(assets, address(this));
    }

    function modifyPosition(
        PerpsMarket market,
        bytes32 marketId,
        int256 sizeDelta18,
        uint256 acceptablePriceUsd18
    ) external returns (uint256) {
        return market.modifyPosition(marketId, sizeDelta18, acceptablePriceUsd18);
    }
}

contract TradingUsd is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract TradingFeed {
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
