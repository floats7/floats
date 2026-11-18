// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { OptionToken } from "../src/options/OptionToken.sol";

contract OptionTokenTest {
    OptionToken private token;
    OptionHolder private holder;

    function setUp() public {
        token = new OptionToken(address(this), "ipfs://floats-options/{id}.json");
        holder = new OptionHolder();
        token.setMarket(address(this));
    }

    function testMarketMintsAndBurnsPositions() public {
        token.mint(address(holder), 7, 3e18);
        require(token.balanceOf(address(holder), 7) == 3e18, "mint balance mismatch");

        token.burn(address(holder), 7, 1e18);
        require(token.balanceOf(address(holder), 7) == 2e18, "burn balance mismatch");
    }

    function testPositionTransfersAreDisabled() public {
        token.mint(address(holder), 7, 1e18);
        try holder.transfer(token, address(0xBEEF), 7, 1e18) {
            revert("expected transfer revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, OptionToken.TransfersDisabled.selector);
        }
    }

    function testMarketCanOnlyBeSetOnce() public {
        try token.setMarket(address(0xBEEF)) {
            revert("expected market lock revert");
        } catch (bytes memory reason) {
            _assertSelector(reason, OptionToken.MarketAlreadySet.selector);
        }
    }

    function _assertSelector(bytes memory reason, bytes4 expected) private pure {
        require(reason.length >= 4, "missing selector");
        bytes4 actual;
        assembly {
            actual := mload(add(reason, 32))
        }
        require(actual == expected, "selector mismatch");
    }
}

contract OptionHolder is IERC1155Receiver {
    function transfer(OptionToken token, address recipient, uint256 id, uint256 amount) external {
        token.safeTransferFrom(address(this), recipient, id, amount, "");
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }
}
