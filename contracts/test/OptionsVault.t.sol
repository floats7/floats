// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { OptionsVault } from "../src/options/OptionsVault.sol";

interface OptionsVaultVm {
    function warp(uint256 timestamp) external;
}

contract OptionsVaultTest {
    OptionsVaultVm private constant vm =
        OptionsVaultVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUsdg private usdg;
    OptionsVault private vault;
    VaultCaller private guardian;
    VaultCaller private keeper;

    function setUp() public {
        usdg = new MockUsdg();
        guardian = new VaultCaller();
        keeper = new VaultCaller();
        vault = new OptionsVault(address(usdg), address(this), address(guardian));
        vault.setMarket(address(this));
        vault.setSettlementEngine(address(this));
        vault.setKeeper(address(keeper), true);
        usdg.mint(address(this), 1_000_000e6);
        usdg.approve(address(vault), type(uint256).max);
    }

    function testReservesAndReleasesCollateralWithoutBreakingEquityAccounting() public {
        vault.deposit(100_000e6, address(this));
        require(vault.totalAssets() == 100_000e6, "initial assets mismatch");

        vault.reserveCollateral(40_000e6);
        require(vault.reservedCollateral() == 40_000e6, "reserve mismatch");
        require(vault.totalAssets() == 60_000e6, "reserved equity mismatch");

        vault.releaseCollateral(10_000e6);
        require(vault.reservedCollateral() == 30_000e6, "released reserve mismatch");
        require(vault.totalAssets() == 70_000e6, "released equity mismatch");
    }

    function testSettlementAndClaimsRemainAvailableDuringPause() public {
        vault.deposit(100_000e6, address(this));
        vault.reserveCollateral(40_000e6);
        guardian.pause(vault, true);

        vault.settleCollateral(40_000e6, 25_000e6);
        require(vault.reservedCollateral() == 0, "settled reserve mismatch");
        require(vault.claimableCollateral() == 25_000e6, "claimable mismatch");
        require(vault.totalAssets() == 75_000e6, "post-settlement equity mismatch");

        address receiver = address(0xCA11);
        vault.payClaim(receiver, 25_000e6);
        require(usdg.balanceOf(receiver) == 25_000e6, "claim payment mismatch");
        require(vault.claimableCollateral() == 0, "claim liability remains");
        require(vault.totalAssets() == 75_000e6, "claim changed equity");
    }

    function testWithdrawalRequestFinalizationAndPermissionlessClaim() public {
        uint256 shares = vault.deposit(100_000e6, address(this));
        uint48 unlockAt = uint48(block.timestamp + 7 days);
        uint256 requestId = vault.requestWithdrawal(shares / 4, address(0xBEEF), unlockAt);

        vm.warp(unlockAt);
        keeper.finalize(vault, requestId);
        (,,,,, OptionsVault.WithdrawalState state) = vault.withdrawalRequests(requestId);
        require(state == OptionsVault.WithdrawalState.Finalized, "finalization state mismatch");
        require(vault.payableWithdrawalAssets() == 25_000e6, "withdrawal liability mismatch");

        vault.claimWithdrawal(requestId);
        require(usdg.balanceOf(address(0xBEEF)) == 25_000e6, "withdrawal payment mismatch");
        require(vault.payableWithdrawalAssets() == 0, "withdrawal liability remains");
        require(vault.totalAssets() == 75_000e6, "remaining equity mismatch");
    }

    function testDirectWithdrawalIsDisabled() public {
        uint256 shares = vault.deposit(10_000e6, address(this));
        try vault.redeem(shares, address(this), address(this)) {
            revert("expected direct withdrawal revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, OptionsVault.DirectWithdrawalDisabled.selector);
        }
    }

    function testGuardianCannotUnpause() public {
        guardian.pause(vault, true);
        try guardian.pause(vault, false) {
            revert("expected guardian unpause revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, OptionsVault.Unauthorized.selector);
        }
        vault.setOperationsPaused(false);
    }

    function testStuckWithdrawalCanBeFinalizedAfterCollateralReturns() public {
        uint256 shares = vault.deposit(100_000e6, address(this));
        uint48 unlockAt = uint48(block.timestamp + 7 days);
        uint256 requestId = vault.requestWithdrawal(shares / 10, address(0xBEEF), unlockAt);
        vault.reserveCollateral(100_000e6);
        vm.warp(unlockAt);

        try keeper.finalize(vault, requestId) {
            revert("expected unavailable collateral revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, OptionsVault.InsufficientAvailableCollateral.selector);
        }

        vault.releaseCollateral(20_000e6);
        keeper.finalize(vault, requestId);
        (,,,,, OptionsVault.WithdrawalState state) = vault.withdrawalRequests(requestId);
        require(state == OptionsVault.WithdrawalState.Finalized, "withdrawal did not recover");
    }

    function testInvestsOnlyIdleEquityAndRecallsUsdForNewLiability() public {
        MockYieldVault yieldVault = new MockYieldVault(IERC20(address(usdg)));
        vault.configureYieldVault(yieldVault);
        vault.deposit(100_000e6, address(this));

        uint256 invested = keeper.rebalance(vault);
        require(invested == 90_000e6, "unexpected idle investment");
        require(usdg.balanceOf(address(vault)) == 10_000e6, "buffer mismatch");
        require(vault.totalAssets() == 100_000e6, "yield allocation changed equity");

        vault.reserveCollateral(40_000e6);
        require(usdg.balanceOf(address(vault)) == 40_000e6, "liability not made liquid");
        require(vault.reservedCollateral() == 40_000e6, "reserve mismatch");
        require(vault.totalAssets() == 60_000e6, "reserve accounting mismatch");

        vault.paySellBack(address(0xCAFE), 5000e6);
        require(usdg.balanceOf(address(vault)) == 40_000e6, "sell-back spent reserved USDG");
        require(usdg.balanceOf(address(0xCAFE)) == 5000e6, "sell-back not paid");
    }

    function testGuardianEmergencyExitReturnsYieldAssetsAndPauses() public {
        MockYieldVault yieldVault = new MockYieldVault(IERC20(address(usdg)));
        vault.configureYieldVault(yieldVault);
        vault.deposit(100_000e6, address(this));
        keeper.rebalance(vault);

        uint256 recovered = guardian.emergencyExit(vault);
        require(recovered == 90_000e6, "unexpected recovered assets");
        require(vault.operationsPaused(), "operations not paused");
        require(yieldVault.balanceOf(address(vault)) == 0, "yield shares remain");
        require(usdg.balanceOf(address(vault)) == 100_000e6, "USDG not recovered");
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing selector");
        bytes4 actual;
        assembly {
            actual := mload(add(reason, 32))
        }
        require(actual == expected, "selector mismatch");
    }
}

contract VaultCaller {
    function pause(OptionsVault vault, bool paused) external {
        vault.setOperationsPaused(paused);
    }

    function finalize(OptionsVault vault, uint256 requestId) external {
        vault.finalizeWithdrawal(requestId);
    }

    function rebalance(OptionsVault vault) external returns (uint256) {
        return vault.rebalanceIdleCollateral();
    }

    function emergencyExit(OptionsVault vault) external returns (uint256) {
        return vault.emergencyExitYieldVault();
    }
}

contract MockYieldVault is ERC4626 {
    constructor(IERC20 asset_) ERC20("Mock Floats Dollar", "mfUSD") ERC4626(asset_) { }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }
}

contract MockUsdg is ERC20 {
    constructor() ERC20("Mock USDG", "mUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
