// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MarginAccount } from "../src/perps/MarginAccount.sol";
import { PerpsMarketRegistry } from "../src/perps/PerpsMarketRegistry.sol";
import { PerpsOracle } from "../src/perps/PerpsOracle.sol";
import { IRiskEngine } from "../src/perps/interfaces/IRiskEngine.sol";
import { PerpsTypes } from "../src/perps/PerpsTypes.sol";

interface PerpsVm {
    function warp(uint256 newTimestamp) external;
}

contract PerpsFoundationTest {
    PerpsVm private constant vm = PerpsVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant MARKET_ID = keccak256("ANT-PERP");
    bytes32 private constant ANT_UID = keccak256("ANT");

    PerpsMarketRegistry private registry;
    PerpsRegistryActor private guardian;
    PerpsRegistryActor private keeper;
    PerpsMockFeed private feed;
    PerpsOracle private oracle;
    PerpsMockUsd private usdg;
    PerpsMockRiskEngine private riskEngine;
    MarginAccount private marginAccount;
    PerpsAccountActor private trader;

    function setUp() public {
        vm.warp(10_000);
        guardian = new PerpsRegistryActor();
        keeper = new PerpsRegistryActor();
        feed = new PerpsMockFeed(8);
        feed.setRound(1, 10_000_000_000, 9950, 1);

        registry = new PerpsMarketRegistry(address(this), address(guardian));
        registry.createMarket(MARKET_ID, _antConfig());
        registry.setKeeper(address(keeper), true);
        oracle = new PerpsOracle(address(registry));

        usdg = new PerpsMockUsd();
        riskEngine = new PerpsMockRiskEngine();
        marginAccount = new MarginAccount(address(usdg), address(registry), address(this));
        marginAccount.setRiskEngine(address(riskEngine));
        marginAccount.setOperator(address(this), true);
        trader = new PerpsAccountActor();
        usdg.mint(address(trader), 1000e6);
        trader.approve(usdg, address(marginAccount), type(uint256).max);
    }

    function testCreatesDisabledIsolatedOnlyAntMarket() public view {
        (
            PerpsTypes.MarketConfig memory config,
            PerpsTypes.MarketState state,
            PerpsTypes.SessionState session
        ) = registry.getMarket(MARKET_ID);

        require(config.underlyingUid == ANT_UID, "ANT UID mismatch");
        require(config.maxLeverageBps == 20_000, "ANT leverage mismatch");
        require(config.initialMarginBps == 5000, "ANT initial margin mismatch");
        require(config.maintenanceMarginBps == 2500, "ANT maintenance mismatch");
        require(config.openInterestCapBps == 400, "ANT OI cap mismatch");
        require(config.isolatedOnly, "ANT must be isolated only");
        require(state == PerpsTypes.MarketState.Disabled, "market must start disabled");
        require(session == PerpsTypes.SessionState.Closed, "session must start closed");
    }

    function testGuardianCanReduceRiskButCannotActivateMarket() public {
        guardian.setMarketState(registry, MARKET_ID, PerpsTypes.MarketState.ReduceOnly);
        require(
            registry.marketState(MARKET_ID) == PerpsTypes.MarketState.ReduceOnly,
            "guardian reduce-only failed"
        );

        _expectActorMarketStateRevert(
            guardian, PerpsTypes.MarketState.Active, PerpsMarketRegistry.Unauthorized.selector
        );
        registry.setMarketState(MARKET_ID, PerpsTypes.MarketState.Active);
        require(
            registry.marketState(MARKET_ID) == PerpsTypes.MarketState.Active,
            "admin activation failed"
        );
    }

    function testKeeperCanUpdateSessionAndReduceRisk() public {
        keeper.setSessionState(registry, MARKET_ID, PerpsTypes.SessionState.Regular);
        require(
            registry.sessionState(MARKET_ID) == PerpsTypes.SessionState.Regular,
            "keeper session failed"
        );
        keeper.setMarketState(registry, MARKET_ID, PerpsTypes.MarketState.ReduceOnly);
    }

    function testRejectsUnsafeMarketParameters() public {
        PerpsTypes.MarketConfig memory config = _antConfig();
        config.maxLeverageBps = 100_001;
        _expectCreateRevert(keccak256("INVALID-1"), config);

        config = _antConfig();
        config.maintenanceMarginBps = 499;
        _expectCreateRevert(keccak256("INVALID-2"), config);

        config = _antConfig();
        config.initialMarginBps = 4999;
        _expectCreateRevert(keccak256("INVALID-3"), config);
    }

    function testNormalizesOfficialPriceAndRejectsStaleRound() public {
        PerpsOracle.Price memory price = oracle.getPrice(MARKET_ID);
        require(price.markPriceUsd18 == 100e18, "normalized price mismatch");
        require(price.updatedAt == 9950, "price timestamp mismatch");

        feed.setRound(2, 10_000_000_000, 9800, 2);
        try oracle.getPrice(MARKET_ID) {
            revert("expected stale price revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, PerpsOracle.PriceStale.selector);
        }
    }

    function testRejectsInvalidAndIncompleteOfficialOracleRounds() public {
        feed.setRound(2, -1, 9999, 2);
        _expectOracleInvalidPrice();

        feed.setRound(3, 100e8, 9999, 2);
        _expectOracleInvalidPrice();

        feed.setRound(4, 100e8, 10_001, 4);
        _expectOracleInvalidPrice();

        feed.setRound(5, 100e8, 0, 5);
        _expectOracleInvalidPrice();
    }

    function _expectOracleInvalidPrice() private view {
        try oracle.getPrice(MARKET_ID) {
            revert("expected invalid oracle round rejection");
        } catch (bytes memory reason) {
            _assertSelector(reason, PerpsOracle.InvalidPrice.selector);
        }
    }

    function testDefaultsToIsolatedAndSeparatesCollateralBuckets() public {
        trader.deposit(marginAccount, 1000e6);
        require(marginAccount.freeCollateral(address(trader)) == 1000e6, "free collateral");
        require(
            marginAccount.marginMode(address(trader), MARKET_ID) == PerpsTypes.MarginMode.Isolated,
            "default must be isolated"
        );

        trader.addIsolatedMargin(marginAccount, MARKET_ID, 400e6);
        require(marginAccount.freeCollateral(address(trader)) == 600e6, "free after isolated");
        require(
            marginAccount.isolatedMargin(address(trader), MARKET_ID) == 400e6, "isolated margin"
        );

        trader.addCrossCollateral(marginAccount, 200e6);
        require(marginAccount.freeCollateral(address(trader)) == 400e6, "free after cross");
        require(marginAccount.crossCollateral(address(trader)) == 200e6, "cross collateral");
    }

    function testAntRejectsCrossAndOpenPositionLocksMode() public {
        trader.deposit(marginAccount, 1000e6);
        try trader.setMarginMode(marginAccount, MARKET_ID, PerpsTypes.MarginMode.Cross) {
            revert("expected isolated-only revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, MarginAccount.CrossNotSupported.selector);
        }

        marginAccount.setPositionOpen(address(trader), MARKET_ID, true);
        try trader.setMarginMode(marginAccount, MARKET_ID, PerpsTypes.MarginMode.Isolated) {
            revert("expected active position revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, MarginAccount.ActivePosition.selector);
        }
    }

    function testCannotRemoveUnsafeIsolatedMargin() public {
        trader.deposit(marginAccount, 1000e6);
        trader.addIsolatedMargin(marginAccount, MARKET_ID, 500e6);
        marginAccount.setPositionOpen(address(trader), MARKET_ID, true);
        riskEngine.setIsolatedHealth(-1, 100e18, 50e18);

        try trader.removeIsolatedMargin(marginAccount, MARKET_ID, 1e6) {
            revert("expected unsafe account revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, MarginAccount.UnsafeAccount.selector);
        }
        require(
            marginAccount.isolatedMargin(address(trader), MARKET_ID) == 500e6,
            "revert must preserve isolated margin"
        );
    }

    function _antConfig() private view returns (PerpsTypes.MarketConfig memory) {
        return PerpsTypes.MarketConfig({
            underlying: address(0xA17),
            underlyingUid: ANT_UID,
            symbol: bytes32("ANT-PERP"),
            priceFeed: address(feed),
            maxLeverageBps: 20_000,
            initialMarginBps: 5000,
            maintenanceMarginBps: 2500,
            openInterestCapBps: 400,
            baseSpreadBps: 50,
            tradingFeeBps: 6,
            extendedSpreadMultiplierBps: 20_000,
            extendedLeverageDivisorBps: 20_000,
            maxPriceAge: 100,
            isolatedOnly: true
        });
    }

    function _expectCreateRevert(bytes32 id, PerpsTypes.MarketConfig memory config) private {
        try registry.createMarket(id, config) {
            revert("expected invalid configuration revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, PerpsMarketRegistry.InvalidConfiguration.selector);
        }
    }

    function _expectActorMarketStateRevert(
        PerpsRegistryActor actor,
        PerpsTypes.MarketState state,
        bytes4 selector
    ) private {
        try actor.setMarketState(registry, MARKET_ID, state) {
            revert("expected market state revert");
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

contract PerpsRegistryActor {
    function setMarketState(
        PerpsMarketRegistry registry,
        bytes32 marketId,
        PerpsTypes.MarketState state
    ) external {
        registry.setMarketState(marketId, state);
    }

    function setSessionState(
        PerpsMarketRegistry registry,
        bytes32 marketId,
        PerpsTypes.SessionState state
    ) external {
        registry.setSessionState(marketId, state);
    }
}

contract PerpsAccountActor {
    function approve(ERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function deposit(MarginAccount account, uint256 assets) external {
        account.deposit(assets);
    }

    function addCrossCollateral(MarginAccount account, uint256 assets) external {
        account.addCrossCollateral(assets);
    }

    function addIsolatedMargin(MarginAccount account, bytes32 marketId, uint256 assets) external {
        account.addIsolatedMargin(marketId, assets);
    }

    function removeIsolatedMargin(MarginAccount account, bytes32 marketId, uint256 assets)
        external
    {
        account.removeIsolatedMargin(marketId, assets);
    }

    function setMarginMode(MarginAccount account, bytes32 marketId, PerpsTypes.MarginMode mode)
        external
    {
        account.setMarginMode(marketId, mode);
    }
}

contract PerpsMockUsd is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract PerpsMockFeed {
    uint8 public immutable decimals;
    uint80 private _roundId;
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function setRound(uint80 roundId, int256 answer, uint256 updatedAt, uint80 answeredInRound)
        external
    {
        _roundId = roundId;
        _answer = answer;
        _updatedAt = updatedAt;
        _answeredInRound = answeredInRound;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _answeredInRound);
    }
}

contract PerpsMockRiskEngine is IRiskEngine {
    PerpsTypes.AccountHealth private _cross;
    PerpsTypes.AccountHealth private _isolated;

    function setIsolatedHealth(int256 equity, uint256 initialMargin, uint256 maintenance) external {
        _isolated = PerpsTypes.AccountHealth({
            equityUsd18: equity,
            initialMarginUsd18: initialMargin,
            maintenanceMarginUsd18: maintenance,
            marginRatio18: 0,
            liquidatable: equity < int256(maintenance)
        });
    }

    function crossHealth(address) external view returns (PerpsTypes.AccountHealth memory health) {
        return _cross;
    }

    function isolatedHealth(address, bytes32)
        external
        view
        returns (PerpsTypes.AccountHealth memory health)
    {
        return _isolated;
    }
}
