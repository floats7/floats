// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Swap {
    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface ISwapQuoteOracle {
    /// @notice Returns expected tokenOut units for amountIn tokenIn units.
    function quote(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 expectedOut);
}

/// @title SwapAdapter
/// @notice Executes only explicitly approved router selectors and token pairs.
contract SwapAdapter {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_SLIPPAGE_BPS = 500;

    struct Route {
        address router;
        address tokenIn;
        address tokenOut;
        bytes4 selector;
    }

    error ApprovalFailed(address token, address spender, uint256 amount);
    error BalanceDecreased(address token);
    error EmptyCalldata();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidSlippage(uint16 slippageBps);
    error NotAdmin(address caller);
    error NotExecutor(address caller);
    error OutputBelowMinimum(uint256 actualOut, uint256 minimumOut);
    error RouteNotAllowed(bytes32 routeKey);
    error RouterCallFailed(bytes returnData);
    error TokenTransferFailed(address token);
    error UnexpectedInputBalance(uint256 remaining);
    error Reentrancy();

    event ExecutorSet(address indexed executor, bool allowed);
    event RouteSet(
        bytes32 indexed routeKey,
        address indexed router,
        address indexed tokenIn,
        address tokenOut,
        bytes4 selector,
        bool allowed
    );
    event SwapExecuted(
        bytes32 indexed routeKey,
        address indexed recipient,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minimumOut
    );

    address public immutable admin;
    ISwapQuoteOracle public immutable quoteOracle;

    mapping(address executor => bool allowed) public isExecutor;
    mapping(bytes32 routeKey => bool allowed) public isRouteAllowed;
    uint256 private unlocked = 1;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    modifier onlyExecutor() {
        if (!isExecutor[msg.sender]) revert NotExecutor(msg.sender);
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address admin_, address quoteOracle_) {
        if (admin_ == address(0) || quoteOracle_ == address(0)) revert InvalidAddress();
        admin = admin_;
        quoteOracle = ISwapQuoteOracle(quoteOracle_);
    }

    function setExecutor(address executor, bool allowed) external onlyAdmin {
        if (executor == address(0)) revert InvalidAddress();
        // ExecutorSet is emitted immediately below; this explicit waiver documents the ACL change.
        // forge-lint: disable-next-line(missing-events-access-control)
        isExecutor[executor] = allowed;
        emit ExecutorSet(executor, allowed);
    }

    function setRoute(Route calldata route, bool allowed) external onlyAdmin {
        if (
            route.router == address(0) || route.tokenIn == address(0)
                || route.tokenOut == address(0) || route.tokenIn == route.tokenOut
                || route.selector == bytes4(0)
        ) revert InvalidAddress();

        bytes32 key = routeKey(route);
        isRouteAllowed[key] = allowed;
        emit RouteSet(key, route.router, route.tokenIn, route.tokenOut, route.selector, allowed);
    }

    function executeSwap(
        Route calldata route,
        uint256 amountIn,
        uint16 slippageBps,
        address recipient,
        bytes calldata routerCalldata
    ) external nonReentrant onlyExecutor returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidAddress();
        if (slippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage(slippageBps);
        if (routerCalldata.length < 4) revert EmptyCalldata();

        bytes32 key = routeKey(route);
        if (!isRouteAllowed[key]) revert RouteNotAllowed(key);
        if (bytes4(routerCalldata[:4]) != route.selector) revert RouteNotAllowed(key);

        uint256 expectedOut = quoteOracle.quote(route.tokenIn, route.tokenOut, amountIn);
        if (expectedOut == 0) revert InvalidAmount();
        uint256 minimumOut = expectedOut * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR;

        amountOut = _callRouter(route, amountIn, routerCalldata);
        if (amountOut < minimumOut) revert OutputBelowMinimum(amountOut, minimumOut);

        _safeTransfer(route.tokenOut, recipient, amountOut);
        emit SwapExecuted(key, recipient, amountIn, amountOut, minimumOut);
    }

    function routeKey(Route calldata route) public pure returns (bytes32) {
        return keccak256(abi.encode(route.router, route.tokenIn, route.tokenOut, route.selector));
    }

    function _callRouter(Route calldata route, uint256 amountIn, bytes calldata routerCalldata)
        private
        returns (uint256 amountOut)
    {
        _safeTransferFrom(route.tokenIn, msg.sender, address(this), amountIn);
        _safeApprove(route.tokenIn, route.router, 0);
        _safeApprove(route.tokenIn, route.router, amountIn);

        uint256 outputBefore = IERC20Swap(route.tokenOut).balanceOf(address(this));
        // executeSwap holds the adapter's nonReentrant lock across this router call.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        (bool success, bytes memory returnData) = route.router.call(routerCalldata);
        if (!success) revert RouterCallFailed(returnData);

        _safeApprove(route.tokenIn, route.router, 0);
        uint256 outputAfter = IERC20Swap(route.tokenOut).balanceOf(address(this));
        if (outputAfter < outputBefore) revert BalanceDecreased(route.tokenOut);

        uint256 remainingInput = IERC20Swap(route.tokenIn).balanceOf(address(this));
        if (remainingInput != 0) revert UnexpectedInputBalance(remainingInput);
        return outputAfter - outputBefore;
    }

    function _safeApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory data) =
            // Called only from executeSwap while its nonReentrant lock is held.
            // forge-lint: disable-next-line(reentrancy-no-eth)
            token.call(abi.encodeCall(IERC20Swap.approve, (spender, amount)));
        if (!success || !_successfulReturn(data)) revert ApprovalFailed(token, spender, amount);
    }

    function _safeTransfer(address token, address recipient, uint256 amount) private {
        (bool success, bytes memory data) =
            // Called only from executeSwap while its nonReentrant lock is held.
            // forge-lint: disable-next-line(reentrancy-no-eth)
            token.call(abi.encodeCall(IERC20Swap.transfer, (recipient, amount)));
        if (!success || !_successfulReturn(data)) revert TokenTransferFailed(token);
    }

    function _safeTransferFrom(address token, address sender, address recipient, uint256 amount)
        private
    {
        (bool success, bytes memory data) =
            // Called only from executeSwap while its nonReentrant lock is held.
            // forge-lint: disable-next-line(reentrancy-no-eth)
            token.call(abi.encodeCall(IERC20Swap.transferFrom, (sender, recipient, amount)));
        if (!success || !_successfulReturn(data)) revert TokenTransferFailed(token);
    }

    function _successfulReturn(bytes memory data) private pure returns (bool) {
        return data.length == 0 || (data.length == 32 && abi.decode(data, (bool)));
    }
}
