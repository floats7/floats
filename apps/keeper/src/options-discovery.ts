import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import type { Hex, TransactionRequest } from "./types.ts";

const registryAbi = parseAbi([
  "function computeSeriesId((address underlying,bytes32 underlyingUid,address priceSource,uint8 kind,uint256 strikeUsd18,uint256 capUsd18,uint48 expiry,uint256 contractSize18,uint32 corporateActionPolicyVersion) terms) pure returns (bytes32)",
  "function seriesExists(bytes32 seriesId) view returns (bool)",
  "function getSeries(bytes32 seriesId) view returns ((address underlying,bytes32 underlyingUid,address priceSource,uint8 kind,uint256 strikeUsd18,uint256 capUsd18,uint48 expiry,uint256 contractSize18,uint32 corporateActionPolicyVersion) terms,uint8 state)",
  "function createSeries((address underlying,bytes32 underlyingUid,address priceSource,uint8 kind,uint256 strikeUsd18,uint256 capUsd18,uint48 expiry,uint256 contractSize18,uint32 corporateActionPolicyVersion) terms) returns (bytes32)",
  "function setSeriesState(bytes32 seriesId,uint8 next)",
  "function isUnderlyingEnabled(address underlying) view returns (bool)",
  "function underlyingUid(address underlying) view returns (bytes32)",
  "function underlyingPriceSource(address underlying) view returns (address)",
  "function configureUnderlying(address underlying,bytes32 uid,address priceSource,bool enabled)",
]);

const settlementEngineAbi = parseAbi([
  "function settle(bytes32 seriesId)",
]);

const vaultAbi = parseAbi([
  "function withdrawalRequests(uint256 requestId) view returns (address owner,address receiver,uint256 shares,uint256 assets,uint48 unlockAt,uint8 state)",
  "function finalizeWithdrawal(uint256 requestId)",
]);

const TRADING_CLOSED = 1;
const ACTIVE = 0;
const SUSPENDED = 2;
const WITHDRAWAL_REQUESTED = 1;

export interface OptionsSeriesTerms {
  readonly underlying: Hex;
  readonly underlyingUid: Hex;
  readonly priceSource: Hex;
  readonly kind: number;
  readonly strikeUsd18: bigint;
  readonly capUsd18: bigint;
  readonly expiry: number;
  readonly contractSize18: bigint;
  readonly corporateActionPolicyVersion: number;
}

interface SeriesSnapshot {
  readonly terms: OptionsSeriesTerms;
  readonly state: number;
}

interface WithdrawalSnapshot {
  readonly unlockAt: number;
  readonly state: number;
}

export interface OptionsUnderlyingConfiguration {
  readonly underlying: Hex;
  readonly underlyingUid: Hex;
  readonly priceSource: Hex;
  readonly enabled: boolean;
}

export interface OptionsContractReader {
  computeSeriesId(registry: Hex, terms: OptionsSeriesTerms): Promise<Hex>;
  seriesExists(registry: Hex, seriesId: Hex): Promise<boolean>;
  getSeries(registry: Hex, seriesId: Hex): Promise<SeriesSnapshot>;
  getWithdrawal(vault: Hex, requestId: bigint): Promise<WithdrawalSnapshot>;
  getUnderlying(registry: Hex, underlying: Hex): Promise<OptionsUnderlyingConfiguration>;
}

interface RpcResponse {
  readonly result?: Hex;
  readonly error?: { readonly code: number };
}

export class JsonRpcOptionsContractReader implements OptionsContractReader {
  private requestId = 0;

  constructor(
    private readonly rpcUrl: URL,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    if (
      rpcUrl.protocol !== "https:" &&
      rpcUrl.hostname !== "127.0.0.1" &&
      rpcUrl.hostname !== "localhost"
    ) {
      throw new Error("Options keeper RPC URL must use HTTPS outside local development");
    }
  }

  async computeSeriesId(registry: Hex, terms: OptionsSeriesTerms): Promise<Hex> {
    const data = encodeFunctionData({
      abi: registryAbi,
      functionName: "computeSeriesId",
      args: [terms],
    });
    return decodeFunctionResult({
      abi: registryAbi,
      functionName: "computeSeriesId",
      data: await this.call(registry, data),
    });
  }

  async seriesExists(registry: Hex, seriesId: Hex): Promise<boolean> {
    const data = encodeFunctionData({
      abi: registryAbi,
      functionName: "seriesExists",
      args: [seriesId],
    });
    return decodeFunctionResult({
      abi: registryAbi,
      functionName: "seriesExists",
      data: await this.call(registry, data),
    });
  }

  async getSeries(registry: Hex, seriesId: Hex): Promise<SeriesSnapshot> {
    const data = encodeFunctionData({
      abi: registryAbi,
      functionName: "getSeries",
      args: [seriesId],
    });
    const [terms, state] = decodeFunctionResult({
      abi: registryAbi,
      functionName: "getSeries",
      data: await this.call(registry, data),
    });
    return {
      terms: {
        ...terms,
        kind: Number(terms.kind),
        expiry: Number(terms.expiry),
        corporateActionPolicyVersion: Number(terms.corporateActionPolicyVersion),
      },
      state,
    };
  }

  async getWithdrawal(vault: Hex, requestId: bigint): Promise<WithdrawalSnapshot> {
    const data = encodeFunctionData({
      abi: vaultAbi,
      functionName: "withdrawalRequests",
      args: [requestId],
    });
    const [, , , , unlockAt, state] = decodeFunctionResult({
      abi: vaultAbi,
      functionName: "withdrawalRequests",
      data: await this.call(vault, data),
    });
    return { unlockAt: Number(unlockAt), state };
  }

  async getUnderlying(registry: Hex, underlying: Hex): Promise<OptionsUnderlyingConfiguration> {
    const [enabled, underlyingUid, priceSource] = await Promise.all([
      this.readRegistry(registry, "isUnderlyingEnabled", [underlying]),
      this.readRegistry(registry, "underlyingUid", [underlying]),
      this.readRegistry(registry, "underlyingPriceSource", [underlying]),
    ]);
    return {
      underlying,
      enabled: enabled as boolean,
      underlyingUid: underlyingUid as Hex,
      priceSource: priceSource as Hex,
    };
  }

  private async readRegistry(
    registry: Hex,
    functionName: "isUnderlyingEnabled" | "underlyingUid" | "underlyingPriceSource",
    args: readonly [Hex],
  ): Promise<unknown> {
    const data = encodeFunctionData({ abi: registryAbi, functionName, args });
    return decodeFunctionResult({
      abi: registryAbi,
      functionName,
      data: await this.call(registry, data),
    });
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
    const payload = (await response.json().catch(() => undefined)) as RpcResponse | undefined;
    if (!response.ok || !payload || payload.error || !payload.result) {
      throw new Error(`Options keeper RPC read failed with status ${response.status}`);
    }
    return payload.result;
  }
}

export interface OptionsAddresses {
  readonly registry: Hex;
  readonly settlementEngine: Hex;
  readonly vault: Hex;
}

export interface DiscoveredOptionsAction {
  readonly id: Hex | bigint;
  readonly request: TransactionRequest;
}

export class OptionsActionDiscovery {
  constructor(
    private readonly reader: OptionsContractReader,
    private readonly addresses: OptionsAddresses,
  ) {}

  async underlyingConfiguration(
    desired: OptionsUnderlyingConfiguration,
  ): Promise<DiscoveredOptionsAction | undefined> {
    const current = await this.reader.getUnderlying(this.addresses.registry, desired.underlying);
    if (
      current.enabled === desired.enabled &&
      current.underlyingUid.toLowerCase() === desired.underlyingUid.toLowerCase() &&
      current.priceSource.toLowerCase() === desired.priceSource.toLowerCase()
    ) return undefined;
    return {
      id: desired.underlying,
      request: {
        to: this.addresses.registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "configureUnderlying",
          args: [desired.underlying, desired.underlyingUid, desired.priceSource, desired.enabled],
        }),
        value: 0n,
      },
    };
  }

  async seriesCreation(terms: OptionsSeriesTerms): Promise<DiscoveredOptionsAction | undefined> {
    const seriesId = await this.reader.computeSeriesId(this.addresses.registry, terms);
    if (await this.reader.seriesExists(this.addresses.registry, seriesId)) return undefined;
    return {
      id: seriesId,
      request: {
        to: this.addresses.registry,
        data: encodeFunctionData({ abi: registryAbi, functionName: "createSeries", args: [terms] }),
        value: 0n,
      },
    };
  }

  async settlement(
    seriesId: Hex,
    observedAtSeconds: number,
  ): Promise<DiscoveredOptionsAction | undefined> {
    const snapshot = await this.reader.getSeries(this.addresses.registry, seriesId);
    if (snapshot.state !== TRADING_CLOSED || observedAtSeconds < snapshot.terms.expiry) {
      return undefined;
    }
    return {
      id: seriesId,
      request: {
        to: this.addresses.settlementEngine,
        data: encodeFunctionData({
          abi: settlementEngineAbi,
          functionName: "settle",
          args: [seriesId],
        }),
        value: 0n,
      },
    };
  }

  async tradingClose(
    seriesId: Hex,
    observedAtSeconds: number,
  ): Promise<DiscoveredOptionsAction | undefined> {
    const snapshot = await this.reader.getSeries(this.addresses.registry, seriesId);
    if (
      (snapshot.state !== ACTIVE && snapshot.state !== SUSPENDED)
      || observedAtSeconds < snapshot.terms.expiry
    ) return undefined;
    return {
      id: seriesId,
      request: {
        to: this.addresses.registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "setSeriesState",
          args: [seriesId, TRADING_CLOSED],
        }),
        value: 0n,
      },
    };
  }

  async withdrawal(
    requestId: bigint,
    observedAtSeconds: number,
  ): Promise<DiscoveredOptionsAction | undefined> {
    const snapshot = await this.reader.getWithdrawal(this.addresses.vault, requestId);
    if (snapshot.state !== WITHDRAWAL_REQUESTED || observedAtSeconds < snapshot.unlockAt) {
      return undefined;
    }
    return {
      id: requestId,
      request: {
        to: this.addresses.vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "finalizeWithdrawal",
          args: [requestId],
        }),
        value: 0n,
      },
    };
  }
}

export const OPTIONS_READ_ABIS = {
  registry: registryAbi,
  vault: vaultAbi,
} as const;
