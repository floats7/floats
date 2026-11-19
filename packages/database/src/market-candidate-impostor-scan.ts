import { createHash } from "node:crypto";
import { decodeFunctionResult, encodeFunctionData, isAddress, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import type { MarketCandidateIdentityAlert } from "./market-candidate-identity-sync.ts";

export interface MarketCandidateImpostorScanConfig {
  readonly databaseUrl: URL;
  readonly secretKey: string;
  readonly environment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly explorerUrl: URL;
  readonly rpcUrl: URL;
  readonly fetch?: typeof globalThis.fetch;
  readonly onAlert?: (alert: MarketCandidateIdentityAlert) => Promise<void>;
}

interface CandidateIdentity {
  readonly candidate_id: string;
  readonly symbol: string;
  readonly company_name: string;
  readonly detected_token_address: string | null;
  readonly token_address: string | null;
  readonly impostor_aliases?: readonly string[];
}

interface SearchItem {
  readonly type?: string;
  readonly address_hash?: string;
  readonly symbol?: string;
  readonly name?: string;
}

const TOKEN_METADATA_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
const ZERO_ADDRESS_TOPIC = `0x${"0".repeat(64)}` as Hex;
const seenSuspects = new Set<string>();

export async function scanMarketCandidateImpostors(config: MarketCandidateImpostorScanConfig): Promise<number> {
  validate(config);
  const request = config.fetch ?? globalThis.fetch;
  const candidates = await readCandidates(config, request);
  let explorerAvailable = true;
  const explorerItems = new Map<string, SearchItem[]>();
  for (const candidate of candidates) {
    try {
      explorerItems.set(candidate.candidate_id, await searchExplorer(config.explorerUrl, candidate.symbol, request));
    } catch {
      explorerAvailable = false;
      break;
    }
  }
  const onchainItems = explorerAvailable ? [] : await searchRecentMintedTokens(config.rpcUrl, request);
  let suspects = 0;
  for (const candidate of candidates) {
    const items = explorerAvailable ? explorerItems.get(candidate.candidate_id) ?? [] : onchainItems;
    const canonical = new Set([candidate.detected_token_address, candidate.token_address].filter(Boolean).map((value) => value!.toLowerCase()));
    for (const item of items) {
      const address = item.address_hash?.toLowerCase();
      if (item.type !== "token" || !address || !isAddress(address, { strict: false }) || canonical.has(address)) continue;
      const aliases = [candidate.symbol, candidate.company_name, ...(candidate.impostor_aliases ?? [])]
        .map((value) => value.trim().toLowerCase());
      const discoveredSymbol = item.symbol?.trim().toLowerCase();
      const discoveredName = item.name?.trim().toLowerCase();
      const symbolMatch = Boolean(discoveredSymbol && aliases.includes(discoveredSymbol));
      const nameMatch = Boolean(discoveredName && aliases.some((alias) => discoveredName.includes(alias)));
      if (!symbolMatch && !nameMatch) continue;
      const suspectKey = `${config.environment}:${config.chainId}:${candidate.candidate_id}:${address}`;
      if (seenSuspects.has(suspectKey)) continue;
      const observedAt = new Date().toISOString();
      const evidence = {
        passed: false,
        query: candidate.symbol,
        discoverySource: explorerAvailable ? "blockscout_search" : "recent_onchain_mint",
        discoveredAddress: address,
        discoveredSymbol: item.symbol ?? null,
        discoveredName: item.name ?? null,
        reason: "Discovered same-identity token is not a canonical candidate address",
      } as const;
      await record(config, candidate, address, evidence, observedAt, request);
      await config.onAlert?.({
        severity: "critical",
        code: "SUSPECTED_FAKE_STOCK_TOKEN",
        candidateId: candidate.candidate_id,
        symbol: candidate.symbol,
        tokenAddress: address,
        failures: [explorerAvailable ? "NON_CANONICAL_EXPLORER_TOKEN" : "NON_CANONICAL_ONCHAIN_TOKEN"],
        observedAt,
      });
      seenSuspects.add(suspectKey);
      suspects += 1;
    }
  }
  return suspects;
}

async function searchRecentMintedTokens(rpcUrl: URL, request: typeof globalThis.fetch): Promise<SearchItem[]> {
  let id = 0;
  const rpc = async <T>(method: string, params: readonly unknown[]): Promise<T> => {
    const response = await request(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Candidate impostor RPC returned ${response.status}`);
    const payload = await response.json() as { readonly result?: T; readonly error?: { readonly message?: string } };
    if (payload.error || payload.result === undefined) throw new Error(payload.error?.message ?? "Candidate impostor RPC failed");
    return payload.result;
  };
  const latestHex = await rpc<Hex>("eth_blockNumber", []);
  const latest = BigInt(latestHex);
  const from = latest > 10_000n ? latest - 10_000n : 0n;
  const logs = await rpc<Array<{ readonly address?: string }>>("eth_getLogs", [{
    fromBlock: `0x${from.toString(16)}`,
    toBlock: latestHex,
    topics: [TRANSFER_TOPIC, ZERO_ADDRESS_TOPIC],
  }]);
  const addresses = [...new Set(logs.map((log) => log.address?.toLowerCase()).filter((address): address is string => Boolean(address && isAddress(address, { strict: false }))))]
    .slice(-250);
  const results = await Promise.all(addresses.map(async (address): Promise<SearchItem | null> => {
    try {
      const [symbolResult, nameResult] = await Promise.all([
        rpc<Hex>("eth_call", [{ to: address, data: encodeFunctionData({ abi: TOKEN_METADATA_ABI, functionName: "symbol" }) }, "latest"]),
        rpc<Hex>("eth_call", [{ to: address, data: encodeFunctionData({ abi: TOKEN_METADATA_ABI, functionName: "name" }) }, "latest"]),
      ]);
      const symbol = decodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "symbol", data: symbolResult });
      const name = decodeFunctionResult({ abi: TOKEN_METADATA_ABI, functionName: "name", data: nameResult });
      return { type: "token", address_hash: address, symbol, name };
    } catch {
      return null;
    }
  }));
  return results.filter((item): item is SearchItem => item !== null);
}

async function readCandidates(config: MarketCandidateImpostorScanConfig, request: typeof globalThis.fetch): Promise<CandidateIdentity[]> {
  const url = new URL("/rest/v1/market_candidates", config.databaseUrl);
  url.search = new URLSearchParams({
    select: "candidate_id,symbol,company_name,detected_token_address,token_address,impostor_aliases",
    environment: `eq.${config.environment}`,
    chain_id: `eq.${config.chainId}`,
  }).toString();
  const response = await request(url, { headers: headers(config), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Candidate impostor scan read failed with status ${response.status}`);
  return response.json() as Promise<CandidateIdentity[]>;
}

async function searchExplorer(explorerUrl: URL, query: string, request: typeof globalThis.fetch): Promise<SearchItem[]> {
  const url = new URL("/api/v2/search", explorerUrl);
  url.searchParams.set("q", query);
  const response = await request(url, {
    headers: { accept: "application/json", "user-agent": "Floats-Operations/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Candidate impostor explorer search failed with status ${response.status}`);
  const payload = await response.json() as { readonly items?: SearchItem[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

async function record(
  config: MarketCandidateImpostorScanConfig,
  candidate: CandidateIdentity,
  address: string,
  evidence: object,
  observedAt: string,
  request: typeof globalThis.fetch,
): Promise<void> {
  const evidenceJson = JSON.stringify(evidence);
  const url = new URL("/rest/v1/market_candidate_identity_observations", config.databaseUrl);
  url.search = new URLSearchParams({ on_conflict: "environment,chain_id,candidate_id,token_address,source_kind,evidence_hash" }).toString();
  const response = await request(url, {
    method: "POST",
    headers: headers(config, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({
      environment: config.environment,
      chain_id: config.chainId,
      candidate_id: candidate.candidate_id,
      token_address: address,
      source_kind: "impostor_scan",
      passed: false,
      evidence,
      evidence_hash: `0x${createHash("sha256").update(evidenceJson).digest("hex")}`,
      observed_at: observedAt,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Candidate impostor evidence write failed with status ${response.status}`);
}

function validate(config: MarketCandidateImpostorScanConfig): void {
  if (config.databaseUrl.protocol !== "https:" || config.explorerUrl.protocol !== "https:" || config.rpcUrl.protocol !== "https:") throw new Error("Candidate impostor scan URLs must use HTTPS");
  if (!config.secretKey.startsWith("sb_secret_")) throw new Error("Candidate impostor scan requires a server-only secret key");
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw new Error("Candidate impostor scan chain ID is invalid");
}

function headers(config: MarketCandidateImpostorScanConfig, prefer?: string): Record<string, string> {
  return { "content-type": "application/json", apikey: config.secretKey, ...(prefer ? { prefer } : {}) };
}
