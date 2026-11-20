// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { FUSDToFIPORouter } from "../src/fusd/FUSDToFIPORouter.sol";

contract FUSDToFIPORouterTest {
    TestToken private usdg;
    TestVault private fusd;
    TestVault private fipo;
    FUSDToFIPORouter private router;
    RouterUser private user;
    RouterUser private receiver;

    function setUp() external {
        usdg = new TestToken();
        fusd = new TestVault(IERC20(address(usdg)), "Floats Dollar", "fUSD");
        fipo = new TestVault(IERC20(address(usdg)), "Floats IPO Index", "fIPO");
        router = new FUSDToFIPORouter(fusd, fipo, address(this), address(0xBEEF));
        user = new RouterUser();
        receiver = new RouterUser();

        usdg.mint(address(user), 100e6);
        user.approve(IERC20(address(usdg)), address(fusd), type(uint256).max);
        user.deposit(fusd, 100e6);
        user.approve(IERC20(address(fusd)), address(router), type(uint256).max);
    }

    function testConvertsFusdToFipoAtomically() external {
        router.setConversionsPaused(false);
        uint256 shares = fusd.balanceOf(address(user)) / 2;
        (uint256 expectedAssets, uint256 expectedShares) = router.previewConvert(shares);

        (uint256 assets, uint256 mintedShares) = user.convert(
            router, shares, expectedAssets, expectedShares, address(receiver), block.timestamp
        );

        require(assets == expectedAssets, "unexpected assets");
        require(mintedShares == expectedShares, "unexpected shares");
        require(fipo.balanceOf(address(receiver)) == expectedShares, "receiver missing fIPO");
        require(fusd.balanceOf(address(router)) == 0, "router retained fUSD");
        require(usdg.balanceOf(address(router)) == 0, "router retained USDG");
    }

    function testEnforcesPauseDeadlineAndMinimumOutput() external {
        uint256 shares = fusd.balanceOf(address(user)) / 2;
        try user.convert(router, shares, 0, 0, address(receiver), block.timestamp) {
            revert("converted while paused");
        } catch (bytes memory reason) {
            _assertSelector(reason, FUSDToFIPORouter.ConversionPaused.selector);
        }

        router.setConversionsPaused(false);
        try user.convert(router, shares, 0, 0, address(receiver), block.timestamp - 1) {
            revert("converted after deadline");
        } catch (bytes memory reason) {
            _assertSelector(reason, FUSDToFIPORouter.DeadlineExpired.selector);
        }

        (uint256 expectedAssets,) = router.previewConvert(shares);
        try user.convert(
            router, shares, expectedAssets + 1, 0, address(receiver), block.timestamp
        ) {
            revert("converted below minimum");
        } catch (bytes memory reason) {
            _assertSelector(reason, FUSDToFIPORouter.SlippageExceeded.selector);
        }
    }

    function testGuardianCanPauseButCannotUnpause() external {
        RouterUser guardian = new RouterUser();
        FUSDToFIPORouter guarded =
            new FUSDToFIPORouter(fusd, fipo, address(this), address(guardian));

        guarded.setConversionsPaused(false);
        guardian.setPaused(guarded, true);
        require(guarded.conversionsPaused(), "guardian did not pause");

        try guardian.setPaused(guarded, false) {
            revert("guardian unpaused");
        } catch (bytes memory reason) {
            _assertSelector(reason, FUSDToFIPORouter.GuardianCannotUnpause.selector);
        }
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing selector");
        bytes4 actual;
        assembly ("memory-safe") {
            actual := mload(add(reason, 0x20))
        }
        require(actual == expected, "unexpected selector");
    }
}

contract RouterUser {
    function approve(IERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function deposit(TestVault vault, uint256 assets) external {
        vault.deposit(assets, address(this));
    }

    function convert(
        FUSDToFIPORouter router,
        uint256 shares,
        uint256 minimumUsdg,
        uint256 minimumFipoShares,
        address receiver,
        uint256 deadline
    ) external returns (uint256 assets, uint256 fipoShares) {
        return router.convert(shares, minimumUsdg, minimumFipoShares, receiver, deadline);
    }

    function setPaused(FUSDToFIPORouter router, bool paused) external {
        router.setConversionsPaused(paused);
    }
}

contract TestToken is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address receiver, uint256 amount) external {
        _mint(receiver, amount);
    }
}

contract TestVault is ERC4626 {
    constructor(IERC20 asset_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(asset_)
    { }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }
}
