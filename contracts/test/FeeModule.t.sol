// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FeeModule, IFeeShareVault } from "../src/fees/FeeModule.sol";

interface FeeVm {
    function warp(uint256 newTimestamp) external;
}

contract FeeModuleTest {
    FeeVm private constant vm = FeeVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockFeeVault private vault;
    FeeModule private module;
    address private constant TREASURY = address(0xBEEF);

    function setUp() public {
        vm.warp(1_000_000);
        vault = new MockFeeVault(1000 ether);
        module = new FeeModule(
            address(this),
            IFeeShareVault(address(vault)),
            TREASURY,
            FeeModule.Rates({ managementBps: 200, cashBps: 25, inKindBps: 10, offHoursBps: 50 })
        );
    }

    function testAccruesAnnualManagementFeeAsDilutionShares() public {
        vm.warp(block.timestamp + 365 days);
        uint256 shares = module.accrue();

        _assertEq(shares, 20 ether, "fee shares");
        _assertEq(vault.balanceOf(TREASURY), 20 ether, "treasury shares");
    }

    function testRepeatedAccrualAtSameTimestampIsIdempotent() public {
        vm.warp(block.timestamp + 30 days);
        module.accrue();
        uint256 supplyAfterFirstAccrual = vault.totalSupply();

        uint256 secondAccrual = module.accrue();
        _assertEq(secondAccrual, 0, "second accrual");
        _assertEq(vault.totalSupply(), supplyAfterFirstAccrual, "unchanged supply");
    }

    function testZeroSupplyAdvancesCheckpointWithoutMinting() public {
        MockFeeVault emptyVault = new MockFeeVault(0);
        FeeModule emptyModule = new FeeModule(
            address(this),
            IFeeShareVault(address(emptyVault)),
            TREASURY,
            FeeModule.Rates({ managementBps: 200, cashBps: 0, inKindBps: 0, offHoursBps: 0 })
        );

        vm.warp(block.timestamp + 30 days);
        _assertEq(emptyModule.accrue(), 0, "zero supply fee");
        _assertEq(emptyModule.lastAccrual(), block.timestamp, "checkpoint advanced");
    }

    function testRateChangeAccruesOldRateBeforeApplyingNewRate() public {
        uint256 initialSupply = vault.totalSupply();
        vm.warp(block.timestamp + 180 days);
        uint256 expectedOldRateShares = initialSupply * 200 * 180 days / 365 days / 10_000;

        module.setRates(
            FeeModule.Rates({ managementBps: 100, cashBps: 5, inKindBps: 2, offHoursBps: 0 })
        );

        _assertEq(vault.balanceOf(TREASURY), expectedOldRateShares, "old rate accrued");
        _assertEq(module.rateFor(FeeModule.FeeKind.Cash), 5, "new cash rate");
        _assertEq(module.rateFor(FeeModule.FeeKind.InKind), 2, "new in-kind rate");

        uint256 supplyAfterChange = vault.totalSupply();
        vm.warp(block.timestamp + 185 days);
        uint256 expectedNewRateShares = supplyAfterChange * 100 * 185 days / 365 days / 10_000;
        uint256 actualNewRateShares = module.accrue();

        _assertEq(actualNewRateShares, expectedNewRateShares, "new rate accrued");
        _assertEq(
            vault.balanceOf(TREASURY),
            expectedOldRateShares + expectedNewRateShares,
            "annual split accrual"
        );
    }

    function testTreasuryChangeSettlesOldTreasuryBeforeSwitch() public {
        address newTreasury = address(0xCAFE);
        vm.warp(block.timestamp + 30 days);
        uint256 expectedOldTreasuryShares = vault.totalSupply() * 200 * 30 days / 365 days / 10_000;

        module.setTreasury(newTreasury);
        _assertEq(vault.balanceOf(TREASURY), expectedOldTreasuryShares, "old treasury settled");

        uint256 supplyAfterChange = vault.totalSupply();
        vm.warp(block.timestamp + 30 days);
        uint256 expectedNewTreasuryShares = supplyAfterChange * 200 * 30 days / 365 days / 10_000;
        module.accrue();

        _assertEq(vault.balanceOf(newTreasury), expectedNewTreasuryShares, "new treasury accrual");
        _assertEq(vault.balanceOf(TREASURY), expectedOldTreasuryShares, "old treasury unchanged");
    }

    function testTransactionFeesRoundUp() public view {
        _assertEq(module.calculateFee(1, FeeModule.FeeKind.Cash), 1, "minimum cash fee");
        _assertEq(module.calculateFee(10_000, FeeModule.FeeKind.InKind), 10, "in-kind fee");
        _assertEq(module.calculateFee(10_000, FeeModule.FeeKind.OffHours), 50, "off-hours fee");
    }

    function testGrossAmountProducesAtLeastRequestedNet() public view {
        uint256 gross = module.grossAmount(9_975, FeeModule.FeeKind.Cash);
        uint256 fee = module.calculateFee(gross, FeeModule.FeeKind.Cash);
        require(gross - fee >= 9_975, "insufficient net amount");
        require(gross - fee - 9_975 <= 1, "excessive gross rounding");
    }

    function testRejectsRatesAboveCaps() public {
        FeeModule.Rates memory invalid =
            FeeModule.Rates({ managementBps: 501, cashBps: 0, inKindBps: 0, offHoursBps: 0 });

        try module.setRates(invalid) {
            revert("expected management cap revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FeeModule.ManagementRateTooHigh.selector);
        }

        invalid = FeeModule.Rates({ managementBps: 0, cashBps: 301, inKindBps: 0, offHoursBps: 0 });
        _expectInvalidRate(invalid);
        invalid = FeeModule.Rates({ managementBps: 0, cashBps: 0, inKindBps: 301, offHoursBps: 0 });
        _expectInvalidRate(invalid);
        invalid = FeeModule.Rates({ managementBps: 0, cashBps: 0, inKindBps: 0, offHoursBps: 301 });
        _expectInvalidRate(invalid);
    }

    function testOnlyAdminCanConfigureRates() public {
        UnauthorizedFeeCaller caller = new UnauthorizedFeeCaller();
        FeeModule.Rates memory rates =
            FeeModule.Rates({ managementBps: 100, cashBps: 0, inKindBps: 0, offHoursBps: 0 });

        try caller.setRates(module, rates) {
            revert("expected admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FeeModule.NotAdmin.selector);
        }

        try caller.setTreasury(module, address(0xCAFE)) {
            revert("expected treasury admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FeeModule.NotAdmin.selector);
        }
    }

    function testRejectsInvalidAddresses() public {
        try new FeeModule(
            address(0),
            IFeeShareVault(address(vault)),
            TREASURY,
            FeeModule.Rates({ managementBps: 0, cashBps: 0, inKindBps: 0, offHoursBps: 0 })
        ) {
            revert("expected constructor address revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FeeModule.InvalidAddress.selector);
        }

        try module.setTreasury(address(0)) {
            revert("expected treasury address revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FeeModule.InvalidAddress.selector);
        }
    }

    function _expectInvalidRate(FeeModule.Rates memory rates) private {
        try module.setRates(rates) {
            revert("expected transaction rate revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FeeModule.InvalidRate.selector);
        }
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing revert selector");
        bytes4 actual;
        assembly ("memory-safe") {
            actual := mload(add(reason, 0x20))
        }
        require(actual == expected, "unexpected revert selector");
    }
}

contract MockFeeVault {
    uint256 public totalSupply;
    mapping(address account => uint256 balance) public balanceOf;

    constructor(uint256 initialSupply) {
        totalSupply = initialSupply;
    }

    function mintFeeShares(address recipient, uint256 shares) external {
        balanceOf[recipient] += shares;
        totalSupply += shares;
    }
}

contract UnauthorizedFeeCaller {
    function setRates(FeeModule module, FeeModule.Rates memory rates) external {
        module.setRates(rates);
    }

    function setTreasury(FeeModule module, address treasury) external {
        module.setTreasury(treasury);
    }
}
