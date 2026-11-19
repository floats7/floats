// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title CrossChainControls
/// @notice Reusable guardian pause and per-path rolling rate limits for Floats OApps.
abstract contract CrossChainControls {
    using SafeCast for uint256;

    struct RateLimit {
        uint128 capacity;
        uint128 available;
        uint64 window;
        uint64 lastUpdatedAt;
    }

    error BridgePaused();
    error GuardianOnly(address caller);
    error GovernanceOnly(address caller);
    error InvalidGuardian();
    error InvalidRateLimit(uint256 capacity, uint256 window);
    error RateLimitExceeded(uint32 eid, bool inbound, uint256 requested, uint256 available);

    event BridgePauseSet(bool paused, address indexed caller);
    event RateLimitSet(uint32 indexed eid, bool indexed inbound, uint128 capacity, uint64 window);
    event RateLimitConsumed(
        uint32 indexed eid, bool indexed inbound, uint256 amount, uint256 remaining
    );

    address public immutable guardian;
    bool public bridgePaused;

    mapping(bytes32 pathKey => RateLimit limit) private _rateLimits;

    constructor(address guardian_) {
        if (guardian_ == address(0)) revert InvalidGuardian();
        guardian = guardian_;
    }

    function pauseBridge() external {
        if (msg.sender != guardian && msg.sender != _governance()) {
            revert GuardianOnly(msg.sender);
        }
        if (!bridgePaused) {
            bridgePaused = true;
            emit BridgePauseSet(true, msg.sender);
        }
    }

    function unpauseBridge() external {
        _requireGovernance();
        if (bridgePaused) {
            bridgePaused = false;
            emit BridgePauseSet(false, msg.sender);
        }
    }

    function setRateLimit(uint32 eid, bool inbound, uint128 capacity, uint64 window) external {
        _requireGovernance();
        if (capacity == 0 || window == 0) revert InvalidRateLimit(capacity, window);

        _rateLimits[_pathKey(eid, inbound)] = RateLimit({
            capacity: capacity,
            available: capacity,
            window: window,
            lastUpdatedAt: block.timestamp.toUint64()
        });
        emit RateLimitSet(eid, inbound, capacity, window);
    }

    function rateLimit(uint32 eid, bool inbound)
        external
        view
        returns (RateLimit memory limit, uint256 available)
    {
        limit = _rateLimits[_pathKey(eid, inbound)];
        available = _available(limit);
    }

    function _consumeRateLimit(uint32 eid, bool inbound, uint256 amount) internal {
        if (!inbound && bridgePaused) revert BridgePaused();

        bytes32 key = _pathKey(eid, inbound);
        RateLimit storage limit = _rateLimits[key];
        uint256 available = _available(limit);
        if (amount > available) revert RateLimitExceeded(eid, inbound, amount, available);

        limit.available = (available - amount).toUint128();
        limit.lastUpdatedAt = block.timestamp.toUint64();
        emit RateLimitConsumed(eid, inbound, amount, available - amount);
    }

    function _available(RateLimit memory limit) private view returns (uint256) {
        if (limit.capacity == 0) return 0;
        uint256 elapsed = block.timestamp - limit.lastUpdatedAt;
        if (elapsed >= limit.window) return limit.capacity;
        uint256 refilled = uint256(limit.capacity) * elapsed / limit.window;
        uint256 current = uint256(limit.available) + refilled;
        return current > limit.capacity ? limit.capacity : current;
    }

    function _requireGovernance() private view {
        if (msg.sender != _governance()) revert GovernanceOnly(msg.sender);
    }

    function _pathKey(uint32 eid, bool inbound) private pure returns (bytes32) {
        return keccak256(abi.encode(eid, inbound));
    }

    function _governance() internal view virtual returns (address);
}
