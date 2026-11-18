// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";
import { OptionToken } from "../src/options/OptionToken.sol";
import { OptionsVault } from "../src/options/OptionsVault.sol";
import { SettlementEngine, ISettlementPriceSource } from "../src/options/SettlementEngine.sol";
import { QuoteVerifier, ILiveOptionsPriceSource } from "../src/options/QuoteVerifier.sol";
import { OptionsMarket } from "../src/options/OptionsMarket.sol";
import { RiskManager } from "../src/options/RiskManager.sol";

interface MarketVm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract OptionsMarketTest {
    MarketVm private constant vm =
        MarketVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant SIGNER_KEY = 0xB0B;
    address private constant FIPO = address(0xF1F0);
    bytes32 private constant UID = keccak256("fIPO");

    MarketUsdg private usdg;
    MarketPriceSource private priceSource;
    SeriesRegistry private registry;
    OptionToken private optionToken;
    OptionsVault private vault;
    SettlementEngine private engine;
    QuoteVerifier private verifier;
    OptionsMarket private market;
    RiskManager private riskManager;
    MarketBuyer private buyer;
    bytes32 private seriesId;

    function setUp() public {
        usdg = new MarketUsdg();
        priceSource = new MarketPriceSource();
        registry = new SeriesRegistry(address(this), address(0xA11CE));
        registry.configureUnderlying(FIPO, UID, address(priceSource), true);
        optionToken = new OptionToken(address(this), "ipfs://floats-options/{id}.json");
        vault = new OptionsVault(address(usdg), address(this), address(0xA11CE));
        verifier = new QuoteVerifier(address(this), address(registry));
        engine = new SettlementEngine(
            address(this), address(registry), address(optionToken), address(vault), 72 hours
        );
        riskManager = new RiskManager(
            address(this),
            address(registry),
            address(vault),
            RiskManager.Limits({
                utilizationBps: 8000, underlyingBps: 2500, expiryBps: 4000, seriesBps: 1000
            })
        );
        market = new OptionsMarket(
            address(usdg),
            address(vault),
            address(verifier),
            address(engine),
            address(optionToken),
            address(riskManager)
        );
        buyer = new MarketBuyer();

        verifier.setMarket(address(market));
        verifier.setSigner(vm.addr(SIGNER_KEY), true);
        engine.setMarket(address(market));
        engine.setRiskManager(address(riskManager));
        riskManager.setMarket(address(market));
        riskManager.setSettlementEngine(address(engine));
        registry.setSettlementEngine(address(engine));
        optionToken.setMarket(address(market));
        optionToken.setSettlementEngine(address(engine));
        vault.setMarket(address(engine));
        vault.setSettlementEngine(address(engine));

        priceSource.set(150e18, true);
        seriesId = registry.createSeries(_terms());
        usdg.mint(address(this), 10_000e6);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(10_000e6, address(this));
        usdg.mint(address(buyer), 1000e6);
        buyer.approve(usdg, address(market));
    }

    function testBuyAndSellBackAreAtomicAndSolvent() public {
        QuoteVerifier.Quote memory buyQuote = _quote(QuoteVerifier.QuoteSide.Buy, 1, 60e6);
        buyer.buy(market, buyQuote, _sign(buyQuote));

        require(
            optionToken.balanceOf(address(buyer), uint256(seriesId)) == 1e18, "position missing"
        );
        require(vault.reservedCollateral() == 100e6, "buy reserve mismatch");
        require(vault.totalAssets() == 9960e6, "buy equity mismatch");

        QuoteVerifier.Quote memory sellQuote = _quote(QuoteVerifier.QuoteSide.SellBack, 2, 55e6);
        uint256 buyerBalanceBefore = usdg.balanceOf(address(buyer));
        buyer.sellBack(market, sellQuote, _sign(sellQuote));

        require(optionToken.balanceOf(address(buyer), uint256(seriesId)) == 0, "position remains");
        require(vault.reservedCollateral() == 0, "sell-back reserve remains");
        require(
            usdg.balanceOf(address(buyer)) == buyerBalanceBefore + 55e6, "sell-back payout mismatch"
        );
        require(vault.totalAssets() == 10_005e6, "realized vault equity mismatch");
    }

    function testClaimThroughMarketBurnsPositionAndPaysHolder() public {
        QuoteVerifier.Quote memory buyQuote = _quote(QuoteVerifier.QuoteSide.Buy, 3, 60e6);
        buyer.buy(market, buyQuote, _sign(buyQuote));
        (OptionsTypes.SeriesTerms memory terms,) = registry.getSeries(seriesId);
        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.TradingClosed);
        vm.warp(terms.expiry);
        priceSource.setSettlement(150e18, terms.expiry, true);
        engine.settle(seriesId);

        uint256 balanceBefore = usdg.balanceOf(address(buyer));
        buyer.claim(market, seriesId, 1e18);
        require(usdg.balanceOf(address(buyer)) == balanceBefore + 50e6, "claim payout mismatch");
        require(
            optionToken.balanceOf(address(buyer), uint256(seriesId)) == 0, "claimed token remains"
        );
    }

    function _terms() private view returns (OptionsTypes.SeriesTerms memory) {
        return OptionsTypes.SeriesTerms({
            underlying: FIPO,
            underlyingUid: keccak256("fIPO"),
            priceSource: address(priceSource),
            kind: OptionsTypes.OptionKind.CappedCall,
            strikeUsd18: 100e18,
            capUsd18: 200e18,
            expiry: uint48(block.timestamp + 7 days),
            contractSize18: 1e18,
            corporateActionPolicyVersion: 1
        });
    }

    function _quote(QuoteVerifier.QuoteSide side, uint256 nonce, uint256 premium6)
        private
        view
        returns (QuoteVerifier.Quote memory)
    {
        return QuoteVerifier.Quote({
            seriesId: seriesId,
            side: side,
            buyer: address(buyer),
            size18: 1e18,
            premiumPerUnit6: premium6,
            signedSpotUsd18: 150e18,
            nonce: nonce,
            issuedAt: uint48(block.timestamp),
            validUntil: uint48(block.timestamp + 30 seconds)
        });
    }

    function _sign(QuoteVerifier.Quote memory quote) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, verifier.hashQuote(quote));
        return abi.encodePacked(r, s, v);
    }
}

contract MarketBuyer is IERC1155Receiver {
    function approve(MarketUsdg usdg, address market) external {
        usdg.approve(market, type(uint256).max);
    }

    function buy(OptionsMarket market, QuoteVerifier.Quote memory quote, bytes memory signature)
        external
    {
        market.buy(quote, signature);
    }

    function sellBack(
        OptionsMarket market,
        QuoteVerifier.Quote memory quote,
        bytes memory signature
    ) external {
        market.sellBack(quote, signature);
    }

    function claim(OptionsMarket market, bytes32 seriesId, uint256 size18) external {
        market.claim(seriesId, size18);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }
}

contract MarketPriceSource is ILiveOptionsPriceSource, ISettlementPriceSource {
    uint256 private price;
    bool private healthy;
    uint48 private settlementObservedAt;
    bool private finalSettlement;

    function set(uint256 price_, bool healthy_) external {
        price = price_;
        healthy = healthy_;
    }

    function currentPrice(address) external view returns (uint256, bool) {
        return (price, healthy);
    }

    function setSettlement(uint256 price_, uint48 observedAt_, bool final_) external {
        price = price_;
        settlementObservedAt = observedAt_;
        finalSettlement = final_;
    }

    function settlementPrice(address, uint48) external view returns (uint256, uint48, bool) {
        return (price, settlementObservedAt, finalSettlement);
    }
}

contract MarketUsdg is ERC20 {
    constructor() ERC20("Market USDG", "mUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
