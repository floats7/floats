// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { OptionsTypes } from "../src/options/OptionsTypes.sol";
import { SeriesRegistry } from "../src/options/SeriesRegistry.sol";
import { QuoteVerifier, ILiveOptionsPriceSource } from "../src/options/QuoteVerifier.sol";

interface QuoteVm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
}

contract QuoteVerifierTest {
    QuoteVm private constant vm = QuoteVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant SIGNER_KEY = 0xA11CE;
    address private constant FIPO = address(0xF1F0);
    bytes32 private constant UID = keccak256("fIPO");

    QuotePriceSource private priceSource;
    SeriesRegistry private registry;
    QuoteVerifier private verifier;
    bytes32 private seriesId;

    function setUp() public {
        priceSource = new QuotePriceSource();
        registry = new SeriesRegistry(address(this), address(0xA11CE));
        registry.configureUnderlying(FIPO, UID, address(priceSource), true);
        verifier = new QuoteVerifier(address(this), address(registry));
        verifier.setMarket(address(this));
        verifier.setSigner(vm.addr(SIGNER_KEY), true);
        seriesId = registry.createSeries(_terms());
        priceSource.set(150e18, true);
    }

    function testVerifiesBuyerBoundQuoteAndConsumesNonce() public {
        QuoteVerifier.Quote memory quote = _quote(1, 60e6, 150e18);
        bytes memory signature = _sign(quote, SIGNER_KEY);
        bytes32 digest = verifier.verifyAndConsume(quote, signature);
        require(digest == verifier.hashQuote(quote), "digest mismatch");
        require(verifier.nonceConsumed(address(this), 1), "nonce not consumed");

        _expectVerifyRevert(quote, signature, QuoteVerifier.QuoteAlreadyConsumed.selector);
    }

    function testRejectsQuoteLongerThanThirtySeconds() public {
        QuoteVerifier.Quote memory quote = _quote(2, 60e6, 150e18);
        quote.validUntil = quote.issuedAt + 31 seconds;
        _expectVerifyRevert(quote, _sign(quote, SIGNER_KEY), QuoteVerifier.QuoteExpired.selector);
    }

    function testRejectsSpotDeviationAndUnhealthyOracle() public {
        QuoteVerifier.Quote memory quote = _quote(3, 60e6, 152e18);
        _expectVerifyRevert(
            quote, _sign(quote, SIGNER_KEY), QuoteVerifier.SpotDeviationExceeded.selector
        );

        priceSource.set(150e18, false);
        quote = _quote(4, 60e6, 150e18);
        _expectVerifyRevert(
            quote, _sign(quote, SIGNER_KEY), QuoteVerifier.OracleUnavailable.selector
        );
    }

    function testRejectsPremiumBelowIntrinsicOrAboveMaximumPayoff() public {
        QuoteVerifier.Quote memory quote = _quote(5, 49e6, 150e18);
        _expectVerifyRevert(
            quote, _sign(quote, SIGNER_KEY), QuoteVerifier.PremiumOutOfBounds.selector
        );

        quote = _quote(6, 101e6, 150e18);
        _expectVerifyRevert(
            quote, _sign(quote, SIGNER_KEY), QuoteVerifier.PremiumOutOfBounds.selector
        );
    }

    function testBuyerCanCancelNonceBeforeSigning() public {
        verifier.cancelNonce(7);
        QuoteVerifier.Quote memory quote = _quote(7, 60e6, 150e18);
        _expectVerifyRevert(
            quote, _sign(quote, SIGNER_KEY), QuoteVerifier.QuoteAlreadyConsumed.selector
        );
    }

    function testSignerRevocationAndOnchainBoundsContainCompromisedKey() public {
        QuoteVerifier.Quote memory quote = _quote(8, 60e6, 150e18);
        bytes memory signature = _sign(quote, SIGNER_KEY);
        verifier.setSigner(vm.addr(SIGNER_KEY), false);
        _expectVerifyRevert(quote, signature, QuoteVerifier.UnauthorizedSigner.selector);

        verifier.setSigner(vm.addr(SIGNER_KEY), true);
        quote = _quote(9, 101e6, 150e18);
        _expectVerifyRevert(
            quote, _sign(quote, SIGNER_KEY), QuoteVerifier.PremiumOutOfBounds.selector
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

    function _quote(uint256 nonce, uint256 premiumPerUnit6, uint256 signedSpotUsd18)
        private
        view
        returns (QuoteVerifier.Quote memory)
    {
        return QuoteVerifier.Quote({
            seriesId: seriesId,
            side: QuoteVerifier.QuoteSide.Buy,
            buyer: address(this),
            size18: 1e18,
            premiumPerUnit6: premiumPerUnit6,
            signedSpotUsd18: signedSpotUsd18,
            nonce: nonce,
            issuedAt: uint48(block.timestamp),
            validUntil: uint48(block.timestamp + 30 seconds)
        });
    }

    function _sign(QuoteVerifier.Quote memory quote, uint256 privateKey)
        private
        returns (bytes memory)
    {
        bytes32 digest = verifier.hashQuote(quote);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _expectVerifyRevert(
        QuoteVerifier.Quote memory quote,
        bytes memory signature,
        bytes4 expected
    ) private {
        try verifier.verifyAndConsume(quote, signature) {
            revert("expected quote verification revert");
        } catch (bytes memory reason) {
            require(reason.length >= 4, "missing selector");
            bytes4 actual;
            assembly {
                actual := mload(add(reason, 32))
            }
            require(actual == expected, "selector mismatch");
        }
    }
}

contract QuotePriceSource is ILiveOptionsPriceSource {
    uint256 private price;
    bool private healthy;

    function set(uint256 price_, bool healthy_) external {
        price = price_;
        healthy = healthy_;
    }

    function currentPrice(address) external view returns (uint256, bool) {
        return (price, healthy);
    }
}
