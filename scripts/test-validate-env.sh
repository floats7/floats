#!/usr/bin/env bash

set -euo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly validator="$project_root/scripts/validate-env.sh"
readonly temp_dir="$(mktemp -d)"

cleanup() {
    rm -rf "$temp_dir"
}
trap cleanup EXIT

expect_failure() {
    local description="$1"
    local file="$2"

    if "$validator" "$file" >/dev/null 2>&1; then
        echo "Expected failure: $description" >&2
        exit 1
    fi
}

"$validator" --schema "$project_root/.env.testnet.example"
"$validator" --schema "$project_root/.env.mainnet.example"

cp "$project_root/.env.mainnet.example" "$temp_dir/.env.mainnet"
sed -i.bak 's/^CHAIN_ID=.*/CHAIN_ID=46630/' "$temp_dir/.env.mainnet"
rm "$temp_dir/.env.mainnet.bak"
expect_failure "mainnet file with testnet chain ID" "$temp_dir/.env.mainnet"

cp "$project_root/.env.testnet.example" "$temp_dir/.env.testnet"
sed -i.bak 's/^RPC_URL=.*/RPC_URL=http:\/\/insecure.example/' "$temp_dir/.env.testnet"
rm "$temp_dir/.env.testnet.bak"
expect_failure "insecure RPC URL" "$temp_dir/.env.testnet"

cp "$project_root/.env.mainnet.example" "$temp_dir/.env.mainnet"
sed -i.bak 's/^USDG_ADDRESS=.*/USDG_ADDRESS=0x0000000000000000000000000000000000000000/' "$temp_dir/.env.mainnet"
rm "$temp_dir/.env.mainnet.bak"
expect_failure "incorrect canonical mainnet USDG" "$temp_dir/.env.mainnet"

cp "$project_root/.env.testnet.example" "$temp_dir/.env.testnet"
sed -i.bak 's/^USDG_DECIMALS=.*/USDG_DECIMALS=18/' "$temp_dir/.env.testnet"
rm "$temp_dir/.env.testnet.bak"
expect_failure "incorrect USDG decimals" "$temp_dir/.env.testnet"

cp "$project_root/.env.testnet.example" "$temp_dir/.env.testnet"
expect_failure "runtime file with missing Supabase values" "$temp_dir/.env.testnet"

echo "Environment validator tests passed"
