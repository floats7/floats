// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

interface IFeeShareVault {
    function totalSupply() external view returns (uint256);

    function mintFeeShares(address recipient, uint256 shares) external;
}

/// @title FeeModule
/// @notice Calculates bounded transaction fees and accrues time-based dilution shares.
contract FeeModule {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_MANAGEMENT_FEE_BPS = 500;
    uint16 public constant MAX_TRANSACTION_FEE_BPS = 300;
    uint256 public constant YEAR = 365 days;

    enum FeeKind {
        Cash,
        InKind,
        OffHours
    }

    struct Rates {
        uint16 managementBps;
        uint16 cashBps;
        uint16 inKindBps;
        uint16 offHoursBps;
    }

    error InvalidAddress();
    error InvalidRate(FeeKind kind, uint16 rateBps, uint16 maximumBps);
    error ManagementRateTooHigh(uint16 rateBps, uint16 maximumBps);
    error NotAdmin(address caller);

    event FeesAccrued(uint256 indexed timestamp, uint256 elapsed, uint256 sharesMinted);
    event RatesSet(uint16 managementBps, uint16 cashBps, uint16 inKindBps, uint16 offHoursBps);
    event TreasurySet(address indexed previousTreasury, address indexed newTreasury);

    address public immutable admin;
    IFeeShareVault public immutable vault;

    address public treasury;
    Rates public rates;
    uint48 public lastAccrual;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    constructor(
        address admin_,
        IFeeShareVault vault_,
        address treasury_,
        Rates memory initialRates
    ) {
        if (admin_ == address(0) || address(vault_) == address(0) || treasury_ == address(0)) {
            revert InvalidAddress();
        }

        admin = admin_;
        vault = vault_;
        treasury = treasury_;
        lastAccrual = uint48(block.timestamp);
        _validateRates(initialRates);
        rates = initialRates;
    }

    function setRates(Rates calldata newRates) external onlyAdmin {
        accrue();
        _validateRates(newRates);
        rates = newRates;
        emit RatesSet(
            newRates.managementBps, newRates.cashBps, newRates.inKindBps, newRates.offHoursBps
        );
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        if (newTreasury == address(0)) revert InvalidAddress();
        accrue();
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasurySet(previousTreasury, newTreasury);
    }

    function accrue() public returns (uint256 sharesMinted) {
        uint256 currentTime = block.timestamp;
        uint256 elapsed = currentTime - lastAccrual;
        if (elapsed == 0) return 0;

        lastAccrual = uint48(currentTime);
        uint256 supply = vault.totalSupply();
        uint16 rate = rates.managementBps;
        if (supply == 0 || rate == 0) {
            emit FeesAccrued(currentTime, elapsed, 0);
            return 0;
        }

        sharesMinted = supply * rate * elapsed / YEAR / BPS_DENOMINATOR;
        if (sharesMinted != 0) vault.mintFeeShares(treasury, sharesMinted);
        emit FeesAccrued(currentTime, elapsed, sharesMinted);
    }

    function calculateFee(uint256 amount, FeeKind kind) external view returns (uint256) {
        uint16 rate = rateFor(kind);

        if (amount == 0 || rate == 0) return 0;
        return (amount * rate + BPS_DENOMINATOR - 1) / BPS_DENOMINATOR;
    }

    /// @notice Returns the gross amount whose post-fee value is at least `netAmount`.
    function grossAmount(uint256 netAmount, FeeKind kind) external view returns (uint256) {
        uint16 rate = rateFor(kind);
        if (netAmount == 0 || rate == 0) return netAmount;
        return Math.mulDiv(
            netAmount,
            BPS_DENOMINATOR,
            BPS_DENOMINATOR - rate,
            Math.Rounding.Ceil
        );
    }

    function rateFor(FeeKind kind) public view returns (uint16) {
        if (kind == FeeKind.Cash) return rates.cashBps;
        if (kind == FeeKind.InKind) return rates.inKindBps;
        return rates.offHoursBps;
    }

    function _validateRates(Rates memory candidate) private pure {
        if (candidate.managementBps > MAX_MANAGEMENT_FEE_BPS) {
            revert ManagementRateTooHigh(candidate.managementBps, MAX_MANAGEMENT_FEE_BPS);
        }
        _validateTransactionRate(FeeKind.Cash, candidate.cashBps);
        _validateTransactionRate(FeeKind.InKind, candidate.inKindBps);
        _validateTransactionRate(FeeKind.OffHours, candidate.offHoursBps);
    }

    function _validateTransactionRate(FeeKind kind, uint16 rate) private pure {
        if (rate > MAX_TRANSACTION_FEE_BPS) {
            revert InvalidRate(kind, rate, MAX_TRANSACTION_FEE_BPS);
        }
    }
}
