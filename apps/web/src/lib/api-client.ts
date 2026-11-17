export interface ApiErrorBody {
  readonly error: { readonly code: string };
}

export class ApiClientError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

export interface RegistryChangeDto {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly block_number: number;
  readonly change_kind:
    | "configuration_proposed"
    | "configuration_cancelled"
    | "configuration_executed"
    | "constituent_configured"
    | "constituent_removed";
  readonly configuration_hash: string | null;
  readonly registry_version: number | null;
  readonly token_address: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly observed_at: string;
}

export interface PublicConfigDto {
  readonly appEnvironment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly blockExplorerUrl: string;
  readonly vaultAddress: string;
  readonly usdgAddress: string;
  readonly walletConnectProjectId: string;
}

export interface IndexHoldingDto {
  readonly tokenAddress: string;
  readonly rawBalance: string;
  readonly uiMultiplier18: string;
  readonly normalizedPriceUsd18: string | null;
  readonly valueUsd18: string | null;
  readonly oracleHealth: "unconfigured" | "live" | "stale" | "paused" | "invalid" | null;
  readonly oracleUpdatedAt: number | null;
}

export interface IndexStateDto {
  readonly blockNumber: number;
  readonly navUsd18: string;
  readonly totalSupply18: string;
  readonly sharePriceUsd18: string | null;
  readonly oracleHealth: Readonly<Record<string, string>>;
  readonly observedAt: string;
  readonly holdings: readonly IndexHoldingDto[];
}

export interface AssetDto {
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly assetUid: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly feedAddress: string | null;
  readonly registryVersion: number;
  readonly sourceBlock: number;
  readonly updatedAt: string;
  readonly targetWeightBps: number;
  readonly eligibleFrom: number;
  readonly exitAfter: number;
  readonly registryStatus: "none" | "active" | "removed";
}

export interface NavHistoryPointDto {
  readonly blockNumber: number;
  readonly navUsd18: string;
  readonly totalSupply18: string;
  readonly sharePriceUsd18: string | null;
  readonly oracleHealth: Readonly<Record<string, string>>;
  readonly observedAt: string;
}

export interface CashQuoteDto {
  readonly blockNumber: string;
  readonly direction: "deposit" | "redeem";
  readonly inputAmount: string;
  readonly outputAmount: string;
  readonly feeAmount: string;
}

export interface WalletChallengeDto {
  readonly message: string;
  readonly expiresAt: string;
}

export interface WalletTransactionDto {
  readonly transactionHash: string;
  readonly action: string;
  readonly status: "pending" | "confirmed" | "failed" | "replaced";
  readonly blockNumber: number | null;
  readonly assetAmount: string | null;
  readonly shareAmount: string | null;
  readonly failureCode: string | null;
  readonly submittedAt: string;
  readonly finalizedAt: string | null;
}

export class FloatsApiClient {
  public constructor(private readonly basePath = resolveApiBaseUrl()) {}

  public getPublicConfig(signal?: AbortSignal): Promise<PublicConfigDto> {
    return this.get<PublicConfigDto>("/config", signal);
  }

  public getRegistryChanges(limit = 50, signal?: AbortSignal): Promise<readonly RegistryChangeDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Registry change limit must be between 1 and 100");
    }
    return this.get<readonly RegistryChangeDto[]>(`/registry-changes?limit=${limit}`, signal);
  }

  public getIndexState(signal?: AbortSignal): Promise<IndexStateDto | null> {
    return this.get<IndexStateDto | null>("/index-state", signal);
  }

  public getAssets(signal?: AbortSignal): Promise<readonly AssetDto[]> {
    return this.get<readonly AssetDto[]>("/assets", signal);
  }

  public getNavHistory(limit = 500, signal?: AbortSignal): Promise<readonly NavHistoryPointDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 1000) {
      throw new Error("NAV history limit must be between 2 and 1000");
    }
    return this.get<readonly NavHistoryPointDto[]>(`/nav-history?limit=${limit}`, signal);
  }

  public quoteCash(
    direction: CashQuoteDto["direction"],
    amount: string,
    signal?: AbortSignal,
  ): Promise<CashQuoteDto> {
    if (!/^[1-9][0-9]{0,77}$/.test(amount)) throw new Error("Quote amount is invalid");
    return this.post<CashQuoteDto>("/quote", { direction, amount }, signal);
  }

  public getWalletChallenge(address: string, signal?: AbortSignal): Promise<WalletChallengeDto> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Wallet address is invalid");
    return this.get<WalletChallengeDto>(`/wallet-history?address=${encodeURIComponent(address)}`, signal);
  }

  public getWalletHistory(
    message: string,
    signature: string,
    signal?: AbortSignal,
  ): Promise<readonly WalletTransactionDto[]> {
    if (!message || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("Wallet proof is invalid");
    return this.post<readonly WalletTransactionDto[]>("/wallet-history", { message, signature }, signal);
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.basePath}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      signal,
    });
    const body = await response.json() as { readonly data?: T } | ApiErrorBody;
    if (!response.ok || !("data" in body)) {
      const code = "error" in body ? body.error.code : "INVALID_API_RESPONSE";
      throw new ApiClientError(code, response.status);
    }
    return body.data as T;
  }

  private async post<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.basePath}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
      signal,
    });
    const body = await response.json() as { readonly data?: T } | ApiErrorBody;
    if (!response.ok || !("data" in body)) {
      const code = "error" in body ? body.error.code : "INVALID_API_RESPONSE";
      throw new ApiClientError(code, response.status);
    }
    return body.data as T;
  }
}

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) return "/api";
  return `${configured.replace(/\/+$/, "")}/api`;
}

export const floatApi = new FloatsApiClient();
