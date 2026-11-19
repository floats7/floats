// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title CrossChainControls
/// @notice Reusable guardian pause and per-path rolling rate limits for Floats OApps.
abstract contract CrossChainControls {
    struct RateLimit {
        uint128 capacity;
        uint128 used;
        uint64 window;
        uint64 windowStartedAt;
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
            capacity: capacity, used: 0, window: window, windowStartedAt: uint64(block.timestamp)
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
        if (bridgePaused) revert BridgePaused();

        bytes32 key = _pathKey(eid, inbound);
        RateLimit storage limit = _rateLimits[key];
        uint256 available = _available(limit);
        if (amount > available) revert RateLimitExceeded(eid, inbound, amount, available);

        if (block.timestamp >= uint256(limit.windowStartedAt) + limit.window) {
            limit.used = 0;
            limit.windowStartedAt = uint64(block.timestamp);
        }
        limit.used += uint128(amount);
        emit RateLimitConsumed(eid, inbound, amount, available - amount);
    }

    function _available(RateLimit memory limit) private view returns (uint256) {
        if (limit.capacity == 0) return 0;
        if (block.timestamp >= uint256(limit.windowStartedAt) + limit.window) {
            return limit.capacity;
        }
        return uint256(limit.capacity) - limit.used;
    }

    function _requireGovernance() private view {
        if (msg.sender != _governance()) revert GovernanceOnly(msg.sender);
    }

    function _pathKey(uint32 eid, bool inbound) private pure returns (bytes32) {
        return keccak256(abi.encode(eid, inbound));
    }

    function _governance() internal view virtual returns (address);
}
