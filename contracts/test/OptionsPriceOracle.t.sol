// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IFloatsNavOracle, OptionsPriceOracle } from "../src/options/OptionsPriceOracle.sol";

interface PriceOracleVm {
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function expectRevert(bytes calldata data) external;
}

contract OptionsPriceOracleTest {
    PriceOracleVm private constant vm =
        PriceOracleVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant UNDERLYING = address(0x1234);
    address private constant KEEPER = address(0xBEEF);
    MockNavOracle private nav;
    OptionsPriceOracle private oracle;

    function setUp() external {
        nav = new MockNavOracle();
        oracle = new OptionsPriceOracle(address(this), address(nav), 3 days);
        oracle.setKeeper(KEEPER, true);
    }

    function testReadsLivePriceAndFinalizesOneExpiryObservation() external {
        uint48 expiry = uint48(block.timestamp + 1 days);
        nav.set(25e18, expiry, IFloatsNavOracle.Health.Live);
        (uint256 price, bool healthy) = oracle.currentPrice(UNDERLYING);
        require(price == 25e18, "live price mismatch");
        require(healthy, "live price unhealthy");

        vm.warp(expiry);
        vm.prank(KEEPER);
        oracle.finalizeSettlementPrice(UNDERLYING, expiry);
        uint48 observedAt;
        bool finalized;
        (price, observedAt, finalized) = oracle.settlementPrice(UNDERLYING, expiry);
        require(price == 25e18, "final price mismatch");
        require(observedAt == expiry, "observation time mismatch");
        require(finalized, "observation not final");

        vm.prank(KEEPER);
        vm.expectRevert(
            abi.encodeWithSelector(OptionsPriceOracle.AlreadyFinalized.selector, UNDERLYING, expiry)
        );
        oracle.finalizeSettlementPrice(UNDERLYING, expiry);
    }
}

contract MockNavOracle is IFloatsNavOracle {
    Observation private _observation;

    function set(uint256 price, uint48 observedAt, Health health) external {
        _observation = Observation(price, observedAt, health);
    }

    function observe(address) external view returns (Observation memory) {
        return _observation;
    }
}
