// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {
    MessagingFee,
    MessagingParams,
    MessagingReceipt,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    ILayerZeroReceiver
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroReceiver.sol";
import { SendParam } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { CrossChainControls } from "../src/crosschain/CrossChainControls.sol";
import { ControlledOFT } from "../src/crosschain/ControlledOFT.sol";
import { ControlledOFTAdapter } from "../src/crosschain/ControlledOFTAdapter.sol";
import { NavMessage } from "../src/crosschain/NavMessage.sol";
import { NavMirror } from "../src/crosschain/NavMirror.sol";
import { NavPublisher } from "../src/crosschain/NavPublisher.sol";

interface VmCrossChain {
    function warp(uint256 newTimestamp) external;
}

contract CrossChainV1Test {
    VmCrossChain private constant vm =
        VmCrossChain(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint32 private constant REMOTE_EID = 43_002;
    bytes32 private constant REMOTE_PEER = bytes32(uint256(uint160(address(0xBEEF))));

    MockLayerZeroEndpoint private endpoint;
    GuardianActor private guardian;
    ControlledOFTHarness private token;
    NavMirror private mirror;

    function setUp() public {
        vm.warp(10_000);
        endpoint = new MockLayerZeroEndpoint();
        guardian = new GuardianActor();
        token = new ControlledOFTHarness(address(endpoint), address(this), address(guardian));
        mirror = new NavMirror(address(endpoint), address(this), 10 minutes);
        mirror.setPeer(REMOTE_EID, REMOTE_PEER);
    }

    function testGuardianPausesButCannotUnpause() public {
        guardian.pause(token);
        require(token.bridgePaused(), "bridge not paused");

        (bool success, bytes memory reason) = guardian.tryUnpause(token);
        require(!success, "guardian unpaused bridge");
        _assertSelector(reason, CrossChainControls.GovernanceOnly.selector);

        token.unpauseBridge();
        require(!token.bridgePaused(), "governance did not unpause");
    }

    function testPauseBlocksOutboundButAllowsVerifiedInbound() public {
        token.setRateLimit(REMOTE_EID, false, 10 ether, 1 hours);
        token.setRateLimit(REMOTE_EID, true, 10 ether, 1 hours);
        token.mint(address(this), 1 ether);
        guardian.pause(token);

        try token.debit(address(this), 1 ether, REMOTE_EID) {
            revert("paused outbound debit succeeded");
        } catch (bytes memory reason) {
            _assertSelector(reason, CrossChainControls.BridgePaused.selector);
        }
        token.credit(address(this), 1 ether, REMOTE_EID);
        require(token.balanceOf(address(this)) == 2 ether, "inbound credit blocked");
    }

    function testOutboundAndInboundLimitsAreIndependent() public {
        token.setRateLimit(REMOTE_EID, false, 100 ether, 1 hours);
        token.setRateLimit(REMOTE_EID, true, 40 ether, 1 hours);
        token.mint(address(this), 100 ether);

        token.debit(address(this), 60 ether, REMOTE_EID);
        token.credit(address(this), 30 ether, REMOTE_EID);

        (, uint256 outboundAvailable) = token.rateLimit(REMOTE_EID, false);
        (, uint256 inboundAvailable) = token.rateLimit(REMOTE_EID, true);
        require(outboundAvailable == 40 ether, "outbound available");
        require(inboundAvailable == 10 ether, "inbound available");
    }

    function testRateLimitResetsAfterWindow() public {
        token.setRateLimit(REMOTE_EID, false, 10 ether, 1 hours);
        token.mint(address(this), 20 ether);
        token.debit(address(this), 10 ether, REMOTE_EID);

        vm.warp(block.timestamp + 1 hours);
        token.debit(address(this), 10 ether, REMOTE_EID);
        require(token.balanceOf(address(this)) == 0, "second window debit failed");
    }

    function testRateLimitRefillsContinuously() public {
        token.setRateLimit(REMOTE_EID, false, 100 ether, 100 seconds);
        token.mint(address(this), 150 ether);
        token.debit(address(this), 100 ether, REMOTE_EID);

        vm.warp(block.timestamp + 25 seconds);
        (, uint256 available) = token.rateLimit(REMOTE_EID, false);
        require(available == 25 ether, "continuous refill");
        token.debit(address(this), 25 ether, REMOTE_EID);
    }

    function testQuoteAndSendUseNormalizedAmountAndNativeFee() public {
        token.setPeer(REMOTE_EID, REMOTE_PEER);
        token.setRateLimit(REMOTE_EID, false, 2 ether, 1 hours);
        token.mint(address(this), 2 ether);

        SendParam memory params = SendParam({
            dstEid: REMOTE_EID,
            to: bytes32(uint256(uint160(address(this)))),
            amountLD: 1 ether + 1,
            minAmountLD: 1 ether,
            extraOptions: bytes(""),
            composeMsg: bytes(""),
            oftCmd: bytes("")
        });
        MessagingFee memory fee = token.quoteSend(params, false);
        require(fee.nativeFee == 0.001 ether, "native quote");

        token.send{ value: fee.nativeFee }(params, fee, address(this));
        require(token.balanceOf(address(this)) == 1 ether, "dust-normalized debit");
        (, uint256 available) = token.rateLimit(REMOTE_EID, false);
        require(available == 1 ether, "normalized rate-limit usage");
    }

    function testGuardianCannotChangeRateLimitOrPeer() public {
        (bool limitSuccess, bytes memory limitReason) = guardian.trySetRateLimit(token, REMOTE_EID);
        require(!limitSuccess, "guardian changed limit");
        _assertSelector(limitReason, CrossChainControls.GovernanceOnly.selector);

        (bool peerSuccess,) = guardian.trySetPeer(token, REMOTE_EID, REMOTE_PEER);
        require(!peerSuccess, "guardian changed peer");
    }

    function testOwnershipCannotBeRenounced() public view {
        try token.renounceOwnership() {
            revert("ownership renounced");
        } catch (bytes memory reason) {
            _assertSelector(reason, ControlledOFT.OwnershipRenunciationDisabled.selector);
        }
        require(token.owner() == address(this), "owner changed");
    }

    function testMirrorRejectsUntrustedPeer() public {
        NavMessage.Snapshot memory current = _snapshot(1, block.timestamp);
        Origin memory origin = Origin({ srcEid: REMOTE_EID, sender: bytes32(uint256(1)), nonce: 1 });

        (bool success,) = endpoint.tryDeliver(
            address(mirror), origin, keccak256("untrusted"), NavMessage.encode(current)
        );
        require(!success, "untrusted peer accepted");
    }

    function testMirrorRejectsReplayAndOutOfOrderSequence() public {
        _deliver(_snapshot(2, block.timestamp), 2);

        (bool success, bytes memory reason) = _tryDeliver(_snapshot(1, block.timestamp), 3);
        require(!success, "out-of-order snapshot accepted");
        _assertSelector(reason, NavMirror.OutOfOrderSequence.selector);
    }

    function testMirrorRejectsNewSequenceWithOldTimestamp() public {
        _deliver(_snapshot(1, block.timestamp), 1);
        (bool success, bytes memory reason) = _tryDeliver(_snapshot(2, block.timestamp - 1), 2);
        require(!success, "old timestamp accepted");
        _assertSelector(reason, NavMirror.OutOfOrderTimestamp.selector);
    }

    function testMirrorRejectsMalformedMessage() public {
        Origin memory origin = Origin({ srcEid: REMOTE_EID, sender: REMOTE_PEER, nonce: 1 });
        (bool success, bytes memory reason) = endpoint.tryDeliver(
            address(mirror), origin, keccak256("malformed"), abi.encode(uint256(1))
        );
        require(!success, "malformed snapshot accepted");
        _assertSelector(reason, NavMirror.InvalidMessageLength.selector);
    }

    function testDeliveryCanRetryAfterFailureWithoutStateDrift() public {
        Origin memory origin = Origin({ srcEid: REMOTE_EID, sender: REMOTE_PEER, nonce: 1 });
        bytes32 guid = keccak256("retryable");
        (bool failed,) = endpoint.tryDeliver(address(mirror), origin, guid, abi.encode(uint256(1)));
        require(!failed, "malformed delivery succeeded");

        (bool retried,) = endpoint.tryDeliver(
            address(mirror), origin, guid, NavMessage.encode(_snapshot(1, block.timestamp))
        );
        require(retried, "corrected retry failed");
        require(mirror.latestNav().sequence == 1, "retry state");
    }

    function testLatestNavRevertsWhenStale() public {
        uint256 publishedAt = block.timestamp;
        _deliver(_snapshot(1, publishedAt), 1);
        NavMessage.Snapshot memory current = mirror.latestNav();
        require(current.nav18 == 1.02 ether, "latest nav");

        vm.warp(publishedAt + 10 minutes + 1);
        try mirror.latestNav() {
            revert("stale nav accepted");
        } catch (bytes memory reason) {
            _assertSelector(reason, NavMirror.StaleNav.selector);
        }
    }

    function testPublisherDerivesNavFromVaultAccounting() public {
        MockSnapshotVault vault = new MockSnapshotVault();
        vault.mint(address(this), 200 ether);
        vault.setTotalAssets(250e6);
        NavPublisher publisher =
            new NavPublisher(address(vault), address(endpoint), address(this), address(this));

        NavMessage.Snapshot memory current = publisher.snapshot();
        require(current.nav18 == 1.25 ether, "derived nav");
        require(current.totalSupply18 == 200 ether, "snapshot supply");
        require(current.sequence == 1, "snapshot sequence");
    }

    function testFuzzAdapterBackingMatchesRemoteSupply(uint96 amountSeed) public {
        uint256 amount = (uint256(amountSeed) % 1_000_000 ether) + 1e12;
        amount -= amount % 1e12;

        MockCanonicalToken canonical = new MockCanonicalToken();
        ControlledOFTAdapterHarness adapter = new ControlledOFTAdapterHarness(
            address(canonical), address(endpoint), address(this), address(guardian)
        );
        ControlledOFTHarness remote =
            new ControlledOFTHarness(address(endpoint), address(this), address(guardian));
        adapter.setRateLimit(REMOTE_EID, false, uint128(amount), 1 hours);
        adapter.setRateLimit(REMOTE_EID, true, uint128(amount), 1 hours);
        remote.setRateLimit(REMOTE_EID, false, uint128(amount), 1 hours);
        remote.setRateLimit(REMOTE_EID, true, uint128(amount), 1 hours);

        canonical.mint(address(this), amount);
        canonical.approve(address(adapter), amount);
        adapter.debit(address(this), amount, REMOTE_EID);
        remote.credit(address(this), amount, REMOTE_EID);
        require(canonical.balanceOf(address(adapter)) == remote.totalSupply(), "outbound backing");

        remote.debit(address(this), amount, REMOTE_EID);
        adapter.credit(address(this), amount, REMOTE_EID);
        require(canonical.balanceOf(address(adapter)) == 0, "adapter not unlocked");
        require(remote.totalSupply() == 0, "remote supply not burned");
        require(canonical.balanceOf(address(this)) == amount, "round-trip balance");
    }

    function _snapshot(uint256 sequence, uint256 publishedAt)
        private
        pure
        returns (NavMessage.Snapshot memory)
    {
        return NavMessage.Snapshot({
            sequence: sequence,
            nav18: 1.02 ether,
            publishedAt: publishedAt,
            totalSupply18: 1000 ether
        });
    }

    function _deliver(NavMessage.Snapshot memory current, uint64 nonce) private {
        (bool success,) = _tryDeliver(current, nonce);
        require(success, "delivery failed");
    }

    function _tryDeliver(NavMessage.Snapshot memory current, uint64 nonce)
        private
        returns (bool success, bytes memory result)
    {
        Origin memory origin = Origin({ srcEid: REMOTE_EID, sender: REMOTE_PEER, nonce: nonce });
        return endpoint.tryDeliver(
            address(mirror),
            origin,
            keccak256(abi.encode(current.sequence)),
            NavMessage.encode(current)
        );
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

contract MockLayerZeroEndpoint {
    address public delegate;
    uint64 public nonce;

    function setDelegate(address delegate_) external {
        delegate = delegate_;
    }

    function lzToken() external pure returns (address) {
        return address(0);
    }

    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory) {
        return MessagingFee({ nativeFee: 0.001 ether, lzTokenFee: 0 });
    }

    function send(MessagingParams calldata params, address)
        external
        payable
        returns (MessagingReceipt memory receipt)
    {
        nonce += 1;
        receipt = MessagingReceipt({
            guid: keccak256(abi.encode(msg.sender, nonce, params.message)),
            nonce: nonce,
            fee: MessagingFee({ nativeFee: msg.value, lzTokenFee: 0 })
        });
    }

    function tryDeliver(address receiver, Origin memory origin, bytes32 guid, bytes memory message)
        external
        returns (bool success, bytes memory result)
    {
        return receiver.call(
            abi.encodeCall(
                ILayerZeroReceiver.lzReceive, (origin, guid, message, address(this), bytes(""))
            )
        );
    }
}

contract ControlledOFTHarness is ControlledOFT {
    constructor(address endpoint_, address delegate_, address guardian_)
        ControlledOFT("Test", "TEST", endpoint_, delegate_, guardian_)
    { }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function debit(address sender, uint256 amount, uint32 destinationEid) external {
        _debit(sender, amount, amount, destinationEid);
    }

    function credit(address recipient, uint256 amount, uint32 sourceEid) external {
        _credit(recipient, amount, sourceEid);
    }
}

contract GuardianActor {
    function pause(CrossChainControls controls) external {
        controls.pauseBridge();
    }

    function tryUnpause(CrossChainControls controls)
        external
        returns (bool success, bytes memory result)
    {
        return address(controls).call(abi.encodeCall(CrossChainControls.unpauseBridge, ()));
    }

    function trySetRateLimit(CrossChainControls controls, uint32 eid)
        external
        returns (bool success, bytes memory result)
    {
        return address(controls)
            .call(
                abi.encodeCall(
                    CrossChainControls.setRateLimit, (eid, false, uint128(1 ether), uint64(1 hours))
                )
            );
    }

    function trySetPeer(ControlledOFTHarness oft, uint32 eid, bytes32 peer)
        external
        returns (bool success, bytes memory result)
    {
        return address(oft).call(abi.encodeWithSignature("setPeer(uint32,bytes32)", eid, peer));
    }
}

contract ControlledOFTAdapterHarness is ControlledOFTAdapter {
    constructor(address token_, address endpoint_, address delegate_, address guardian_)
        ControlledOFTAdapter(token_, endpoint_, delegate_, guardian_)
    { }

    function debit(address sender, uint256 amount, uint32 destinationEid) external {
        _debit(sender, amount, amount, destinationEid);
    }

    function credit(address recipient, uint256 amount, uint32 sourceEid) external {
        _credit(recipient, amount, sourceEid);
    }
}

contract MockCanonicalToken is ERC20 {
    constructor() ERC20("Canonical", "CAN") { }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract MockSnapshotVault is ERC20 {
    uint256 private _totalAssets;

    constructor() ERC20("Mock fIPO", "mfIPO") { }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function setTotalAssets(uint256 amount) external {
        _totalAssets = amount;
    }

    function totalAssets() external view returns (uint256) {
        return _totalAssets;
    }
}
