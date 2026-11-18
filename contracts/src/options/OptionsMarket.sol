// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { QuoteVerifier } from "./QuoteVerifier.sol";

interface IMarketOptionToken {
    function mint(address account, uint256 seriesId, uint256 amount) external;
    function burn(address account, uint256 seriesId, uint256 amount) external;
}

interface IMarketSettlementEngine {
    function openPosition(bytes32 seriesId, uint256 size18) external returns (uint256 liability6);

    function closePosition(bytes32 seriesId, uint256 size18, address receiver, uint256 payout6)
        external
        returns (uint256 released6);

    function claimFor(bytes32 seriesId, address account, uint256 size18)
        external
        returns (uint256 payout6);
}

interface IMarketRiskManager {
    function recordOpen(bytes32 seriesId, uint256 liability6) external;
    function recordClose(bytes32 seriesId, uint256 liability6) external;
}

contract OptionsMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidBuyer();
    error InvalidQuoteSide();

    event OptionBought(
        bytes32 indexed quoteHash,
        bytes32 indexed seriesId,
        address indexed buyer,
        uint256 size18,
        uint256 premium6,
        uint256 maximumLiability6
    );
    event OptionSoldBack(
        bytes32 indexed quoteHash,
        bytes32 indexed seriesId,
        address indexed buyer,
        uint256 size18,
        uint256 payout6,
        uint256 releasedLiability6
    );
    event OptionClaimed(
        bytes32 indexed seriesId, address indexed account, uint256 size18, uint256 payout6
    );

    IERC20 public immutable usdg;
    address public immutable vault;
    QuoteVerifier public immutable quoteVerifier;
    IMarketSettlementEngine public immutable settlementEngine;
    IMarketOptionToken public immutable optionToken;
    IMarketRiskManager public immutable riskManager;

    constructor(
        address usdg_,
        address vault_,
        address quoteVerifier_,
        address settlementEngine_,
        address optionToken_,
        address riskManager_
    ) {
        if (
            usdg_ == address(0) || vault_ == address(0) || quoteVerifier_ == address(0)
                || settlementEngine_ == address(0) || optionToken_ == address(0)
                || riskManager_ == address(0)
        ) revert InvalidAddress();
        usdg = IERC20(usdg_);
        vault = vault_;
        quoteVerifier = QuoteVerifier(quoteVerifier_);
        settlementEngine = IMarketSettlementEngine(settlementEngine_);
        optionToken = IMarketOptionToken(optionToken_);
        riskManager = IMarketRiskManager(riskManager_);
    }

    function buy(QuoteVerifier.Quote calldata quote, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 premium6, uint256 maximumLiability6)
    {
        _requireBuyer(quote);
        if (quote.side != QuoteVerifier.QuoteSide.Buy) revert InvalidQuoteSide();
        bytes32 quoteHash = quoteVerifier.verifyAndConsume(quote, signature);
        premium6 = Math.mulDiv(quote.premiumPerUnit6, quote.size18, 1e18, Math.Rounding.Ceil);

        usdg.safeTransferFrom(msg.sender, vault, premium6);
        maximumLiability6 = settlementEngine.openPosition(quote.seriesId, quote.size18);
        riskManager.recordOpen(quote.seriesId, maximumLiability6);
        optionToken.mint(msg.sender, uint256(quote.seriesId), quote.size18);
        emit OptionBought(
            quoteHash, quote.seriesId, msg.sender, quote.size18, premium6, maximumLiability6
        );
    }

    function sellBack(QuoteVerifier.Quote calldata quote, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 payout6, uint256 releasedLiability6)
    {
        _requireBuyer(quote);
        if (quote.side != QuoteVerifier.QuoteSide.SellBack) revert InvalidQuoteSide();
        bytes32 quoteHash = quoteVerifier.verifyAndConsume(quote, signature);
        payout6 = Math.mulDiv(quote.premiumPerUnit6, quote.size18, 1e18);

        optionToken.burn(msg.sender, uint256(quote.seriesId), quote.size18);
        releasedLiability6 =
            settlementEngine.closePosition(quote.seriesId, quote.size18, msg.sender, payout6);
        riskManager.recordClose(quote.seriesId, releasedLiability6);
        emit OptionSoldBack(
            quoteHash, quote.seriesId, msg.sender, quote.size18, payout6, releasedLiability6
        );
    }

    function claim(bytes32 seriesId, uint256 size18)
        external
        nonReentrant
        returns (uint256 payout6)
    {
        payout6 = settlementEngine.claimFor(seriesId, msg.sender, size18);
        emit OptionClaimed(seriesId, msg.sender, size18, payout6);
    }

    function _requireBuyer(QuoteVerifier.Quote calldata quote) private view {
        if (quote.buyer != msg.sender) revert InvalidBuyer();
    }
}
