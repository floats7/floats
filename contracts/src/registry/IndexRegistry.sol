// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IndexRegistry
/// @notice Versioned, atomically applied constituent configuration for Floats Core.
contract IndexRegistry {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant MAX_CONSTITUENTS = 32;
    uint8 public constant MAX_TRACKED_TOKENS = 128;

    enum Status {
        None,
        Active,
        Removed
    }

    struct ConstituentInput {
        address token;
        address feed;
        bytes32 uid;
        uint16 targetWeightBps;
        uint48 eligibleFrom;
        uint48 exitAfter;
    }

    struct Constituent {
        address feed;
        bytes32 uid;
        uint16 targetWeightBps;
        uint48 eligibleFrom;
        uint48 exitAfter;
        Status status;
    }

    error ConfigurationHashMismatch(bytes32 expected, bytes32 actual);
    error DuplicateToken(address token);
    error DuplicateUid(bytes32 uid);
    error EmptyConfiguration();
    error InvalidAddress();
    error InvalidDateRange(address token, uint48 eligibleFrom, uint48 exitAfter);
    error InvalidUid(address token);
    error InvalidWeightTotal(uint256 actual);
    error NoPendingConfiguration();
    error NotAdmin(address caller);
    error TooManyConstituents(uint256 actual, uint256 maximum);
    error TooManyTrackedTokens(uint256 actual, uint256 maximum);
    error TooEarly(uint256 validAfter, uint256 currentTime);

    event ConfigurationCancelled(bytes32 indexed configurationHash);
    event ConfigurationExecuted(bytes32 indexed configurationHash, uint64 indexed version);
    event ConfigurationProposed(bytes32 indexed configurationHash, uint48 validAfter);
    event ConstituentConfigured(
        address indexed token,
        address indexed feed,
        bytes32 indexed uid,
        uint16 targetWeightBps,
        uint48 eligibleFrom,
        uint48 exitAfter,
        uint64 version
    );
    event ConstituentRemoved(address indexed token, uint64 indexed version);

    address public immutable admin;
    uint48 public immutable minimumDelay;

    bytes32 public pendingConfigurationHash;
    uint48 public pendingValidAfter;
    uint64 public version;

    mapping(address token => Constituent constituent) private constituents;
    mapping(address token => bool known) private knownToken;
    address[] private activeTokens;
    address[] private trackedTokens;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    constructor(address admin_, uint48 minimumDelay_) {
        if (admin_ == address(0)) revert InvalidAddress();
        admin = admin_;
        minimumDelay = minimumDelay_;
    }

    function proposeConfiguration(ConstituentInput[] calldata inputs, uint48 validAfter)
        external
        onlyAdmin
        returns (bytes32 configurationHash)
    {
        _validate(inputs);

        uint256 earliest = block.timestamp + minimumDelay;
        // Timestamp comparison is the intended proposal-delay boundary.
        // forge-lint: disable-next-line(block-timestamp)
        if (validAfter < earliest) revert TooEarly(earliest, validAfter);

        configurationHash = hashConfiguration(inputs, validAfter);
        pendingConfigurationHash = configurationHash;
        pendingValidAfter = validAfter;

        emit ConfigurationProposed(configurationHash, validAfter);
    }

    function cancelConfiguration() external onlyAdmin {
        bytes32 configurationHash = pendingConfigurationHash;
        if (configurationHash == bytes32(0)) revert NoPendingConfiguration();

        delete pendingConfigurationHash;
        delete pendingValidAfter;
        emit ConfigurationCancelled(configurationHash);
    }

    function executeConfiguration(ConstituentInput[] calldata inputs) external onlyAdmin {
        bytes32 expectedHash = pendingConfigurationHash;
        if (expectedHash == bytes32(0)) revert NoPendingConfiguration();

        uint48 validAfter = pendingValidAfter;
        // Timestamp comparison is the intended timelock boundary; minor validator skew cannot
        // bypass the configured delay because execution remains impossible before validAfter.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < validAfter) revert TooEarly(validAfter, block.timestamp);

        _validate(inputs);
        bytes32 actualHash = hashConfiguration(inputs, validAfter);
        if (actualHash != expectedHash) {
            revert ConfigurationHashMismatch(expectedHash, actualHash);
        }

        delete pendingConfigurationHash;
        delete pendingValidAfter;

        uint64 nextVersion = version + 1;
        version = nextVersion;

        uint256 previousLength = activeTokens.length;
        for (uint256 i; i < previousLength; ++i) {
            address token = activeTokens[i];
            constituents[token].status = Status.Removed;
            constituents[token].targetWeightBps = 0;
            emit ConstituentRemoved(token, nextVersion);
        }
        delete activeTokens;

        uint256 length = inputs.length;
        for (uint256 i; i < length; ++i) {
            ConstituentInput calldata input = inputs[i];
            if (!knownToken[input.token]) {
                uint256 trackedLength = trackedTokens.length;
                if (trackedLength >= MAX_TRACKED_TOKENS) {
                    revert TooManyTrackedTokens(trackedLength + 1, MAX_TRACKED_TOKENS);
                }
                knownToken[input.token] = true;
                trackedTokens.push(input.token);
            }
            constituents[input.token] = Constituent({
                feed: input.feed,
                uid: input.uid,
                targetWeightBps: input.targetWeightBps,
                eligibleFrom: input.eligibleFrom,
                exitAfter: input.exitAfter,
                status: Status.Active
            });
            activeTokens.push(input.token);

            emit ConstituentConfigured(
                input.token,
                input.feed,
                input.uid,
                input.targetWeightBps,
                input.eligibleFrom,
                input.exitAfter,
                nextVersion
            );
        }

        emit ConfigurationExecuted(actualHash, nextVersion);
    }

    function hashConfiguration(ConstituentInput[] calldata inputs, uint48 validAfter)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(inputs, validAfter));
    }

    function getConstituent(address token) external view returns (Constituent memory) {
        return constituents[token];
    }

    function getActiveTokens() external view returns (address[] memory) {
        return activeTokens;
    }

    /// @notice Returns every token ever configured so removed residual balances remain accountable.
    function getTrackedTokens() external view returns (address[] memory) {
        return trackedTokens;
    }

    function activeConstituentCount() external view returns (uint256) {
        return activeTokens.length;
    }

    function _validate(ConstituentInput[] calldata inputs) private pure {
        uint256 length = inputs.length;
        if (length == 0) revert EmptyConfiguration();
        if (length > MAX_CONSTITUENTS) revert TooManyConstituents(length, MAX_CONSTITUENTS);

        uint256 totalWeight = 0;
        for (uint256 i; i < length; ++i) {
            ConstituentInput calldata current = inputs[i];
            // Reverts inside this bounded validation loop are intentional fail-fast input checks.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (current.token == address(0) || current.feed == address(0)) revert InvalidAddress();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (current.uid == bytes32(0)) revert InvalidUid(current.token);
            if (current.exitAfter != 0 && current.exitAfter <= current.eligibleFrom) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert InvalidDateRange(current.token, current.eligibleFrom, current.exitAfter);
            }

            totalWeight += current.targetWeightBps;
            for (uint256 j; j < i; ++j) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (inputs[j].token == current.token) revert DuplicateToken(current.token);
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (inputs[j].uid == current.uid) revert DuplicateUid(current.uid);
            }
        }

        if (totalWeight != BPS_DENOMINATOR) revert InvalidWeightTotal(totalWeight);
    }
}
