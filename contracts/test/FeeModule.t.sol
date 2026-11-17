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
}
