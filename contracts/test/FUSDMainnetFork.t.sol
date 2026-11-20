// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FUSDVault } from "../src/fusd/FUSDVault.sol";
import { MorphoUSDGStrategy } from "../src/fusd/MorphoUSDGStrategy.sol";
import { IMorphoVaultV2 } from "../src/fusd/interfaces/IMorphoVaultV2.sol";

interface FUSDMainnetForkVm {
    function createSelectFork(string calldata rpcUrl) external returns (uint256 forkId);
    function envAddress(string calldata name) external returns (address value);
    function envString(string calldata name) external returns (string memory value);
    function prank(address sender) external;
}

/// @notice Exercises fUSD only against the live Robinhood Chain USDG and Steakhouse contracts.
contract FUSDMainnetForkTest {
    FUSDMainnetForkVm private constant vm =
        FUSDMainnetForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    IERC20Metadata private usdg;
    IMorphoVaultV2 private morpho;
    FUSDVault private vault;
    MorphoUSDGStrategy private strategy;

    function setUp() external {
        vm.createSelectFork(vm.envString("RPC_URL"));
        usdg = IERC20Metadata(vm.envAddress("USDG_ADDRESS"));
        morpho = IMorphoVaultV2(vm.envAddress("FUSD_MORPHO_VAULT_ADDRESS"));
        vault = new FUSDVault(usdg, address(this), address(this), address(this), 100e6, 1000, 1000);
        strategy = new MorphoUSDGStrategy(usdg, morpho, address(vault));
        vault.configureStrategy(strategy);
        vault.setDepositsPaused(false);
        usdg.approve(address(vault), type(uint256).max);
    }

    function testRealMainnetDepositAndFullRedemption() external {
        _fundFromLiveVault(10e6);
        uint256 shares = vault.deposit(10e6, address(this));

        _assertTrue(shares != 0, "NO_FUSD_SHARES");
        _assertEq(usdg.balanceOf(address(vault)), 1e6, "BUFFER_NOT_TEN_PERCENT");
        _assertTrue(morpho.balanceOf(address(strategy)) != 0, "NO_MORPHO_SHARES");

        uint256 assets = vault.redeem(shares, address(this), address(this));
        _assertTrue(assets >= 9_999_999, "FULL_REDEMPTION_EXCEEDED_ROUNDING_TOLERANCE");
        _assertEq(vault.balanceOf(address(this)), 0, "FUSD_BALANCE_NOT_CLEARED");
        _assertEq(vault.totalAssets(), 0, "ZERO_SUPPLY_ASSETS_REMAIN");
        _assertEq(vault.pricePerShare18(), 1e18, "ZERO_SUPPLY_NOT_AT_PAR");
        _assertEq(morpho.balanceOf(address(strategy)), 0, "STRATEGY_DUST_REMAINS");
    }

    function testRealMainnetQueuedWithdrawalLifecycle() external {
        _fundFromLiveVault(10e6);
        uint256 shares = vault.deposit(10e6, address(this));
        uint256 requestId = vault.requestWithdrawal(shares / 2, address(this));

        vault.processWithdrawal(requestId);
        (,,, uint256 claimableAssets, FUSDVault.WithdrawalState state) =
            vault.withdrawalRequests(requestId);
        _assertTrue(claimableAssets != 0, "NO_CLAIMABLE_ASSETS");
        _assertEq(uint256(state), uint256(FUSDVault.WithdrawalState.Processed), "NOT_PROCESSED");

        uint256 balanceBefore = usdg.balanceOf(address(this));
        vault.claimWithdrawal(requestId);
        _assertEq(
            usdg.balanceOf(address(this)) - balanceBefore, claimableAssets, "CLAIM_AMOUNT_MISMATCH"
        );
    }

    function testGuardianEmergencyExitKeepsWithdrawalsAvailable() external {
        _fundFromLiveVault(10e6);
        uint256 shares = vault.deposit(10e6, address(this));

        uint256 recoveredAssets = vault.emergencyExitStrategy();
        _assertTrue(recoveredAssets != 0, "NO_ASSETS_RECOVERED");
        _assertTrue(!vault.strategyActive(), "STRATEGY_STILL_ACTIVE");
        _assertTrue(vault.depositsPaused(), "DEPOSITS_NOT_PAUSED");
        _assertEq(morpho.balanceOf(address(strategy)), 0, "MORPHO_SHARES_REMAIN");

        uint256 assets = vault.redeem(shares, address(this), address(this));
        _assertTrue(assets >= 9_999_999, "EMERGENCY_REDEEM_TOO_LOW");
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        if (actual != expected) revert(reason);
    }

    function _fundFromLiveVault(uint256 assets) private {
        vm.prank(address(morpho));
        bool transferred = usdg.transfer(address(this), assets);
        _assertTrue(transferred, "USDG_FORK_FUNDING_FAILED");
    }

    function _assertTrue(bool condition, string memory reason) private pure {
        if (!condition) revert(reason);
    }
}
