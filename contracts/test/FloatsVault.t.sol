// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { FloatsVault, IFloatsIndexRegistry, IFloatsNavOracle } from "../src/core/FloatsVault.sol";
import { FeeModule, IFeeShareVault } from "../src/fees/FeeModule.sol";

contract FloatsVaultTest {
    address private constant TREASURY = address(0xBEEF);
    MockVaultToken private usdg;
    MockVaultToken private stock;
    MockVaultRegistry private registry;
    MockVaultNavOracle private oracle;
    FloatsVault private vault;

    function setUp() public {
        usdg = new MockVaultToken("USDG", "USDG", 6);
        stock = new MockVaultToken("Stock", "STK", 18);
        registry = new MockVaultRegistry();
        oracle = new MockVaultNavOracle();
        vault = new FloatsVault(
            IERC20(address(usdg)),
            address(this),
            address(this),
            IFloatsIndexRegistry(address(registry)),
            IFloatsNavOracle(address(oracle)),
            1_000_000e6,
            "Floats IPO Index",
            "fIPO"
        );

        usdg.mint(address(this), 1000e6);
        usdg.approve(address(vault), type(uint256).max);
    }

    function testDepositUsesEighteenDecimalShares() public {
        uint256 shares = vault.deposit(100e6, address(this));
        _assertEq(shares, 100 ether, "shares");
        _assertEq(vault.totalAssets(), 100e6, "assets");
    }

    function testDepositPauseDoesNotBlockCashExit() public {
        vault.deposit(100e6, address(this));
        vault.setDepositsPaused(true);

        try vault.deposit(1e6, address(this)) {
            revert("expected deposit pause");
        } catch (bytes memory reason) {
            _assertSelector(reason, ERC4626.ERC4626ExceededMaxDeposit.selector);
        }

        vault.redeem(10 ether, address(this), address(this));
        _assertEq(vault.balanceOf(address(this)), 90 ether, "remaining shares");
    }

    function testTotalAssetsIncludesTrackedStock() public {
        vault.deposit(100e6, address(this));
        registry.setTrackedToken(address(stock));
        stock.mint(address(vault), 25 ether);

        _assertEq(vault.totalAssets(), 125e6, "nav assets");
    }

    function testInKindExitWorksWithTrackedStock() public {
        vault.deposit(100e6, address(this));
        registry.setTrackedToken(address(stock));
        stock.mint(address(vault), 20 ether);

        (address[] memory tokens, uint256[] memory amounts) =
            vault.redeemInKind(50 ether, address(this), address(this));

        _assertEq(tokens.length, 2, "token count");
        _assertEq(amounts[0], 50e6, "usdg amount");
        _assertEq(amounts[1], 10 ether, "stock amount");
        _assertEq(vault.balanceOf(address(this)), 50 ether, "remaining shares");
    }

    function testTvlCapLimitsDeposits() public {
        vault.setTvlCap(50e6);
        _assertEq(vault.maxDeposit(address(this)), 50e6, "available cap");
    }

    function testFuzzDepositRedeemRoundTrip(uint96 amountSeed) public {
        uint256 amount = (uint256(amountSeed) % 1000e6) + 1;
        uint256 balanceBefore = usdg.balanceOf(address(this));

        uint256 shares = vault.deposit(amount, address(this));
        uint256 assetsOut = vault.redeem(shares, address(this), address(this));

        _assertEq(assetsOut, amount, "round-trip assets");
        _assertEq(usdg.balanceOf(address(this)), balanceBefore, "round-trip balance");
        _assertEq(vault.totalSupply(), 0, "round-trip supply");
    }

    function testOnlyConfiguredFeeModuleCanMintShares() public {
        try vault.mintFeeShares(address(this), 1 ether) {
            revert("expected fee module revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, FloatsVault.NotFeeModule.selector);
        }

        vault.setFeeModule(address(this));
        vault.mintFeeShares(address(0xBEEF), 1 ether);
        _assertEq(vault.balanceOf(address(0xBEEF)), 1 ether, "fee shares");
    }

    function testCashDepositPreviewMatchesExecutionAndPaysTreasury() public {
        _configureTransactionFees(100, 0);

        uint256 preview = vault.previewDeposit(100e6);
        uint256 shares = vault.deposit(100e6, address(this));

        _assertEq(preview, 99 ether, "preview shares");
        _assertEq(shares, preview, "executed shares");
        _assertEq(usdg.balanceOf(TREASURY), 1e6, "treasury cash fee");
        _assertEq(vault.totalAssets(), 99e6, "net vault assets");
    }

    function testCashRedeemPreviewMatchesExecutionAndPaysTreasury() public {
        vault.deposit(100e6, address(this));
        _configureTransactionFees(100, 0);

        uint256 preview = vault.previewRedeem(50 ether);
        uint256 treasuryBefore = usdg.balanceOf(TREASURY);
        uint256 assets = vault.redeem(50 ether, address(this), address(this));

        _assertEq(assets, preview, "executed assets");
        _assertEq(assets, 49_500_000, "net redeem assets");
        _assertEq(usdg.balanceOf(TREASURY) - treasuryBefore, 500_000, "treasury redeem fee");
    }

    function testInKindFeeTransfersSharesToTreasuryAndUsesNetShares() public {
        vault.deposit(100e6, address(this));
        registry.setTrackedToken(address(stock));
        stock.mint(address(vault), 20 ether);
        _configureTransactionFees(0, 100);

        (, uint256[] memory amounts) =
            vault.redeemInKind(50 ether, address(this), address(this));

        _assertEq(vault.balanceOf(TREASURY), 0.5 ether, "treasury share fee");
        _assertEq(amounts[0], 49.5e6, "net usdg amount");
        _assertEq(amounts[1], 9.9 ether, "net stock amount");
        _assertEq(vault.balanceOf(address(this)), 50 ether, "owner gross shares spent");
    }

    function testOffHoursBlocksCashButPreservesInKindExit() public {
        vault.deposit(100e6, address(this));
        registry.setTrackedToken(address(stock));
        stock.mint(address(vault), 20 ether);
        vault.setCashOperationsPaused(true);

        _assertEq(vault.maxDeposit(address(this)), 0, "cash deposit disabled");
        _assertEq(vault.maxRedeem(address(this)), 0, "cash redeem disabled");

        (address[] memory tokens, uint256[] memory amounts) =
            vault.redeemInKind(50 ether, address(this), address(this));
        _assertEq(tokens.length, 2, "in-kind token count");
        _assertEq(amounts[0], 50e6, "in-kind usdg");
        _assertEq(amounts[1], 10 ether, "in-kind stock");
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _configureTransactionFees(uint16 cashBps, uint16 inKindBps) private {
        FeeModule module = new FeeModule(
            address(this),
            IFeeShareVault(address(vault)),
            TREASURY,
            FeeModule.Rates({
                managementBps: 0,
                cashBps: cashBps,
                inKindBps: inKindBps,
                offHoursBps: 0
            })
        );
        vault.setFeeModule(address(module));
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

contract MockVaultToken is ERC20 {
    uint8 private immutable tokenDecimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract MockVaultRegistry {
    address[] private tokens;

    function setTrackedToken(address token) external {
        if (tokens.length == 0) tokens.push(token);
        else tokens[0] = token;
    }

    function getTrackedTokens() external view returns (address[] memory) {
        return tokens;
    }
}

contract MockVaultNavOracle {
    function totalValue(address[] calldata, uint256[] calldata balances, uint256 idleUsdg)
        external
        pure
        returns (uint256 value18)
    {
        value18 = idleUsdg * 1e12;
        for (uint256 i; i < balances.length; ++i) {
            value18 += balances[i];
        }
    }
}
