// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Floats Test Swap Router
/// @notice Public-testnet-only USDG/tFLOATS fixture with a fixed 100 USDG price.
contract FloatsTestSwapRouter {
    using SafeERC20 for IERC20;

    uint256 public constant STOCK_PRICE_USDG_6 = 100e6;

    error InvalidAmount();
    error InvalidPair(address tokenIn, address tokenOut);

    IERC20 public immutable usdg;
    IERC20 public immutable testStock;

    constructor(IERC20 usdg_, IERC20 testStock_) {
        usdg = usdg_;
        testStock = testStock_;
    }

    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn)
        external
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert InvalidAmount();
        if (tokenIn == address(usdg) && tokenOut == address(testStock)) {
            amountOut = amountIn * 1e18 / STOCK_PRICE_USDG_6;
        } else if (tokenIn == address(testStock) && tokenOut == address(usdg)) {
            amountOut = amountIn * STOCK_PRICE_USDG_6 / 1e18;
        } else {
            revert InvalidPair(tokenIn, tokenOut);
        }

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }
}
