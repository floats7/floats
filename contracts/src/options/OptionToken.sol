// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract OptionToken is ERC1155 {
    error InvalidAddress();
    error Unauthorized();
    error MarketAlreadySet();
    error TransfersDisabled();

    event MarketSet(address indexed market);
    event SettlementEngineSet(address indexed settlementEngine);

    address public immutable admin;
    address public market;
    address public settlementEngine;

    constructor(address admin_, string memory metadataUri) ERC1155(metadataUri) {
        if (admin_ == address(0)) revert InvalidAddress();
        admin = admin_;
    }

    function setMarket(address market_) external {
        if (msg.sender != admin) revert Unauthorized();
        if (market_ == address(0)) revert InvalidAddress();
        if (market != address(0)) revert MarketAlreadySet();
        market = market_;
        emit MarketSet(market_);
    }

    function setSettlementEngine(address settlementEngine_) external {
        if (msg.sender != admin) revert Unauthorized();
        if (settlementEngine_ == address(0)) revert InvalidAddress();
        if (settlementEngine != address(0)) revert MarketAlreadySet();
        settlementEngine = settlementEngine_;
        emit SettlementEngineSet(settlementEngine_);
    }

    function mint(address account, uint256 seriesId, uint256 amount) external {
        _requireMarket();
        _mint(account, seriesId, amount, "");
    }

    function burn(address account, uint256 seriesId, uint256 amount) external {
        if (msg.sender != market && msg.sender != settlementEngine) revert Unauthorized();
        _burn(account, seriesId, amount);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0)) revert TransfersDisabled();
        super._update(from, to, ids, values);
    }

    function _requireMarket() private view {
        if (msg.sender != market || market == address(0)) revert Unauthorized();
    }
}
