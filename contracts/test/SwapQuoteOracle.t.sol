// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { INavPriceOracle, SwapQuoteOracle } from "../src/oracle/SwapQuoteOracle.sol";

contract SwapQuoteOracleTest {
    address private constant USDG = address(0x1000);
    address private constant STOCK = address(0x2000);

    MockNavPriceOracle private nav;
    SwapQuoteOracle private oracle;

    function setUp() public {
        nav = new MockNavPriceOracle();
        nav.setPrice(STOCK, 125 ether);
        oracle = new SwapQuoteOracle(USDG, INavPriceOracle(address(nav)));
    }

    function testQuotesStockToUsdgUnits() public view {
        uint256 output = oracle.quote(STOCK, USDG, 2 ether);
        require(output == 250e6, "stock to usdg quote");
    }

    function testQuotesUsdgToStockUnits() public view {
        uint256 output = oracle.quote(USDG, STOCK, 250e6);
        require(output == 2 ether, "usdg to stock quote");
    }

    function testRejectsUnsupportedPair() public view {
        try oracle.quote(STOCK, address(0x3000), 1 ether) {
            revert("expected pair revert");
        } catch (bytes memory reason) {
            require(reason.length >= 4, "missing selector");
            bytes4 actual;
            assembly ("memory-safe") {
                actual := mload(add(reason, 0x20))
            }
            require(actual == SwapQuoteOracle.InvalidPair.selector, "unexpected selector");
        }
    }
}

contract MockNavPriceOracle {
    mapping(address token => uint256 price) private prices;

    function setPrice(address token, uint256 price) external {
        prices[token] = price;
    }

    function normalizedPrice(address token) external view returns (uint256) {
        return prices[token];
    }
}
