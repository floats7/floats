// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface MainnetForkVm {
    function prank(address sender) external;
}

interface IForkErc20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

interface IForkFeed {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

interface IForkSwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

contract MainnetLiquidityForkTest {
    MainnetForkVm private constant vm =
        MainnetForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address private constant SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;

    address private constant CRCL = 0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5;
    address private constant CRCL_FEED = 0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a;
    address private constant CRCL_POOL = 0x654E4143e82a5824445Ade0824351C2A9ACD95a8;

    address private constant SPCX = 0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa;
    address private constant SPCX_FEED = 0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb;
    address private constant SPCX_POOL = 0xc61284332117c3FB23A2A56cceFFD07F7aF60029;

    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_IMPACT_BPS = 200;

    function testCrclRouteExecutesBothDirectionsWithinTwoPercent() public {
        _verifyRoute(CRCL, CRCL_FEED, CRCL_POOL, 3000, 10_000e6);
    }

    function testSpcxRouteExecutesBothDirectionsWithinTwoPercent() public {
        _verifyRoute(SPCX, SPCX_FEED, SPCX_POOL, 500, 100_000e6);
    }

    function _verifyRoute(
        address token,
        address feed,
        address pool,
        uint24 fee,
        uint256 usdgNotional
    ) private {
        require(block.chainid == 4663, "wrong fork chain");
        uint256 oraclePrice = _oraclePrice(feed);
        uint256 tokenNotional = (usdgNotional * 1e20) / oraclePrice;

        _fundFromPool(USDG, pool, usdgNotional);
        uint256 tokenBefore = IForkErc20(token).balanceOf(address(this));
        uint256 bought =
            _swap(USDG, token, fee, usdgNotional, (tokenNotional * (BPS - MAX_IMPACT_BPS)) / BPS);
        require(
            bought == IForkErc20(token).balanceOf(address(this)) - tokenBefore,
            "buy balance mismatch"
        );

        _fundFromPool(token, pool, tokenNotional);
        uint256 usdgBefore = IForkErc20(USDG).balanceOf(address(this));
        uint256 sold =
            _swap(token, USDG, fee, tokenNotional, (usdgNotional * (BPS - MAX_IMPACT_BPS)) / BPS);
        require(
            sold == IForkErc20(USDG).balanceOf(address(this)) - usdgBefore, "sell balance mismatch"
        );
    }

    function _fundFromPool(address token, address pool, uint256 amount) private {
        vm.prank(pool);
        require(IForkErc20(token).transfer(address(this), amount), "pool funding transfer failed");
    }

    function _swap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 minimumOut
    ) private returns (uint256) {
        require(IForkErc20(tokenIn).approve(SWAP_ROUTER_02, amountIn), "router approval failed");
        return IForkSwapRouter02(SWAP_ROUTER_02)
            .exactInputSingle(
                IForkSwapRouter02.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: fee,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: minimumOut,
                    sqrtPriceLimitX96: 0
                })
            );
    }

    function _oraclePrice(address feed) private view returns (uint256) {
        (, int256 answer,,,) = IForkFeed(feed).latestRoundData();
        require(answer > 0, "invalid oracle answer");
        return uint256(answer);
    }
}
