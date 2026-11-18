// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { OptionsVault } from "../src/options/OptionsVault.sol";

interface OptionsInvariantVm {
    function warp(uint256 timestamp) external;
}

contract OptionsVaultInvariantTest {
    OptionsInvariantUsdg private usdg;
    OptionsVault private vault;
    OptionsVaultInvariantHandler private handler;
    address[] private targets;

    function setUp() public {
        usdg = new OptionsInvariantUsdg();
        vault = new OptionsVault(address(usdg), address(this), address(this));
        handler = new OptionsVaultInvariantHandler(usdg, vault);
        vault.setMarket(address(handler));
        vault.setSettlementEngine(address(handler));
        vault.setKeeper(address(handler), true);
        targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return targets;
    }

    function invariantBalanceCoversEveryLiabilityBucket() public view {
        uint256 liabilities = vault.reservedCollateral() + vault.claimableCollateral()
            + vault.payableWithdrawalAssets();
        require(usdg.balanceOf(address(vault)) >= liabilities, "options vault insolvent");
    }

    function invariantTotalAssetsExcludesAllLiabilities() public view {
        uint256 liabilities = vault.reservedCollateral() + vault.claimableCollateral()
            + vault.payableWithdrawalAssets();
        require(
            vault.totalAssets() == usdg.balanceOf(address(vault)) - liabilities,
            "options equity mismatch"
        );
    }

    function invariantSharesAreHeldByOwnerOrWithdrawalEscrow() public view {
        require(
            vault.totalSupply()
                == vault.balanceOf(address(handler)) + vault.balanceOf(address(vault)),
            "options shares escaped accounting"
        );
    }
}

contract OptionsVaultInvariantHandler {
    OptionsInvariantVm private constant vm =
        OptionsInvariantVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    OptionsInvariantUsdg private immutable usdg;
    OptionsVault private immutable vault;
    uint256[] private withdrawalIds;

    constructor(OptionsInvariantUsdg usdg_, OptionsVault vault_) {
        usdg = usdg_;
        vault = vault_;
        usdg_.approve(address(vault_), type(uint256).max);
    }

    function deposit(uint96 seed) external {
        uint256 amount = uint256(seed) % 1_000_000e6 + 1;
        usdg.mint(address(this), amount);
        vault.deposit(amount, address(this));
    }

    function reserve(uint96 seed) external {
        uint256 available = vault.availableCollateral();
        if (available == 0) return;
        vault.reserveCollateral(uint256(seed) % available + 1);
    }

    function release(uint96 seed) external {
        uint256 reserved = vault.reservedCollateral();
        if (reserved == 0) return;
        vault.releaseCollateral(uint256(seed) % reserved + 1);
    }

    function settle(uint96 maximumSeed, uint96 liabilitySeed) external {
        uint256 reserved = vault.reservedCollateral();
        if (reserved == 0) return;
        uint256 maximum = uint256(maximumSeed) % reserved + 1;
        uint256 liability = uint256(liabilitySeed) % (maximum + 1);
        vault.settleCollateral(maximum, liability);
    }

    function payClaim(uint96 seed) external {
        uint256 claimable = vault.claimableCollateral();
        if (claimable == 0) return;
        vault.payClaim(address(this), uint256(seed) % claimable + 1);
    }

    function paySellBack(uint96 seed) external {
        uint256 available = vault.availableCollateral();
        if (available == 0) return;
        vault.paySellBack(address(this), uint256(seed) % available + 1);
    }

    function requestWithdrawal(uint96 seed) external {
        uint256 shares = vault.balanceOf(address(this));
        if (shares == 0) return;
        uint256 requestId = vault.requestWithdrawal(
            uint256(seed) % shares + 1, address(this), uint48(block.timestamp + 1)
        );
        withdrawalIds.push(requestId);
    }

    function finalizeWithdrawal(uint256 seed) external {
        if (withdrawalIds.length == 0) return;
        uint256 requestId = withdrawalIds[seed % withdrawalIds.length];
        (,,,, uint48 unlockAt, OptionsVault.WithdrawalState state) =
            vault.withdrawalRequests(requestId);
        if (state != OptionsVault.WithdrawalState.Requested) return;
        vm.warp(unlockAt);
        uint256 shares = vault.totalSupply();
        if (shares == 0 || vault.availableCollateral() == 0) return;
        try vault.finalizeWithdrawal(requestId) { } catch { }
    }

    function claimWithdrawal(uint256 seed) external {
        if (withdrawalIds.length == 0) return;
        uint256 requestId = withdrawalIds[seed % withdrawalIds.length];
        (,,,,, OptionsVault.WithdrawalState state) = vault.withdrawalRequests(requestId);
        if (state == OptionsVault.WithdrawalState.Finalized) vault.claimWithdrawal(requestId);
    }
}

contract OptionsInvariantUsdg is ERC20 {
    constructor() ERC20("Invariant USDG", "iUSDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
