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

    function testRejectsInvalidExecutionInputs() public {
        _expectSwapRevert(route, 0, 0, address(this), hex"12345678", SwapAdapter.InvalidAmount.selector);
        _expectSwapRevert(route, 1, 0, address(0), hex"12345678", SwapAdapter.InvalidAddress.selector);
        _expectSwapRevert(route, 1, 0, address(this), hex"", SwapAdapter.EmptyCalldata.selector);

        oracle.setQuote(0);
        bytes memory data = abi.encodeCall(
            MockSwapRouter.swap,
            (address(tokenIn), address(tokenOut), address(adapter), 1 ether, 1 ether)
        );
        _expectSwapRevert(route, 1 ether, 0, address(this), data, SwapAdapter.InvalidAmount.selector);
    }

    function testRejectsInvalidAdministration() public {
        try new SwapAdapter(address(0), address(oracle)) {
            revert("expected constructor revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.InvalidAddress.selector);
        }
        try adapter.setExecutor(address(0), true) {
            revert("expected executor address revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.InvalidAddress.selector);
        }

        SwapAdapter.Route memory invalid = route;
        invalid.tokenOut = invalid.tokenIn;
        try adapter.setRoute(invalid, true) {
            revert("expected route address revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.InvalidAddress.selector);
        }

        UnauthorizedSwapCaller caller = new UnauthorizedSwapCaller();
        try caller.setExecutor(adapter, address(caller), true) {
            revert("expected executor admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.NotAdmin.selector);
        }
        try caller.setRoute(adapter, route, true) {
            revert("expected route admin revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.NotAdmin.selector);
        }
    }

    function testRejectsApprovalAndInputTransferFailures() public {
        tokenIn.setFailTransferFrom(true);
        _expectSuccessfulRouteRevert(SwapAdapter.TokenTransferFailed.selector);

        tokenIn.setFailTransferFrom(false);
        tokenIn.setFailApprove(true);
        _expectSuccessfulRouteRevert(SwapAdapter.ApprovalFailed.selector);
    }

    function testRejectsOutputTransferFailure() public {
        tokenOut.setBlockedTransferSender(address(adapter));
        _expectSuccessfulRouteRevert(SwapAdapter.TokenTransferFailed.selector);
    }

    function testRejectsRouterFailure() public {
        SwapAdapter.Route memory failingRoute = route;
        failingRoute.selector = MockSwapRouter.fail.selector;
        adapter.setRoute(failingRoute, true);
        _expectSwapRevert(
            failingRoute,
            1 ether,
            0,
            address(this),
            abi.encodeCall(MockSwapRouter.fail, ()),
            SwapAdapter.RouterCallFailed.selector
        );
    }

    function testRejectsUnexpectedInputResidue() public {
        SwapAdapter.Route memory residueRoute = route;
        residueRoute.selector = MockSwapRouter.leaveInput.selector;
        adapter.setRoute(residueRoute, true);
        bytes memory data = abi.encodeCall(
            MockSwapRouter.leaveInput,
            (address(tokenOut), address(adapter), 200 ether)
        );
        _expectSwapRevert(
            residueRoute,
            100 ether,
            0,
            address(this),
            data,
            SwapAdapter.UnexpectedInputBalance.selector
        );
    }

    function testRejectsOutputBalanceDecrease() public {
        tokenOut.mint(address(adapter), 1 ether);
        SwapAdapter.Route memory decreasingRoute = route;
        decreasingRoute.selector = MockSwapRouter.decreaseOutput.selector;
        adapter.setRoute(decreasingRoute, true);
        bytes memory data = abi.encodeCall(
            MockSwapRouter.decreaseOutput,
            (address(tokenIn), address(tokenOut), address(adapter), 100 ether, 1 ether)
        );
        _expectSwapRevert(
            decreasingRoute,
            100 ether,
            0,
            address(this),
            data,
            SwapAdapter.BalanceDecreased.selector
        );
    }

    function testReentrantRouterCallIsRejected() public {
        SwapAdapter.Route memory reentrantRoute = route;
        reentrantRoute.selector = MockSwapRouter.reenter.selector;
        adapter.setRoute(reentrantRoute, true);
        adapter.setExecutor(address(router), true);
        bytes memory data = abi.encodeCall(
            MockSwapRouter.reenter,
            (adapter, reentrantRoute, address(this))
        );

        try adapter.executeSwap(reentrantRoute, 1 ether, 0, address(this), data) {
            revert("expected reentrancy revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, SwapAdapter.RouterCallFailed.selector);
            _assertNestedSelector(reason, SwapAdapter.Reentrancy.selector);
        }
    }

    function _expectSuccessfulRouteRevert(bytes4 selector) private {
        bytes memory data = abi.encodeCall(
            MockSwapRouter.swap,
            (address(tokenIn), address(tokenOut), address(adapter), 100 ether, 200 ether)
        );
        _expectSwapRevert(route, 100 ether, 0, address(this), data, selector);
    }

    function _expectSwapRevert(
        SwapAdapter.Route memory selectedRoute,
        uint256 amountIn,
        uint16 slippage,
        address recipient,
        bytes memory data,
        bytes4 selector
    ) private {
        try adapter.executeSwap(selectedRoute, amountIn, slippage, recipient, data) {
            revert("expected swap revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, selector);
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

    function _assertNestedSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 100, "missing nested revert selector");
        bytes4 actual;
        assembly ("memory-safe") {
            actual := mload(add(reason, 0x64))
        }
        require(actual == expected, "unexpected nested revert selector");
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
    error ExpectedFailure();

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

    function fail() external pure {
        revert ExpectedFailure();
    }

    function leaveInput(address tokenOut, address recipient, uint256 amountOut) external {
        MockSwapToken(tokenOut).transfer(recipient, amountOut);
    }

    function decreaseOutput(
        address tokenIn,
        address tokenOut,
        address recipient,
        uint256 amountIn,
        uint256 amountToBurn
    ) external {
        MockSwapToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockSwapToken(tokenOut).burn(recipient, amountToBurn);
    }

    function reenter(
        SwapAdapter adapter,
        SwapAdapter.Route calldata route,
        address recipient
    ) external {
        adapter.executeSwap(route, 1, 0, recipient, abi.encodePacked(route.selector));
    }
}

contract MockSwapToken {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    bool private failApprove;
    bool private failTransferFrom;
    address private blockedTransferSender;

    function mint(address recipient, uint256 amount) external {
        balanceOf[recipient] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (failApprove) return false;
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (msg.sender == blockedTransferSender) return false;
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool)
    {
        if (failTransferFrom) return false;
        uint256 approved = allowance[sender][msg.sender];
        require(approved >= amount, "allowance");
        allowance[sender][msg.sender] = approved - amount;
        _transfer(sender, recipient, amount);
        return true;
    }

    function burn(address account, uint256 amount) external {
        require(balanceOf[account] >= amount, "burn balance");
        balanceOf[account] -= amount;
    }

    function setFailApprove(bool value) external {
        failApprove = value;
    }

    function setFailTransferFrom(bool value) external {
        failTransferFrom = value;
    }

    function setBlockedTransferSender(address sender) external {
        blockedTransferSender = sender;
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

    function setExecutor(SwapAdapter adapter, address executor, bool allowed) external {
        adapter.setExecutor(executor, allowed);
    }

    function setRoute(SwapAdapter adapter, SwapAdapter.Route memory route, bool allowed) external {
        adapter.setRoute(route, allowed);
    }
}
