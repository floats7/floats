import { createPublicClient, http, parseAbi, type Address } from "viem";

const metadataAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

export interface TokenMetadata {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface TokenMetadataSource {
  read(address: string): Promise<TokenMetadata | null>;
}

export class TokenMetadataReader implements TokenMetadataSource {
  readonly #client;
  readonly #cache = new Map<string, Promise<TokenMetadata | null>>();

  public constructor(rpcUrl: URL) {
    this.#client = createPublicClient({ transport: http(rpcUrl.toString()) });
  }

  public read(address: string): Promise<TokenMetadata | null> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid token address");
    const key = address.toLowerCase();
    const cached = this.#cache.get(key);
    if (cached) return cached;
    const request = this.#read(key as Address);
    this.#cache.set(key, request);
    return request;
  }

  async #read(address: Address): Promise<TokenMetadata | null> {
    try {
      const [name, symbol, decimals] = await Promise.all([
        this.#client.readContract({ address, abi: metadataAbi, functionName: "name" }),
        this.#client.readContract({ address, abi: metadataAbi, functionName: "symbol" }),
        this.#client.readContract({ address, abi: metadataAbi, functionName: "decimals" }),
      ]);
      const normalizedName = name.trim();
      const normalizedSymbol = symbol.trim();
      if (!normalizedName || !normalizedSymbol) return null;
      return { name: normalizedName, symbol: normalizedSymbol, decimals };
    } catch {
      return null;
    }
  }
}
