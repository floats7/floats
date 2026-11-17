// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INavPriceOracle {
    function normalizedPrice(address token) external view returns (uint256 price18);
}

/// @title SwapQuoteOracle
/// @notice Converts between raw 18-decimal Stock Token units and 6-decimal USDG units.
contract SwapQuoteOracle {
    uint256 public constant INTERNAL_SCALE = 1e18;
    uint256 public constant USDG_SCALE = 1e6;
    uint256 public constant INTERNAL_TO_USDG = 1e12;

    error InvalidAddress();
    error InvalidPair(address tokenIn, address tokenOut);
    error InvalidPrice(address token);

    address public immutable usdg;
    INavPriceOracle public immutable navOracle;

    constructor(address usdg_, INavPriceOracle navOracle_) {
        if (usdg_ == address(0) || address(navOracle_) == address(0)) revert InvalidAddress();
        usdg = usdg_;
        navOracle = navOracle_;
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 expectedOut)
    {
        if (amountIn == 0) return 0;

        if (tokenOut == usdg && tokenIn != usdg) {
            uint256 price = navOracle.normalizedPrice(tokenIn);
            if (price == 0) revert InvalidPrice(tokenIn);
            uint256 value18 = amountIn * price / INTERNAL_SCALE;
            return value18 / INTERNAL_TO_USDG;
        }

        if (tokenIn == usdg && tokenOut != usdg) {
            uint256 price = navOracle.normalizedPrice(tokenOut);
            if (price == 0) revert InvalidPrice(tokenOut);
            uint256 value18 = amountIn * INTERNAL_TO_USDG;
            return value18 * INTERNAL_SCALE / price;
        }

        revert InvalidPair(tokenIn, tokenOut);
    }
}
