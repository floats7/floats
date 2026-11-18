import { readFileSync } from "node:fs";
import { Client } from "pg";

const TOTAL_ASSETS_SELECTOR = "0x01e1d114";
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";
const INTERNAL_SCALE = 10n ** 18n;
const USDG_TO_INTERNAL_SCALE = 10n ** 12n;
const MAX_VARIANCE_PPM = 500n; // 0.05%

interface NavState {
  readonly blockNumber: number;
  readonly navUsd18: string;
  readonly totalSupply18: string;
  readonly sharePriceUsd18: string | null;
}

const [environmentPath, apiOrigin] = process.argv.slice(2);
if (!environmentPath || !apiOrigin) {
  throw new Error("usage: reconcile-nav.ts <environment-file> <api-origin>");
}

const values = loadEnvironment(environmentPath);
const environment = required(values, "APP_ENV");
const chainId = Number(required(values, "CHAIN_ID"));
const vaultAddress = required(values, "FLOATS_VAULT_ADDRESS").toLowerCase();
const rpcUrl = required(values, "RPC_INDEXER");
const database = new Client({
  connectionString: required(values, "SUPABASE_DB_URL"),
  application_name: `floats-${environment}-nav-reconciliation`,
});

await database.connect();
try {
  const indexed = await latestIndexedState(database, environment, chainId, vaultAddress);
  const [onchainAssets, onchainSupply, api] = await Promise.all([
    ethCallUint(rpcUrl, vaultAddress, TOTAL_ASSETS_SELECTOR, indexed.blockNumber),
    ethCallUint(rpcUrl, vaultAddress, TOTAL_SUPPLY_SELECTOR, indexed.blockNumber),
    fetchApiState(apiOrigin),
  ]);

  const onchainNav = onchainAssets * USDG_TO_INTERNAL_SCALE;
  const onchainSharePrice = onchainSupply === 0n ? null : onchainNav * INTERNAL_SCALE / onchainSupply;
  const indexedNav = BigInt(indexed.navUsd18);
  const apiNav = BigInt(api.navUsd18);
  const onchainVariancePpm = variancePpm(indexedNav, onchainNav);
  const apiVariancePpm = variancePpm(indexedNav, apiNav);

  assertEqual("indexed block vs API block", BigInt(indexed.blockNumber), BigInt(api.blockNumber));
  assertEqual("indexed supply vs onchain supply", BigInt(indexed.totalSupply18), onchainSupply);
  assertNullableEqual("indexed share price vs onchain share price", indexed.sharePriceUsd18, onchainSharePrice);
  assertEqual("indexed NAV vs API/UI source NAV", indexedNav, apiNav);
  assertWithinVariance("onchain/indexer NAV", onchainVariancePpm);
  assertWithinVariance("indexer/API/UI NAV", apiVariancePpm);

  console.log(JSON.stringify({
    environment,
    chainId,
    blockNumber: indexed.blockNumber,
    navUsd18: indexed.navUsd18,
    totalSupply18: indexed.totalSupply18,
    sharePriceUsd18: indexed.sharePriceUsd18,
    onchainIndexerVariancePercent: formatPpm(onchainVariancePpm),
    indexerApiUiVariancePercent: formatPpm(apiVariancePpm),
    thresholdPercent: "0.0500",
    status: "pass",
  }));
} finally {
  await database.end();
}

async function latestIndexedState(
  client: Client,
  environment: string,
  chainId: number,
  vaultAddress: string,
): Promise<NavState> {
  const result = await client.query<{
    block_number: string;
    nav_usd_18: string;
    total_supply_18: string;
    share_price_usd_18: string | null;
  }>(
    `select block_number::text, nav_usd_18::text, total_supply_18::text, share_price_usd_18::text
       from public.nav_snapshots
      where environment = $1 and chain_id = $2 and lower(vault_address) = $3 and canonical
      order by block_number desc
      limit 1`,
    [environment, chainId, vaultAddress],
  );
  const row = result.rows[0];
  if (!row) throw new Error("No canonical NAV snapshot was found");
  return {
    blockNumber: Number(row.block_number),
    navUsd18: row.nav_usd_18,
    totalSupply18: row.total_supply_18,
    sharePriceUsd18: row.share_price_usd_18,
  };
}

async function fetchApiState(origin: string): Promise<NavState> {
  const url = new URL("/api/index-state", origin);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`API state request failed with ${response.status}`);
  const body = await response.json() as { readonly data?: NavState };
  if (!body.data) throw new Error("API returned no index state");
  return body.data;
}

async function ethCallUint(rpcUrl: string, to: string, data: string, blockNumber: number): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, `0x${blockNumber.toString(16)}`],
    }),
  });
  const payload = await response.json() as { readonly result?: string; readonly error?: { readonly message?: string } };
  if (!payload.result || !/^0x[0-9a-fA-F]{64}$/.test(payload.result)) {
    throw new Error(payload.error?.message ?? "RPC returned an invalid uint256");
  }
  return BigInt(payload.result);
}

function variancePpm(reference: bigint, candidate: bigint): bigint {
  if (reference === 0n) return candidate === 0n ? 0n : 1_000_000n;
  const difference = reference > candidate ? reference - candidate : candidate - reference;
  return difference * 1_000_000n / reference;
}

function assertWithinVariance(label: string, ppm: bigint): void {
  if (ppm > MAX_VARIANCE_PPM) throw new Error(`${label} exceeds 0.05%: ${formatPpm(ppm)}%`);
}

function assertEqual(label: string, expected: bigint, actual: bigint): void {
  if (expected !== actual) throw new Error(`${label} mismatch: ${expected} != ${actual}`);
}

function assertNullableEqual(label: string, expected: string | null, actual: bigint | null): void {
  if (expected === null && actual === null) return;
  if (expected === null || actual === null || BigInt(expected) !== actual) throw new Error(`${label} mismatch`);
}

function formatPpm(ppm: bigint): string {
  return `${ppm / 10_000n}.${(ppm % 10_000n).toString().padStart(4, "0")}`;
}

function loadEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}
