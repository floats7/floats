// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    FloatsVault,
    IFloatsIndexRegistry,
    IFloatsNavOracle
} from "../src/core/FloatsVault.sol";

contract FloatsVaultInvariantTest {
    InvariantVaultToken private usdg;
    InvariantStockToken private stock;
    FloatsVault private vault;
    VaultInvariantHandler private handler;
    address[] private targets;

    function setUp() public {
        usdg = new InvariantVaultToken();
        stock = new InvariantStockToken();
        InvariantVaultRegistry registry = new InvariantVaultRegistry(address(stock));
        InvariantVaultOracle oracle = new InvariantVaultOracle();
        vault = new FloatsVault(
            IERC20(address(usdg)),
            address(this),
            address(this),
            IFloatsIndexRegistry(address(registry)),
            IFloatsNavOracle(address(oracle)),
            type(uint128).max,
            "Floats IPO Index",
            "fIPO"
        );
        handler = new VaultInvariantHandler(usdg, stock, vault);
        targets.push(address(handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return targets;
    }

    function invariantSupplyEqualsAccountedShares() public view {
        require(vault.totalSupply() == vault.balanceOf(address(handler)), "unaccounted shares");
    }

    function invariantNavEqualsVaultAssetBalance() public view {
        uint256 expectedNav =
            usdg.balanceOf(address(vault)) + stock.balanceOf(address(vault)) / 1e12;
        require(vault.totalAssets() == expectedNav, "NAV balance mismatch");
    }

    function invariantVaultCanHonorAllOutstandingShares() public view {
        uint256 liabilities = vault.previewRedeem(vault.totalSupply());
        require(liabilities <= vault.totalAssets(), "insolvent vault");
    }
}

contract VaultInvariantHandler {
    InvariantVaultToken private immutable usdg;
    InvariantStockToken private immutable stock;
    FloatsVault private immutable vault;

    constructor(InvariantVaultToken usdg_, InvariantStockToken stock_, FloatsVault vault_) {
        usdg = usdg_;
        stock = stock_;
        vault = vault_;
        usdg_.approve(address(vault_), type(uint256).max);
    }

    function deposit(uint96 amountSeed) external {
        uint256 amount = (uint256(amountSeed) % 1_000_000e6) + 1;
        usdg.mint(address(this), amount);
        vault.deposit(amount, address(this));
    }

    function redeem(uint256 shareSeed) external {
        uint256 redeemable = vault.maxRedeem(address(this));
        if (redeemable == 0) return;
        uint256 shares = (shareSeed % redeemable) + 1;
        vault.redeem(shares, address(this), address(this));
    }

    function redeemInKind(uint256 shareSeed) external {
        uint256 balance = vault.balanceOf(address(this));
        if (balance == 0) return;
        uint256 shares = (shareSeed % balance) + 1;
        vault.redeemInKind(shares, address(this), address(this));
    }

    function addStockToVault(uint96 amountSeed) external {
        uint256 amount = (uint256(amountSeed) % 1_000_000 ether) + 1;
        stock.mint(address(vault), amount);
    }
}

contract InvariantVaultToken is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract InvariantStockToken is ERC20 {
    constructor() ERC20("Floats Stock", "FSTK") { }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract InvariantVaultRegistry {
    address private immutable stock;

    constructor(address stock_) {
        stock = stock_;
    }

    function getTrackedTokens() external view returns (address[] memory tokens) {
        tokens = new address[](1);
        tokens[0] = stock;
    }
}

contract InvariantVaultOracle {
    function totalValue(address[] calldata, uint256[] calldata balances, uint256 idleUsdg)
        external
        pure
        returns (uint256)
    {
        uint256 value = idleUsdg * 1e12;
        for (uint256 i; i < balances.length; ++i) value += balances[i];
        return value;
    }
}
