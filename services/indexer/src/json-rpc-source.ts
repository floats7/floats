import { decodeFloatsCoreLog, FLOATS_CORE_EVENT_TOPICS } from "./event-decoder.ts";
import type { Address, ChainBlock, ChainEventSource, DecodedProtocolEvent, Hex } from "./types.ts";

interface RpcLog {
  readonly address: Address;
  readonly blockNumber: Hex;
  readonly blockHash: Hex;
  readonly transactionHash: Hex;
  readonly transactionIndex: Hex;
  readonly logIndex: Hex;
  readonly data: Hex;
  readonly topics: readonly Hex[];
  readonly removed?: boolean;
}

interface RpcBlock {
  readonly number: Hex;
  readonly hash: Hex;
  readonly timestamp: Hex;
}

interface RpcResponse<T> {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly result?: T;
  readonly error?: { readonly code: number; readonly message: string };
}

export class JsonRpcError extends Error {
  public constructor(public readonly code: number) {
    super(`JSON-RPC request failed with code ${code}`);
    this.name = "JsonRpcError";
  }
}

export class RobinhoodJsonRpcSource implements ChainEventSource {
  readonly #fetch: typeof globalThis.fetch;
  readonly #addresses: readonly Address[];
  #requestId = 0;

  public constructor(
    private readonly rpcUrl: URL,
    addresses: readonly Address[],
    fetchImplementation?: typeof globalThis.fetch,
  ) {
    if (rpcUrl.protocol !== "https:" && rpcUrl.hostname !== "127.0.0.1" && rpcUrl.hostname !== "localhost") {
      throw new Error("RPC URL must use HTTPS outside local development");
    }
    if (addresses.length === 0) throw new Error("At least one contract address is required");
    this.#addresses = [...new Set(addresses.map(normalizeAddress))];
    this.#fetch = fetchImplementation ?? globalThis.fetch;
  }

  public async getHeadBlockNumber(): Promise<bigint> {
    return BigInt(await this.call<Hex>("eth_blockNumber", []));
  }

  public async getBlock(blockNumber: bigint): Promise<ChainBlock> {
    const block = await this.call<RpcBlock | null>("eth_getBlockByNumber", [toQuantity(blockNumber), false]);
    if (!block) throw new Error("BLOCK_NOT_FOUND");
    return {
      number: BigInt(block.number),
      hash: block.hash,
      timestamp: new Date(Number(BigInt(block.timestamp)) * 1_000),
    };
  }

  public async callContract(to: Address, data: Hex, blockNumber: bigint): Promise<Hex> {
    if (!/^0x[0-9a-fA-F]*$/.test(data) || data.length % 2 !== 0) {
      throw new Error("Invalid contract call data");
    }
    return this.call<Hex>("eth_call", [{ to: normalizeAddress(to), data }, toQuantity(blockNumber)]);
  }

  public async getEvents(fromBlock: bigint, toBlock: bigint): Promise<readonly DecodedProtocolEvent[]> {
    const logs = await this.call<readonly RpcLog[]>("eth_getLogs", [{
      fromBlock: toQuantity(fromBlock),
      toBlock: toQuantity(toBlock),
      address: this.#addresses,
      topics: [FLOATS_CORE_EVENT_TOPICS],
    }]);
    const uniqueBlocks = [...new Set(logs.filter((log) => !log.removed).map((log) => log.blockNumber))];
    const blocks = await Promise.all(uniqueBlocks.map(async (number) => [number, await this.getBlock(BigInt(number))] as const));
    const blockByNumber = new Map(blocks);

    return logs
      .filter((log) => !log.removed)
      .flatMap((log) => {
        const decoded = decodeFloatsCoreLog(log);
        if (!decoded) return [];
        const block = blockByNumber.get(log.blockNumber);
        if (!block || block.hash.toLowerCase() !== log.blockHash.toLowerCase()) throw new Error("LOG_BLOCK_MISMATCH");
        return [{
          blockNumber: BigInt(log.blockNumber),
          blockHash: log.blockHash,
          blockTimestamp: block.timestamp,
          transactionHash: log.transactionHash,
          transactionIndex: Number(BigInt(log.transactionIndex)),
          logIndex: Number(BigInt(log.logIndex)),
          contractAddress: normalizeAddress(log.address),
          eventName: decoded.eventName,
          payload: decoded.payload,
        }];
      })
      .sort(compareLogs);
  }

  private async call<T>(method: string, params: readonly unknown[]): Promise<T> {
    const response = await this.#fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.#requestId, method, params }),
    });
    const payload = (await response.json().catch(() => undefined)) as RpcResponse<T> | undefined;
    if (!response.ok) {
      if (payload?.error) throw new JsonRpcError(payload.error.code);
      throw new Error(`RPC transport failed with status ${response.status}`);
    }
    if (!payload) throw new Error("RPC_RESPONSE_INVALID");
    if (payload.error) throw new JsonRpcError(payload.error.code);
    if (payload.result === undefined) throw new Error("RPC_RESULT_MISSING");
    return payload.result;
  }
}

function toQuantity(value: bigint): Hex {
  if (value < 0n) throw new Error("Block number cannot be negative");
  return `0x${value.toString(16)}`;
}

function normalizeAddress(value: Address): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid contract address");
  return value.toLowerCase() as Address;
}

function compareLogs(left: DecodedProtocolEvent, right: DecodedProtocolEvent): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) return left.transactionIndex - right.transactionIndex;
  return left.logIndex - right.logIndex;
}
