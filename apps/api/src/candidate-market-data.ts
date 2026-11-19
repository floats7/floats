import type { MarketHistoryPoint } from "./market-catalog.ts";

interface CacheEntry {
  readonly expiresAt: number;
  readonly points: readonly MarketHistoryPoint[];
}

export class CandidateMarketData {
  private readonly cache = new Map<string, CacheEntry>();

  public constructor(
    private readonly request: typeof globalThis.fetch = globalThis.fetch,
    private readonly cacheTtlMs = 60_000,
  ) {}

  public async history(symbol: string, limit: number, signal?: AbortSignal): Promise<readonly MarketHistoryPoint[]> {
    const normalized = symbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized)) throw new Error("INVALID_MARKET_SYMBOL");
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.points.slice(-limit);

    const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(normalized)}/chart`);
    url.searchParams.set("assetclass", "stocks");
    const response = await this.request(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; FloatsMarketData/1.0)" },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`MARKET_DATA_${response.status}`);
    const points = parseNasdaqChart(await response.json());
    this.cache.set(normalized, { expiresAt: Date.now() + this.cacheTtlMs, points });
    return points.slice(-limit);
  }
}

export function parseNasdaqChart(value: unknown): readonly MarketHistoryPoint[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const chart = (data as { chart?: unknown }).chart;
  if (!Array.isArray(chart)) return [];

  const unique = new Map<number, MarketHistoryPoint>();
  for (const raw of chart.slice(-2_000)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as { x?: unknown; y?: unknown };
    if (typeof item.x !== "number" || !Number.isSafeInteger(item.x) || item.x <= 0) continue;
    const valueUsd18 = usd18(item.y);
    if (!valueUsd18) continue;
    unique.set(item.x, { blockNumber: 0, valueUsd18, observedAt: new Date(item.x).toISOString() });
  }
  return [...unique.values()].sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
}

function usd18(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const [whole, fraction = ""] = value.toFixed(8).split(".");
  if (!whole) return undefined;
  return `${whole}${fraction.padEnd(18, "0")}`.replace(/^0+(?=\d)/, "");
}
