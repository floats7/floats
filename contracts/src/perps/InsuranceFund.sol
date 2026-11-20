// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract InsuranceFund is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidAddress();
    error InvalidAmount();
    error Unauthorized();

    event OperatorSet(address indexed operator, bool allowed);
    event Funded(address indexed sender, uint256 assets);
    event BadDebtCovered(address indexed receiver, uint256 assets);
    event Recovered(address indexed receiver, uint256 assets);

    IERC20 public immutable collateralToken;
    address public immutable admin;
    mapping(address operator => bool allowed) public isOperator;

    constructor(address collateralToken_, address admin_) {
        if (collateralToken_ == address(0) || admin_ == address(0)) revert InvalidAddress();
        collateralToken = IERC20(collateralToken_);
        admin = admin_;
    }

    function fund(uint256 assets) external nonReentrant {
        if (assets == 0) revert InvalidAmount();
        collateralToken.safeTransferFrom(msg.sender, address(this), assets);
        emit Funded(msg.sender, assets);
    }

    function coverBadDebt(address receiver, uint256 assets) external nonReentrant {
        if (!isOperator[msg.sender]) revert Unauthorized();
        if (receiver == address(0)) revert InvalidAddress();
        if (assets == 0) revert InvalidAmount();
        uint256 available = collateralToken.balanceOf(address(this));
        if (assets > available) revert InsufficientBalance(available, assets);
        collateralToken.safeTransfer(receiver, assets);
        emit BadDebtCovered(receiver, assets);
    }

    function recover(address receiver, uint256 assets) external nonReentrant {
        if (msg.sender != admin) revert Unauthorized();
        if (receiver == address(0)) revert InvalidAddress();
        if (assets == 0) revert InvalidAmount();
        collateralToken.safeTransfer(receiver, assets);
        emit Recovered(receiver, assets);
    }

    function setOperator(address operator, bool allowed) external {
        if (msg.sender != admin) revert Unauthorized();
        if (operator == address(0)) revert InvalidAddress();
        // The adjacent OperatorSet event provides the access-control audit trail.
        // forge-lint: disable-next-line(missing-events-access-control)
        isOperator[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }
}
