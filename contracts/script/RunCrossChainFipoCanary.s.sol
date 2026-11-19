// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import { IOFT, OFTReceipt, SendParam } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

interface RunCrossChainFipoCanaryVm {
    function addr(uint256 privateKey) external returns (address signer);
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Sends the bounded fIPO canary to the opposite rehearsal chain.
contract RunCrossChainFipoCanary {
    using OptionsBuilder for bytes;
    using SafeERC20 for IERC20;

    error AmountExceedsRateLimit(uint256 amount, uint256 capacity);
    error InvalidAmount();
    error InvalidReceiveGas(uint256 value);
    error UnsupportedChain(uint256 chainId);

    struct Configuration {
        IOFT oft;
        IERC20 underlying;
        uint32 destinationEid;
        uint256 amount;
        uint256 signerKey;
        uint128 receiveGas;
        bool approvalRequired;
    }

    RunCrossChainFipoCanaryVm private constant vm =
        RunCrossChainFipoCanaryVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (bytes32 guid, uint256 nativeFee, uint256 amountSent, uint256 amountReceived)
    {
        Configuration memory config = _configuration();
        address signer = vm.addr(config.signerKey);
        SendParam memory sendParam = SendParam({
            dstEid: config.destinationEid,
            to: bytes32(uint256(uint160(signer))),
            amountLD: config.amount,
            minAmountLD: config.amount,
            extraOptions: OptionsBuilder.newOptions()
                .addExecutorLzReceiveOption(config.receiveGas, 0),
            composeMsg: bytes(""),
            oftCmd: bytes("")
        });
        MessagingFee memory fee = config.oft.quoteSend(sendParam, false);

        vm.startBroadcast(config.signerKey);
        if (config.approvalRequired) {
            config.underlying.forceApprove(address(config.oft), config.amount);
        }
        (MessagingReceipt memory messagingReceipt, OFTReceipt memory oftReceipt) =
            config.oft.send{ value: fee.nativeFee }(sendParam, fee, signer);
        vm.stopBroadcast();

        return (
            messagingReceipt.guid,
            messagingReceipt.fee.nativeFee,
            oftReceipt.amountSentLD,
            oftReceipt.amountReceivedLD
        );
    }

    function _configuration() private returns (Configuration memory config) {
        uint256 hubChainId = vm.envUint("CROSSCHAIN_HUB_CHAIN_ID");
        uint256 spokeChainId = vm.envUint("CROSSCHAIN_SPOKE_CHAIN_ID");
        uint256 amount = vm.envUint("CROSSCHAIN_FIPO_CANARY_AMOUNT");
        uint256 capacity = vm.envUint("CROSSCHAIN_FIPO_OUTBOUND_CAPACITY");
        uint256 receiveGas = vm.envUint("CROSSCHAIN_LZ_RECEIVE_GAS");
        if (amount == 0) revert InvalidAmount();
        if (amount > capacity) revert AmountExceedsRateLimit(amount, capacity);
        if (receiveGas == 0 || receiveGas > type(uint128).max) {
            revert InvalidReceiveGas(receiveGas);
        }

        config.amount = amount;
        config.receiveGas = uint128(receiveGas);
        config.signerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        if (block.chainid == hubChainId) {
            config.oft = IOFT(vm.envAddress("CROSSCHAIN_HUB_FIPO_ADDRESS"));
            config.underlying = IERC20(config.oft.token());
            config.destinationEid = _uint32("CROSSCHAIN_SPOKE_EID");
            config.approvalRequired = true;
        } else if (block.chainid == spokeChainId) {
            config.oft = IOFT(vm.envAddress("CROSSCHAIN_SPOKE_FIPO_ADDRESS"));
            config.destinationEid = _uint32("CROSSCHAIN_HUB_EID");
        } else {
            revert UnsupportedChain(block.chainid);
        }
    }

    function _uint32(string memory name) private returns (uint32 value) {
        uint256 raw = vm.envUint(name);
        if (raw == 0 || raw > type(uint32).max) revert InvalidAmount();
        value = uint32(raw);
    }
}
