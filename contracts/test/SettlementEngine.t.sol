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

interface SettlementVm {
    function warp(uint256 timestamp) external;
}

contract SettlementEngineTest is IERC1155Receiver {
    SettlementVm private constant vm =
        SettlementVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant FIPO = address(0xF1F0);
    bytes32 private constant UID = keccak256("fIPO");

    SettlementUsdg private usdg;
    SettlementPriceSource private priceSource;
    SeriesRegistry private registry;
    OptionToken private optionToken;
    OptionsVault private vault;
    SettlementEngine private engine;

    function setUp() public {
        usdg = new SettlementUsdg();
        priceSource = new SettlementPriceSource();
        registry = new SeriesRegistry(address(this), address(0xA11CE));
        registry.configureUnderlying(FIPO, UID, address(priceSource), true);
        optionToken = new OptionToken(address(this), "ipfs://floats-options/{id}.json");
        vault = new OptionsVault(address(usdg), address(this), address(0xA11CE));
        engine = new SettlementEngine(
            address(this), address(registry), address(optionToken), address(vault), 72 hours
        );

        engine.setMarket(address(this));
        registry.setSettlementEngine(address(engine));
        optionToken.setMarket(address(this));
        optionToken.setSettlementEngine(address(engine));
        vault.setMarket(address(engine));
        vault.setSettlementEngine(address(engine));

        usdg.mint(address(this), 100_000e6);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(100_000e6, address(this));
    }

    function testAutomaticallySettlesCappedCallAndPaysClaim() public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();
        bytes32 seriesId = registry.createSeries(terms);
        uint256 size = 10e18;
        uint256 maximumLiability = engine.openPosition(seriesId, size);
        optionToken.mint(address(this), uint256(seriesId), size);
        require(maximumLiability == 1000e6, "maximum liability mismatch");

        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.TradingClosed);
        vm.warp(terms.expiry);
        priceSource.set(150e18, terms.expiry, true);
        engine.settle(seriesId);

        (,, uint256 claimable,,,,,) = engine.settlements(seriesId);
        require(claimable == 500e6, "claimable mismatch");
        require(vault.claimableCollateral() == 500e6, "vault claimable mismatch");

        uint256 before = usdg.balanceOf(address(this));
        uint256 payout = engine.claim(seriesId, size);
        require(payout == 500e6, "payout mismatch");
        require(usdg.balanceOf(address(this)) == before + payout, "claim transfer mismatch");
        require(optionToken.balanceOf(address(this), uint256(seriesId)) == 0, "position not burned");
        require(vault.claimableCollateral() == 0, "claimable liability remains");
    }

    function testManualSettlementRequiresManualStateAndAdmin() public {
        OptionsTypes.SeriesTerms memory terms = _putTerms();
        bytes32 seriesId = registry.createSeries(terms);
        uint256 size = 10e18;
        engine.openPosition(seriesId, size);
        optionToken.mint(address(this), uint256(seriesId), size);

        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.Suspended);
        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.ManualSettlementRequired);
        vm.warp(terms.expiry);
        engine.manualSettle(seriesId, 60e18);

        (, uint256 payoff, uint256 claimable,,,,, bool manual) = engine.settlements(seriesId);
        require(payoff == 40e18, "manual payoff mismatch");
        require(claimable == 400e6, "manual claimable mismatch");
        require(manual, "manual flag missing");
    }

    function testRejectsNonFinalOrLateAutomaticObservation() public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();
        bytes32 seriesId = registry.createSeries(terms);
        engine.openPosition(seriesId, 1e18);
        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.TradingClosed);
        vm.warp(terms.expiry);

        priceSource.set(150e18, terms.expiry, false);
        _expectSettleRevert(seriesId, SettlementEngine.InvalidObservation.selector);
        priceSource.set(150e18, terms.expiry + 72 hours + 1, true);
        _expectSettleRevert(seriesId, SettlementEngine.InvalidObservation.selector);
    }

    function testConcurrentHoldersClaimWithoutLeavingRoundingLiability() public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();
        bytes32 seriesId = registry.createSeries(terms);
        SettlementClaimHolder first = new SettlementClaimHolder();
        SettlementClaimHolder second = new SettlementClaimHolder();
        engine.openPosition(seriesId, 2e18);
        optionToken.mint(address(first), uint256(seriesId), 1e18);
        optionToken.mint(address(second), uint256(seriesId), 1e18);

        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.TradingClosed);
        vm.warp(terms.expiry);
        priceSource.set(150e18, terms.expiry, true);
        engine.settle(seriesId);

        first.claim(engine, seriesId, 1e18);
        second.claim(engine, seriesId, 1e18);
        require(usdg.balanceOf(address(first)) == 50e6, "first claim mismatch");
        require(usdg.balanceOf(address(second)) == 50e6, "second claim mismatch");
        require(vault.claimableCollateral() == 0, "concurrent claim liability remains");
    }

    function testFuzzCappedCallSettlementNeverExceedsReservedCollateral(
        uint96 spotSeed,
        uint64 sizeSeed
    ) public {
        OptionsTypes.SeriesTerms memory terms = _callTerms();
        bytes32 seriesId = registry.createSeries(terms);
        uint256 size = uint256(sizeSeed) % (100e18 - 1e10) + 1e10;
        uint256 reserved = engine.openPosition(seriesId, size);
        optionToken.mint(address(this), uint256(seriesId), size);

        registry.setSeriesState(seriesId, OptionsTypes.SeriesState.TradingClosed);
        vm.warp(terms.expiry);
        uint256 price = uint256(spotSeed) % 300e18 + 1;
        priceSource.set(price, terms.expiry, true);
        engine.settle(seriesId);

        (,, uint256 claimable,,,,,) = engine.settlements(seriesId);
        require(claimable <= reserved, "claim exceeds reservation");
        require(vault.reservedCollateral() == 0, "reservation remains after settlement");
        require(vault.claimableCollateral() == claimable, "claim liability mismatch");
    }

    function _callTerms() private view returns (OptionsTypes.SeriesTerms memory) {
        return OptionsTypes.SeriesTerms({
            underlying: FIPO,
            underlyingUid: UID,
            priceSource: address(priceSource),
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

    function _expectSettleRevert(bytes32 seriesId, bytes4 expected) private {
        try engine.settle(seriesId) {
            revert("expected settlement revert");
        } catch (bytes memory reason) {
            require(reason.length >= 4, "missing selector");
            bytes4 actual;
            assembly {
                actual := mload(add(reason, 32))
            }
            require(actual == expected, "selector mismatch");
        }
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

contract SettlementPriceSource is ISettlementPriceSource {
    uint256 private price;
    uint48 private observedAt;
    bool private finalObservation;

    function set(uint256 price_, uint48 observedAt_, bool finalObservation_) external {
        price = price_;
        observedAt = observedAt_;
        finalObservation = finalObservation_;
    }

    function settlementPrice(address, uint48) external view returns (uint256, uint48, bool) {
        return (price, observedAt, finalObservation);
    }
}

contract SettlementClaimHolder is IERC1155Receiver {
    function claim(SettlementEngine engine, bytes32 seriesId, uint256 size18) external {
        engine.claim(seriesId, size18);
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

contract SettlementUsdg is ERC20 {
    constructor() ERC20("Settlement USDG", "sUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
