// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { OptionsTypes } from "./OptionsTypes.sol";

interface IQuoteSeriesRegistry {
    function getSeries(bytes32 seriesId)
        external
        view
        returns (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state);
}

interface ILiveOptionsPriceSource {
    function currentPrice(address underlying)
        external
        view
        returns (uint256 priceUsd18, bool healthy);
}

contract QuoteVerifier is EIP712 {
    enum QuoteSide {
        Buy,
        SellBack
    }

    struct Quote {
        bytes32 seriesId;
        QuoteSide side;
        address buyer;
        uint256 size18;
        uint256 premiumPerUnit6;
        uint256 signedSpotUsd18;
        uint256 nonce;
        uint48 issuedAt;
        uint48 validUntil;
    }

    error InvalidAddress();
    error InvalidQuote();
    error Unauthorized();
    error UnauthorizedSigner();
    error QuoteExpired();
    error QuoteAlreadyConsumed();
    error OracleUnavailable();
    error SpotDeviationExceeded();
    error PremiumOutOfBounds();

    event SignerSet(address indexed signer, bool allowed);
    event MarketSet(address indexed market);
    event NonceConsumed(address indexed buyer, uint256 indexed nonce, bytes32 indexed quoteHash);

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 seriesId,uint8 side,address buyer,uint256 size18,uint256 premiumPerUnit6,uint256 signedSpotUsd18,uint256 nonce,uint48 issuedAt,uint48 validUntil)"
    );
    uint48 public constant MAXIMUM_QUOTE_LIFETIME = 30 seconds;
    uint256 public constant MAXIMUM_SPOT_DEVIATION_BPS = 100;
    uint256 private constant BPS = 10_000;
    uint256 private constant USD18_TO_USDG6 = 1e12;

    address public immutable admin;
    address public market;
    IQuoteSeriesRegistry public immutable registry;

    mapping(address signer => bool allowed) public isSigner;
    mapping(address buyer => mapping(uint256 nonce => bool consumed)) public nonceConsumed;

    constructor(address admin_, address registry_) EIP712("Floats Options", "1") {
        if (admin_ == address(0) || registry_ == address(0)) {
            revert InvalidAddress();
        }
        admin = admin_;
        registry = IQuoteSeriesRegistry(registry_);
    }

    function setMarket(address market_) external {
        if (msg.sender != admin) revert Unauthorized();
        if (market_ == address(0)) revert InvalidAddress();
        if (market != address(0)) revert InvalidQuote();
        market = market_;
        emit MarketSet(market_);
    }

    function setSigner(address signer, bool allowed) external {
        if (msg.sender != admin) revert Unauthorized();
        if (signer == address(0)) revert InvalidAddress();
        isSigner[signer] = allowed;
        emit SignerSet(signer, allowed);
    }

    function cancelNonce(uint256 nonce) external {
        if (nonceConsumed[msg.sender][nonce]) revert QuoteAlreadyConsumed();
        nonceConsumed[msg.sender][nonce] = true;
        emit NonceConsumed(msg.sender, nonce, bytes32(0));
    }

    function verifyAndConsume(Quote calldata quote, bytes calldata signature)
        external
        returns (bytes32 quoteHash)
    {
        if (msg.sender != market) revert Unauthorized();
        _validateShapeAndDeadline(quote);
        if (nonceConsumed[quote.buyer][quote.nonce]) revert QuoteAlreadyConsumed();

        (OptionsTypes.SeriesTerms memory terms, OptionsTypes.SeriesState state) =
            registry.getSeries(quote.seriesId);
        if (state != OptionsTypes.SeriesState.Active) revert InvalidQuote();
        _validateSpot(terms, quote.signedSpotUsd18);
        _validatePremium(terms, quote.signedSpotUsd18, quote.premiumPerUnit6);

        quoteHash = hashQuote(quote);
        address signer = ECDSA.recover(quoteHash, signature);
        if (!isSigner[signer]) revert UnauthorizedSigner();

        nonceConsumed[quote.buyer][quote.nonce] = true;
        emit NonceConsumed(quote.buyer, quote.nonce, quoteHash);
    }

    function hashQuote(Quote calldata quote) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                quote.seriesId,
                quote.side,
                quote.buyer,
                quote.size18,
                quote.premiumPerUnit6,
                quote.signedSpotUsd18,
                quote.nonce,
                quote.issuedAt,
                quote.validUntil
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function _validateShapeAndDeadline(Quote calldata quote) private view {
        if (
            quote.seriesId == bytes32(0) || quote.buyer == address(0) || quote.size18 == 0
                || quote.premiumPerUnit6 == 0 || quote.signedSpotUsd18 == 0
        ) revert InvalidQuote();
        if (
            quote.validUntil < block.timestamp || quote.issuedAt > block.timestamp
                || quote.validUntil < quote.issuedAt
                || quote.validUntil - quote.issuedAt > MAXIMUM_QUOTE_LIFETIME
        ) revert QuoteExpired();
    }

    function _validateSpot(OptionsTypes.SeriesTerms memory terms, uint256 signedSpotUsd18)
        private
        view
    {
        (uint256 oracleSpotUsd18, bool healthy) =
            ILiveOptionsPriceSource(terms.priceSource).currentPrice(terms.underlying);
        if (!healthy || oracleSpotUsd18 == 0) revert OracleUnavailable();
        uint256 difference = signedSpotUsd18 > oracleSpotUsd18
            ? signedSpotUsd18 - oracleSpotUsd18
            : oracleSpotUsd18 - signedSpotUsd18;
        if (Math.mulDiv(difference, BPS, oracleSpotUsd18) > MAXIMUM_SPOT_DEVIATION_BPS) {
            revert SpotDeviationExceeded();
        }
    }

    function _validatePremium(
        OptionsTypes.SeriesTerms memory terms,
        uint256 signedSpotUsd18,
        uint256 premiumPerUnit6
    ) private pure {
        uint256 intrinsicUsd18 = 0;
        uint256 maximumPayoffUsd18;
        if (terms.kind == OptionsTypes.OptionKind.CappedCall) {
            maximumPayoffUsd18 = terms.capUsd18 - terms.strikeUsd18;
            if (signedSpotUsd18 > terms.strikeUsd18) {
                intrinsicUsd18 = Math.min(signedSpotUsd18 - terms.strikeUsd18, maximumPayoffUsd18);
            }
        } else {
            maximumPayoffUsd18 = terms.strikeUsd18;
            if (signedSpotUsd18 < terms.strikeUsd18) {
                intrinsicUsd18 = terms.strikeUsd18 - signedSpotUsd18;
            }
        }

        intrinsicUsd18 = Math.mulDiv(intrinsicUsd18, terms.contractSize18, 1e18);
        maximumPayoffUsd18 = Math.mulDiv(maximumPayoffUsd18, terms.contractSize18, 1e18);
        uint256 intrinsic6 = Math.ceilDiv(intrinsicUsd18, USD18_TO_USDG6);
        uint256 maximum6 = maximumPayoffUsd18 / USD18_TO_USDG6;
        if (premiumPerUnit6 < intrinsic6 || premiumPerUnit6 > maximum6) {
            revert PremiumOutOfBounds();
        }
    }
}
