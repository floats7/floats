// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SwapAdapter } from "../src/swap/SwapAdapter.sol";

contract SwapAdapterTest {
    SwapAdapter private adapter;
    MockQuoteOracle private oracle;
    MockSwapRouter private router;
    MockSwapToken private tokenIn;
    MockSwapToken private tokenOut;
    SwapAdapter.Route private route;

    function setUp() public {
        oracle = new MockQuoteOracle();
        router = new MockSwapRouter();
        tokenIn = new MockSwapToken();
        tokenOut = new MockSwapToken();
        adapter = new SwapAdapter(address(this), address(oracle));

        route = SwapAdapter.Route({
            router: address(router),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            selector: MockSwapRouter.swap.selector
        });

        adapter.setExecutor(address(this), true);
        adapter.setRoute(route, true);
        oracle.setQuote(200 ether);
        tokenIn.mint(address(this), 100 ether);
        tokenIn.approve(address(adapter), type(uint256).max);
        tokenOut.mint(address(router), 1000 ether);
    }

    function testExecutesAllowedRouteWithExactApprovalCleanup() public {
        bytes memory data = abi.encodeCall(
            MockSwapRouter.swap,
            (address(tokenIn), address(tokenOut), address(adapter), 100 ether, 198 ether)
        );

        uint256 amountOut = adapter.executeSwap(route, 100 ether, 100, address(this), data);

        _assertEq(amountOut, 198 ether, "amount out");
        _assertEq(tokenOut.balanceOf(address(this)), 198 ether, "recipient output");
        _assertEq(tokenIn.allowance(address(adapter), address(router)), 0, "allowance cleared");
        _assertEq(tokenIn.balanceOf(address(adapter)), 0, "input residue");
    }

    function testRejectsOutputBelowOracleMinimum() public {
        bytes memory data = abi.encodeCall(
            MockSwapRouter.swap,
            (address(tokenIn), address(tokenOut), address(adapter), 100 ether, 197 ether)
        );

        try adapter.executeSwap(route, 100 ether, 100, address(this), data) {
            revert("expected minimum output revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.OutputBelowMinimum.selector);
        }
    }

    function testRejectsUnapprovedRoute() public {
        SwapAdapter.Route memory changed = route;
        changed.tokenOut = address(new MockSwapToken());

        try adapter.executeSwap(changed, 1 ether, 100, address(this), hex"12345678") {
            revert("expected route revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.RouteNotAllowed.selector);
        }
    }

    function testRejectsSelectorMismatch() public {
        try adapter.executeSwap(route, 1 ether, 100, address(this), hex"12345678") {
            revert("expected selector revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.RouteNotAllowed.selector);
        }
    }

    function testRejectsExcessiveSlippage() public {
        try adapter.executeSwap(route, 1 ether, 501, address(this), hex"12345678") {
            revert("expected slippage revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.InvalidSlippage.selector);
        }
    }

    function testOnlyExecutorCanSwap() public {
        UnauthorizedSwapCaller caller = new UnauthorizedSwapCaller();

        try caller.execute(adapter, route) {
            revert("expected executor revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.NotExecutor.selector);
        }
    }

    function testFuzzRejectsSlippageAboveCap(uint16 slippageSeed) public {
        uint16 slippage = uint16(501 + (uint256(slippageSeed) % (type(uint16).max - 500)));
        try adapter.executeSwap(route, 1 ether, slippage, address(this), hex"12345678") {
            revert("expected slippage revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.InvalidSlippage.selector);
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

contract MockQuoteOracle {
    uint256 private quotedAmount;

    function setQuote(uint256 amount) external {
        quotedAmount = amount;
    }

    function quote(address, address, uint256) external view returns (uint256) {
        return quotedAmount;
    }
}

contract MockSwapRouter {
    function swap(
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 amountIn,
        uint256 amountOut
    ) external {
        MockSwapToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockSwapToken(tokenOut).transfer(recipient, amountOut);
    }
}

contract MockSwapToken {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    function mint(address recipient, uint256 amount) external {
        balanceOf[recipient] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool)
    {
        uint256 approved = allowance[sender][msg.sender];
        require(approved >= amount, "allowance");
        allowance[sender][msg.sender] = approved - amount;
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) private {
        require(balanceOf[sender] >= amount, "balance");
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
    }
}

contract UnauthorizedSwapCaller {
    function execute(SwapAdapter adapter, SwapAdapter.Route memory route) external {
        adapter.executeSwap(route, 1, 0, address(this), hex"12345678");
    }
}
