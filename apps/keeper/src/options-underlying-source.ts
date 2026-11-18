import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import type { OptionsUnderlyingConfiguration } from "./options-discovery.ts";
import type { Hex } from "./types.ts";

const indexRegistryAbi = parseAbi([
  "function getTrackedTokens() view returns (address[])",
  "function getConstituent(address token) view returns ((address feed,bytes32 uid,uint16 targetWeightBps,uint48 eligibleFrom,uint48 exitAfter,uint8 status))",
]);

const ACTIVE = 1;

export interface IndexConstituentSnapshot {
  readonly feed: Hex;
  readonly uid: Hex;
  readonly status: number;
}

export interface IndexUnderlyingReader {
  trackedTokens(registry: Hex): Promise<readonly Hex[]>;
  constituent(registry: Hex, token: Hex): Promise<IndexConstituentSnapshot>;
}

export class OptionsUnderlyingSource {
  constructor(
    private readonly reader: IndexUnderlyingReader,
    private readonly indexRegistry: Hex,
    private readonly optionsPriceSource: Hex,
  ) {}

  async load(): Promise<readonly OptionsUnderlyingConfiguration[]> {
    const tokens = await this.reader.trackedTokens(this.indexRegistry);
    const unique = [...new Set(tokens.map((token) => token.toLowerCase() as Hex))];
    const snapshots = await Promise.all(unique.map(async (underlying) => ({
      underlying,
      snapshot: await this.reader.constituent(this.indexRegistry, underlying),
    })));
    return snapshots.map(({ underlying, snapshot }) => ({
      underlying,
      underlyingUid: snapshot.uid,
      priceSource: this.optionsPriceSource,
      enabled: snapshot.status === ACTIVE,
    }));
  }
}

interface RpcResponse {
  readonly result?: Hex;
  readonly error?: { readonly code: number };
}

export class JsonRpcIndexUnderlyingReader implements IndexUnderlyingReader {
  private requestId = 0;

  constructor(
    private readonly rpcUrl: URL,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    if (rpcUrl.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(rpcUrl.hostname)) {
      throw new Error("Index registry RPC URL must use HTTPS outside local development");
    }
  }

  async trackedTokens(registry: Hex): Promise<readonly Hex[]> {
    const data = encodeFunctionData({ abi: indexRegistryAbi, functionName: "getTrackedTokens" });
    return decodeFunctionResult({
      abi: indexRegistryAbi,
      functionName: "getTrackedTokens",
      data: await this.call(registry, data),
    });
  }

  async constituent(registry: Hex, token: Hex): Promise<IndexConstituentSnapshot> {
    const data = encodeFunctionData({
      abi: indexRegistryAbi,
      functionName: "getConstituent",
      args: [token],
    });
    const result = decodeFunctionResult({
      abi: indexRegistryAbi,
      functionName: "getConstituent",
      data: await this.call(registry, data),
    });
    return { feed: result.feed, uid: result.uid, status: result.status };
  }

  private async call(to: Hex, data: Hex): Promise<Hex> {
    const response = await this.fetchImplementation(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.requestId,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    const payload = await response.json().catch(() => undefined) as RpcResponse | undefined;
    if (!response.ok || !payload?.result || payload.error) {
      throw new Error(`Index registry RPC read failed with status ${response.status}`);
    }
    return payload.result;
  }
}
