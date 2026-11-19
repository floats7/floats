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

export interface OperationalActionDto {
  readonly transaction_hash: string;
  readonly log_index: number;
  readonly block_number: number;
  readonly module: "vault" | "fees" | "rebalance";
  readonly action: string;
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
  readonly optionsMarketAddress: string | null;
  readonly optionsVaultAddress: string | null;
  readonly optionTokenAddress: string | null;
  readonly spotRoutes: readonly SpotRouteDto[];
  readonly crossChainRoutes: readonly CrossChainRouteDto[];
}

export interface SpotRouteDto {
  readonly tokenAddress: string;
  readonly routerAddress: string;
  readonly quoterAddress: string;
  readonly fee: number;
}

export interface CrossChainRouteDto {
  readonly id: string;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly sourceTokenAddress: string;
  readonly sourceRequiresApproval: boolean;
  readonly minimumReceivedBps: number;
  readonly enforcedOptions: string;
  readonly sourceNetworkName: string;
  readonly sourceChainId: number;
  readonly sourceEid: number;
  readonly sourceContract: string;
  readonly sourceExplorerUrl: string;
  readonly destinationChainId: number;
  readonly destinationNetworkName: string;
  readonly destinationEid: number;
  readonly destinationContract: string;
  readonly destinationTokenAddress: string;
  readonly destinationExplorerUrl: string;
  readonly layerZeroScanUrl: string;
  readonly maximumNavAgeSeconds: number;
}

export interface CrossChainMessageDto {
  readonly sourceChainId: number;
  readonly destinationChainId: number;
  readonly sourceEid: number;
  readonly destinationEid: number;
  readonly guid: string;
  readonly sender: string;
  readonly recipient: string;
  readonly token: string;
  readonly amountLocal: string;
  readonly nativeFee: string;
  readonly state: "pending" | "delivered" | "retryable" | "failed";
  readonly sourceTransactionHash: string;
  readonly destinationTransactionHash: string | null;
  readonly sentAt: string;
  readonly updatedAt: string;
}

export interface CrossChainNavDto {
  readonly sourceChainId: number;
  readonly destinationChainId: number;
  readonly sourceEid: number;
  readonly destinationEid: number;
  readonly guid: string;
  readonly sequence: string;
  readonly nav18: string;
  readonly canonicalTotalSupply18: string;
  readonly state: "published" | "mirrored";
  readonly sourceTransactionHash: string;
  readonly destinationTransactionHash: string | null;
  readonly observedAt: string;
  readonly publishedAt: string;
  readonly mirroredAt: string | null;
  readonly updatedAt: string;
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

export interface FeeRatesDto {
  readonly blockNumber: string;
  readonly managementBps: number;
  readonly cashBps: number;
  readonly inKindBps: number;
  readonly offHoursBps: number;
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

export interface OptionsSeriesDto {
  readonly seriesId: string;
  readonly underlying: string;
  readonly underlyingSymbol: string | null;
  readonly underlyingUid: string;
  readonly priceSource: string;
  readonly kind: string;
  readonly strikeUsd18: string;
  readonly capUsd18: string;
  readonly expiry: string;
  readonly contractSize18: string;
  readonly corporateActionPolicyVersion: string;
  readonly state: string;
  readonly settlementPriceUsd18: string | null;
  readonly payoffPerUnitUsd18: string | null;
  readonly totalClaimable6: string | null;
  readonly manualSettlement: boolean | null;
  readonly createdAt: string;
}

export interface OptionsVaultStateDto {
  readonly blockNumber: string;
  readonly totalAssets6: string;
  readonly reservedCollateral6: string;
  readonly claimableCollateral6: string;
  readonly payableWithdrawalAssets6: string;
  readonly totalSupply18: string;
  readonly utilizationBps: number;
  readonly operationsPaused: boolean;
}

export interface SignedOptionsQuoteDto {
  readonly quote: {
    readonly seriesId: string;
    readonly side: number;
    readonly buyer: string;
    readonly size18: string;
    readonly premiumPerUnit6: string;
    readonly signedSpotUsd18: string;
    readonly nonce: string;
    readonly issuedAt: number;
    readonly validUntil: number;
  };
  readonly signature: string;
  readonly fairValueUsd: number;
  readonly volatility: number;
  readonly ivSource: string;
  readonly spreadBps: number;
  readonly utilizationBps: number;
}

export interface OptionsPortfolioDto {
  readonly walletAddress: string;
  readonly positions: readonly {
    readonly seriesId: string;
    readonly underlying: string;
    readonly underlyingSymbol: string | null;
    readonly size18: string;
    readonly netCashFlow6: string;
    readonly updatedAt: string;
  }[];
  readonly withdrawals: readonly {
    readonly requestId: string;
    readonly state: string;
    readonly receiverAddress: string;
    readonly shares: string;
    readonly assets6: string | null;
    readonly unlockAt: string;
    readonly updatedAt: string;
  }[];
}

export interface WalletDataDto {
  readonly walletAddress: string;
  readonly transactions: readonly WalletTransactionDto[];
  readonly optionsPortfolio: OptionsPortfolioDto;
}

export interface PublicActivityDto {
  readonly transactionHash: string;
  readonly blockNumber: number | null;
  readonly walletAddress: string;
  readonly action: string;
  readonly assetAmount: string | null;
  readonly shareAmount: string | null;
  readonly observedAt: string;
}

export interface MarketProductDto {
  readonly id: "mint-redeem" | "options" | "liquidity" | "spot";
  readonly label: string;
  readonly enabled: boolean;
  readonly disabledReason?: string;
}

export interface MarketAssetDto {
  readonly id: string;
  readonly kind: "index" | "constituent" | "candidate";
  readonly address: string;
  readonly uid: string | null;
  readonly symbol: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly decimals: number;
  readonly status: "active" | "removed" | "unavailable";
  readonly priceUsd18: string | null;
  readonly targetWeightBps: number | null;
  readonly oracleHealth: string | null;
  readonly products: readonly MarketProductDto[];
  readonly activeOptionSeries: number;
  readonly chartKind: "nav" | "price";
}

export interface MarketHistoryPointDto {
  readonly blockNumber: number;
  readonly valueUsd18: string;
  readonly observedAt: string;
}

export interface MarketCandidateDto {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly status: MarketCandidateStatus;
  readonly ipoDate: string | null;
  readonly listingDate: string | null;
  readonly eligibleFrom: string | null;
  readonly tokenAddress: string | null;
  readonly officialTokenName: string | null;
  readonly tokenDecimals: number | null;
  readonly currentMultiplier: string | null;
  readonly pendingMultiplier: string | null;
  readonly tradingCapabilities: {
    readonly market: TradingCapabilityState;
    readonly extended: TradingCapabilityState;
    readonly overnight: TradingCapabilityState;
  };
  readonly officialMetadataObservedAt: string | null;
  readonly tradingHalted: boolean | null;
  readonly officialQuoteGeneratedAt: string | null;
  readonly logoUrl: string | null;
  readonly checks: { readonly tokenLive: boolean; readonly priceFeed: boolean; readonly liquidity: boolean };
  readonly oracle: {
    readonly feedAddress: string | null;
    readonly healthySince: string | null;
    readonly lastPrice18: string | null;
    readonly lastFailure: string | null;
  };
  readonly liquidity: {
    readonly dexReferencePrice18: string | null;
    readonly observedAt: string | null;
  };
  readonly governanceApproved: boolean;
  readonly productControls: {
    readonly spotPaused: boolean;
    readonly optionsPaused: boolean;
    readonly optionsExposureWarning: boolean;
    readonly reason: string | null;
    readonly updatedAt: string | null;
  };
  readonly disabledReason: string | null;
  readonly sourceUrl: string | null;
  readonly lastCheckedAt: string | null;
  readonly publication: {
    readonly detectedAt: string | null;
    readonly availableAt: string | null;
    readonly slaSeconds: number | null;
    readonly targetSeconds: number;
    readonly withinTarget: boolean | null;
  };
}

export interface MarketCandidateReadinessDto {
  readonly candidateId: string;
  readonly symbol: string;
  readonly canonicalAddress: string | null;
  readonly checkedAt: string | null;
  readonly tiers: Readonly<Record<"market" | "spot" | "options" | "index", {
    readonly ready: boolean;
    readonly gates: Readonly<Record<string, boolean>>;
    readonly blockers: readonly string[];
  }>>;
  readonly signoffs: readonly {
    readonly id: number;
    readonly tier: "market" | "spot" | "options" | "index";
    readonly decision: "approved" | "rejected";
    readonly governanceOrCanaryReference: string | null;
    readonly signedAt: string;
  }[];
}

export type TradingCapabilityState = "tradable" | "restricted" | "unavailable" | "unknown";

export type MarketCandidateStatus =
  | "upcoming"
  | "listing_expected"
  | "listed"
  | "token_pending"
  | "detected"
  | "verification_pending"
  | "approval_pending"
  | "rejected"
  | "suspected_fake"
  | "token_live"
  | "oracle_pending"
  | "liquidity_pending"
  | "governance_pending"
  | "active"
  | "suspended"
  | "removed";

export class FloatsApiClient {
  public constructor(private readonly basePath = resolveApiBaseUrl()) {}

  public getPublicConfig(signal?: AbortSignal): Promise<PublicConfigDto> {
    return this.get<PublicConfigDto>("/config", signal);
  }

  public getBridgeMessages(
    limit = 50,
    signal?: AbortSignal,
  ): Promise<readonly CrossChainMessageDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Bridge message limit must be between 1 and 100");
    }
    return this.get<readonly CrossChainMessageDto[]>(`/bridge/messages?limit=${limit}`, signal);
  }

  public getBridgeMessage(
    sourceEid: number,
    guid: string,
    signal?: AbortSignal,
  ): Promise<CrossChainMessageDto> {
    if (!Number.isSafeInteger(sourceEid) || sourceEid <= 0) {
      throw new Error("Source EID must be a positive integer");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(guid)) throw new Error("Message GUID is invalid");
    return this.get<CrossChainMessageDto>(
      `/bridge/messages/${sourceEid}/${guid.toLowerCase()}`,
      signal,
    );
  }

  public getBridgeNav(
    destinationChainId?: number,
    signal?: AbortSignal,
  ): Promise<CrossChainNavDto | null> {
    if (
      destinationChainId !== undefined
      && (!Number.isSafeInteger(destinationChainId) || destinationChainId <= 0)
    ) {
      throw new Error("Destination chain ID must be a positive integer");
    }
    const query = destinationChainId === undefined
      ? ""
      : `?destinationChainId=${destinationChainId}`;
    return this.get<CrossChainNavDto | null>(`/bridge/nav${query}`, signal);
  }

  public requestOptionsQuote(
    input: { seriesId: string; buyer: string; side: "buy" | "sell-back"; size18: string },
    signal?: AbortSignal,
  ): Promise<SignedOptionsQuoteDto> {
    return this.post<SignedOptionsQuoteDto>("/options/quote", input, signal);
  }

  public getFeeRates(signal?: AbortSignal): Promise<FeeRatesDto> {
    return this.get<FeeRatesDto>("/fee-rates", signal);
  }

  public getRegistryChanges(limit = 50, signal?: AbortSignal): Promise<readonly RegistryChangeDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Registry change limit must be between 1 and 100");
    }
    return this.get<readonly RegistryChangeDto[]>(`/registry-changes?limit=${limit}`, signal);
  }

  public getOperationalActions(
    module: OperationalActionDto["module"],
    limit = 20,
    signal?: AbortSignal,
  ): Promise<readonly OperationalActionDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Operational action limit must be between 1 and 100");
    }
    return this.get<readonly OperationalActionDto[]>(`/operations?module=${module}&limit=${limit}`, signal);
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

  public getOptionsSeries(signal?: AbortSignal): Promise<readonly OptionsSeriesDto[]> {
    return this.get<readonly OptionsSeriesDto[]>("/options/series", signal);
  }

  public getMarkets(signal?: AbortSignal): Promise<readonly MarketAssetDto[]> {
    return this.get<readonly MarketAssetDto[]>("/markets", signal);
  }

  public getMarketCandidates(signal?: AbortSignal): Promise<readonly MarketCandidateDto[]> {
    return this.get<readonly MarketCandidateDto[]>("/market-candidates", signal);
  }

  public getMarketCandidateReadiness(
    candidateId: string,
    signal?: AbortSignal,
  ): Promise<MarketCandidateReadinessDto> {
    return this.get<MarketCandidateReadinessDto>(
      `/market-candidates/${encodeURIComponent(candidateId)}/readiness`,
      signal,
    );
  }

  public getMarketCandidateHistory(
    candidateId: string,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<readonly MarketHistoryPointDto[]> {
    if (!/^[a-z0-9-]{1,80}$/.test(candidateId)) throw new Error("Market candidate ID is invalid");
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 1000) {
      throw new Error("Market history limit must be between 2 and 1000");
    }
    return this.get<readonly MarketHistoryPointDto[]>(
      `/market-candidates/${encodeURIComponent(candidateId)}/history?limit=${limit}`,
      signal,
    );
  }

  public getMarket(assetId: string, signal?: AbortSignal): Promise<MarketAssetDto> {
    return this.get<MarketAssetDto>(`/markets/${marketAssetId(assetId)}`, signal);
  }

  public getMarketHistory(
    assetId: string,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<readonly MarketHistoryPointDto[]> {
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 1000) {
      throw new Error("Market history limit must be between 2 and 1000");
    }
    return this.get<readonly MarketHistoryPointDto[]>(
      `/markets/${marketAssetId(assetId)}/history?limit=${limit}`,
      signal,
    );
  }

  public getOptionsVaultState(signal?: AbortSignal): Promise<OptionsVaultStateDto | null> {
    return this.get<OptionsVaultStateDto | null>("/options/vault", signal);
  }

  public getPublicActivity(limit = 25, signal?: AbortSignal): Promise<readonly PublicActivityDto[]> {
    return this.get<readonly PublicActivityDto[]>(`/activity?limit=${limit}`, signal);
  }

  public getWalletDataChallenge(address: string, signal?: AbortSignal): Promise<WalletChallengeDto> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Wallet address is invalid");
    return this.get<WalletChallengeDto>(`/wallet-data?address=${encodeURIComponent(address)}`, signal);
  }

  public getWalletData(message: string, signature: string, signal?: AbortSignal): Promise<WalletDataDto> {
    if (!message || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("Wallet proof is invalid");
    return this.post<WalletDataDto>("/wallet-data", { message, signature }, signal);
  }

  public getOptionsPortfolioChallenge(
    address: string,
    signal?: AbortSignal,
  ): Promise<WalletChallengeDto> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Wallet address is invalid");
    return this.get<WalletChallengeDto>(
      `/options/portfolio?address=${encodeURIComponent(address)}`,
      signal,
    );
  }

  public getOptionsPortfolio(
    message: string,
    signature: string,
    signal?: AbortSignal,
  ): Promise<OptionsPortfolioDto> {
    if (!message || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      throw new Error("Wallet proof is invalid");
    }
    return this.post<OptionsPortfolioDto>(
      "/options/portfolio",
      { message, signature },
      signal,
    );
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
      cache: "no-store",
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

function marketAssetId(value: string): string {
  if (value.toLowerCase() === "index") return "index";
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Market asset ID is invalid");
  return value.toLowerCase();
}

export const floatApi = new FloatsApiClient();
