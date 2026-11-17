// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { HolderTest } from "../src/verification/HolderTest.sol";

contract HolderTestTest {
    HolderTest private holder;
    MockRouter private router;
    MockToken private token;

    function setUp() public {
        router = new MockRouter();
        holder = new HolderTest(address(this), address(router));
        token = new MockToken();
        token.mint(address(holder), 100 ether);
    }

    function testConstructorRejectsZeroOwner() public {
        try new HolderTest(address(0), address(router)) returns (HolderTest) {
            revert("expected constructor revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.InvalidAddress.selector);
        }
    }

    function testConstructorRejectsZeroRouter() public {
        try new HolderTest(address(this), address(0)) returns (HolderTest) {
            revert("expected constructor revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.InvalidAddress.selector);
        }
    }

    function testTransferToken() public {
        address recipient = address(0xBEEF);
        holder.transferToken(address(token), recipient, 25 ether);

        _assertEq(token.balanceOf(recipient), 25 ether, "recipient balance");
        _assertEq(token.balanceOf(address(holder)), 75 ether, "holder balance");
    }

    function testTransferTokenRejectsFalseReturn() public {
        token.setReturnFalse(true);

        try holder.transferToken(address(token), address(0xBEEF), 1 ether) {
            revert("expected transfer revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.TransferFailed.selector);
        }
    }

    function testApproveRouter() public {
        holder.approveRouter(address(token), 12 ether);
        _assertEq(token.allowance(address(holder), address(router)), 12 ether, "router allowance");
    }

    function testApproveRouterRejectsFalseReturn() public {
        token.setReturnFalse(true);

        try holder.approveRouter(address(token), 1 ether) {
            revert("expected approval revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.ApprovalFailed.selector);
        }
    }

    function testCallRouter() public {
        bytes memory result = holder.callRouter(abi.encodeCall(MockRouter.quote, (7)));
        _assertEq(abi.decode(result, (uint256)), 14, "router result");
    }

    function testCallRouterPropagatesFailureData() public {
        try holder.callRouter(abi.encodeCall(MockRouter.fail, ())) {
            revert("expected router revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.RouterCallFailed.selector);
        }
    }

    function testCallRouterRejectsShortCalldata() public {
        try holder.callRouter(hex"123456") {
            revert("expected calldata revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.RouterCallFailed.selector);
        }
    }

    function testOnlyOwnerCanTransfer() public {
        UnauthorizedCaller caller = new UnauthorizedCaller();

        try caller.transferToken(holder, address(token), address(0xBEEF), 1 ether) {
            revert("expected owner check revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.NotOwner.selector);
        }
    }

    function testOnlyOwnerCanApprove() public {
        UnauthorizedCaller caller = new UnauthorizedCaller();

        try caller.approveRouter(holder, address(token), 1 ether) {
            revert("expected owner check revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.NotOwner.selector);
        }
    }

    function testOnlyOwnerCanCallRouter() public {
        UnauthorizedCaller caller = new UnauthorizedCaller();

        try caller.callRouter(holder, abi.encodeCall(MockRouter.quote, (1))) {
            revert("expected owner check revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, HolderTest.NotOwner.selector);
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

contract UnauthorizedCaller {
    function transferToken(HolderTest holder, address token, address recipient, uint256 amount)
        external
    {
        holder.transferToken(token, recipient, amount);
    }

    function approveRouter(HolderTest holder, address token, uint256 amount) external {
        holder.approveRouter(token, amount);
    }

    function callRouter(HolderTest holder, bytes calldata data) external returns (bytes memory) {
        return holder.callRouter(data);
    }
}

contract MockRouter {
    error ExpectedFailure();

    function quote(uint256 amount) external pure returns (uint256) {
        return amount * 2;
    }

    function fail() external pure {
        revert ExpectedFailure();
    }
}

contract MockToken {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    bool private returnFalse;

    function mint(address recipient, uint256 amount) external {
        balanceOf[recipient] += amount;
    }

    function setReturnFalse(bool value) external {
        returnFalse = value;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (returnFalse) return false;
        require(balanceOf[msg.sender] >= amount, "insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (returnFalse) return false;
        allowance[msg.sender][spender] = amount;
        return true;
    }
}
