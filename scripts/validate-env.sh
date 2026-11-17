#!/usr/bin/env bash

set -euo pipefail

readonly TESTNET_CHAIN_ID="46630"
readonly MAINNET_CHAIN_ID="4663"
readonly MAINNET_USDG="0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"

schema_mode=false

usage() {
    echo "Usage: $0 [--schema] <.env.testnet|.env.mainnet>" >&2
}

fail() {
    echo "Environment validation failed: $1" >&2
    exit 1
}

if [[ "${1:-}" == "--schema" ]]; then
    schema_mode=true
    shift
fi

[[ $# -eq 1 ]] || { usage; exit 2; }

readonly env_file="$1"
[[ -f "$env_file" ]] || fail "file not found: $env_file"

case "$(basename "$env_file")" in
    .env.testnet|.env.testnet.example) expected_env="testnet" ;;
    .env.mainnet|.env.mainnet.example) expected_env="mainnet" ;;
    *) fail "unsupported filename; use an explicit testnet or mainnet environment file" ;;
esac

value_for() {
    awk -v requested_key="$1" '
        index($0, requested_key "=") == 1 {
            print substr($0, length(requested_key) + 2)
            exit
        }
    ' "$env_file"
}

awk '
    /^[[:space:]]*$/ || /^[[:space:]]*#/ { next }
    !/^[A-Z][A-Z0-9_]*=/ {
        print "Environment validation failed: invalid assignment: " $0 > "/dev/stderr"
        exit 1
    }
    {
        key = $0
        sub(/=.*/, "", key)
        if (seen[key]++) {
            print "Environment validation failed: duplicate variable: " key > "/dev/stderr"
            exit 1
        }
    }
' "$env_file" || exit 1

required_keys=(
    APP_ENV
    CHAIN_ID
    RPC_URL
    RPC_INDEXER
    BLOCK_EXPLORER_URL
    INDEXER_START_BLOCK
    INDEXER_CONFIRMATIONS
    INDEXER_BATCH_SIZE
    INDEXER_REORG_REPLAY_DEPTH
    INDEXER_MAX_CATCH_UP_CYCLES
    SUPABASE_URL
    SUPABASE_SECRET_KEY
    ADMIN_ADDRESS
    TIMELOCK_ADDRESS
    GUARDIAN_ADDRESS
    KEEPER_ADDRESS
    TREASURY_ADDRESS
    TIMELOCK_DELAY_SECONDS
    DEPLOYER_PRIVATE_KEY
    DEPLOYMENT_VERSION
    INITIAL_TVL_CAP
    MANAGEMENT_FEE_BPS
    CASH_FEE_BPS
    IN_KIND_FEE_BPS
    OFF_HOURS_FEE_BPS
    CANARY_USDG_AMOUNT
    USDG_ADDRESS
    USDG_DECIMALS
    FLOATS_VAULT_ADDRESS
    INDEX_REGISTRY_ADDRESS
    NAV_ORACLE_ADDRESS
    SWAP_QUOTE_ORACLE_ADDRESS
    SWAP_ADAPTER_ADDRESS
    REBALANCER_ADDRESS
    FEE_MODULE_ADDRESS
)

for key in "${required_keys[@]}"; do
    grep -q "^${key}=" "$env_file" || fail "missing variable: $key"
done

app_env="$(value_for APP_ENV)"
chain_id="$(value_for CHAIN_ID)"
[[ "$app_env" == "$expected_env" ]] || fail "APP_ENV does not match filename"

if [[ "$expected_env" == "testnet" ]]; then
    [[ "$chain_id" == "$TESTNET_CHAIN_ID" ]] || fail "testnet chain ID must be $TESTNET_CHAIN_ID"
    observed_usdg="$(value_for USDG_ADDRESS | tr '[:upper:]' '[:lower:]')"
    expected_usdg="0x7e955252e15c84f5768b83c41a71f9eba181802f"
    [[ "$observed_usdg" == "$expected_usdg" ]] || fail "unexpected testnet USDG address"
else
    [[ "$chain_id" == "$MAINNET_CHAIN_ID" ]] || fail "mainnet chain ID must be $MAINNET_CHAIN_ID"
    observed_usdg="$(value_for USDG_ADDRESS | tr '[:upper:]' '[:lower:]')"
    expected_usdg="$(printf '%s' "$MAINNET_USDG" | tr '[:upper:]' '[:lower:]')"
    [[ "$observed_usdg" == "$expected_usdg" ]] || fail "unexpected mainnet USDG address"
fi

[[ "$(value_for RPC_URL)" =~ ^https:// ]] || fail "RPC_URL must use HTTPS"
[[ "$(value_for RPC_INDEXER)" =~ ^https:// ]] || fail "RPC_INDEXER must use HTTPS"
[[ "$(value_for BLOCK_EXPLORER_URL)" =~ ^https:// ]] || fail "BLOCK_EXPLORER_URL must use HTTPS"
[[ "$(value_for USDG_DECIMALS)" == "6" ]] || fail "USDG_DECIMALS must be 6"
[[ "$(value_for TIMELOCK_DELAY_SECONDS)" == "300" ]] \
    || fail "TIMELOCK_DELAY_SECONDS must be 300"

integer_keys=(INDEXER_CONFIRMATIONS INDEXER_BATCH_SIZE INDEXER_REORG_REPLAY_DEPTH INDEXER_MAX_CATCH_UP_CYCLES)
for key in "${integer_keys[@]}"; do
    [[ "$(value_for "$key")" =~ ^[1-9][0-9]*$ ]] || fail "$key must be a positive integer"
done

fee_keys=(MANAGEMENT_FEE_BPS CASH_FEE_BPS IN_KIND_FEE_BPS OFF_HOURS_FEE_BPS)
for key in "${fee_keys[@]}"; do
    [[ "$(value_for "$key")" =~ ^[0-9]+$ ]] || fail "$key must be a non-negative integer"
done
[[ "$(value_for CANARY_USDG_AMOUNT)" =~ ^[1-9][0-9]*$ ]] \
    || fail "CANARY_USDG_AMOUNT must be a positive integer"
(( $(value_for MANAGEMENT_FEE_BPS) <= 500 )) || fail "MANAGEMENT_FEE_BPS exceeds 500"
for key in CASH_FEE_BPS IN_KIND_FEE_BPS OFF_HOURS_FEE_BPS; do
    (( $(value_for "$key") <= 300 )) || fail "$key exceeds 300"
done

indexer_start_block="$(value_for INDEXER_START_BLOCK)"
[[ -z "$indexer_start_block" || "$indexer_start_block" =~ ^[0-9]+$ ]] \
    || fail "INDEXER_START_BLOCK must be a non-negative integer"

address_keys=(
    USDG_ADDRESS
    ADMIN_ADDRESS
    TIMELOCK_ADDRESS
    GUARDIAN_ADDRESS
    KEEPER_ADDRESS
    TREASURY_ADDRESS
    FLOATS_VAULT_ADDRESS
    INDEX_REGISTRY_ADDRESS
    NAV_ORACLE_ADDRESS
    SWAP_QUOTE_ORACLE_ADDRESS
    SWAP_ADAPTER_ADDRESS
    REBALANCER_ADDRESS
    FEE_MODULE_ADDRESS
)

for key in "${address_keys[@]}"; do
    value="$(value_for "$key")"
    [[ -z "$value" || "$value" =~ ^0x[0-9a-fA-F]{40}$ ]] || fail "$key is not an EVM address"
done

if [[ "$schema_mode" == false ]]; then
    secret_keys=(
        SUPABASE_URL
        SUPABASE_SECRET_KEY
        DEPLOYER_PRIVATE_KEY
        INDEXER_START_BLOCK
    )

    for key in "${secret_keys[@]}"; do
        [[ -n "$(value_for "$key")" ]] || fail "$key must be set for runtime validation"
    done

    [[ "$(value_for SUPABASE_URL)" =~ ^https:// ]] || fail "SUPABASE_URL must use HTTPS"
    [[ "$(value_for SUPABASE_SECRET_KEY)" =~ ^sb_secret_ ]] \
        || fail "SUPABASE_SECRET_KEY must use the sb_secret_ format"
fi

echo "Validated $expected_env environment: $env_file"
