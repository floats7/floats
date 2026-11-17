// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HolderTest
/// @notice Phase 0 test harness for Stock Token contract-holding and router-call verification.
/// @dev Investigation-only contract. It must never hold production funds.
contract HolderTest {
    error ApprovalFailed(address token, address spender, uint256 amount);
    error InvalidAddress();
    error NotOwner(address caller);
    error RouterCallFailed(bytes returnData);
    error TransferFailed(address token, address recipient, uint256 amount);

    event RouterCalled(bytes4 indexed selector, bytes returnData);
    event TokenApprovalSet(address indexed token, address indexed spender, uint256 amount);
    event TokenTransferred(address indexed token, address indexed recipient, uint256 amount);

    address public immutable owner;
    address public immutable router;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    constructor(address owner_, address router_) {
        if (owner_ == address(0) || router_ == address(0)) revert InvalidAddress();
        owner = owner_;
        router = router_;
    }

    /// @notice Transfers a held token to a recipient to test contract-to-EOA/contract movement.
    function transferToken(address token, address recipient, uint256 amount) external onlyOwner {
        if (token == address(0) || recipient == address(0)) revert InvalidAddress();

        (bool success, bytes memory returnData) =
            token.call(abi.encodeCall(IERC20Minimal.transfer, (recipient, amount)));

        if (!success || !_isSuccessfulReturn(returnData)) {
            revert TransferFailed(token, recipient, amount);
        }

        // The harness has no mutable accounting state; emit only after the observed call succeeds.
        // forge-lint: disable-next-line(reentrancy-events)
        emit TokenTransferred(token, recipient, amount);
    }

    /// @notice Sets an exact router allowance for a test token.
    function approveRouter(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();

        (bool success, bytes memory returnData) =
            token.call(abi.encodeCall(IERC20Minimal.approve, (router, amount)));

        if (!success || !_isSuccessfulReturn(returnData)) {
            revert ApprovalFailed(token, router, amount);
        }

        // The harness has no mutable accounting state; emit only after the observed call succeeds.
        // forge-lint: disable-next-line(reentrancy-events)
        emit TokenApprovalSet(token, router, amount);
    }

    /// @notice Calls the immutable router with pre-encoded test calldata.
    /// @dev Arbitrary targets are deliberately unsupported. The owner remains responsible for calldata.
    function callRouter(bytes calldata data) external onlyOwner returns (bytes memory returnData) {
        if (data.length < 4) revert RouterCallFailed("");

        (bool success, bytes memory result) = router.call(data);
        if (!success) revert RouterCallFailed(result);

        bytes4 selector = bytes4(data[:4]);
        // The harness has no mutable accounting state; emit only after the observed call succeeds.
        // forge-lint: disable-next-line(reentrancy-events)
        emit RouterCalled(selector, result);
        return result;
    }

    function _isSuccessfulReturn(bytes memory returnData) private pure returns (bool) {
        return returnData.length == 0 || (returnData.length == 32 && abi.decode(returnData, (bool)));
    }
}

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address recipient, uint256 amount) external returns (bool);
}
