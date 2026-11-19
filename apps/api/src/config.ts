export type AppEnvironment = "testnet" | "mainnet";

export interface ServerConfig {
  readonly appEnvironment: AppEnvironment;
  readonly chainId: number;
  readonly blockExplorerUrl: URL;
  readonly supabaseUrl: URL;
  readonly supabaseSecretKey: string;
}

export interface PublicConfig {
  readonly appEnvironment: AppEnvironment;
  readonly chainId: number;
  readonly blockExplorerUrl: string;
  readonly vaultAddress: string;
  readonly usdgAddress: string;
  readonly walletConnectProjectId: string;
  readonly optionsMarketAddress: string | null;
  readonly optionsVaultAddress: string | null;
  readonly optionTokenAddress: string | null;
  readonly spotRoutes: readonly PublicSpotRoute[];
  readonly crossChainRoutes: readonly PublicCrossChainRoute[];
}

export interface PublicSpotRoute {
  readonly tokenAddress: string;
  readonly routerAddress: string;
  readonly quoterAddress: string;
  readonly fee: number;
}

export interface PublicCrossChainRoute {
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

export interface PublicProtocolAddresses {
  readonly vaultAddress: string;
  readonly usdgAddress: string;
  readonly optionsMarketAddress?: string;
  readonly optionsVaultAddress?: string;
  readonly optionTokenAddress?: string;
  readonly spotRoutes?: readonly PublicSpotRoute[];
  readonly crossChainRoutes?: readonly PublicCrossChainRoute[];
}

function requireValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${key}`);
  return value;
}

function requireHttpsUrl(environment: NodeJS.ProcessEnv, key: string): URL {
  const url = new URL(requireValue(environment, key));
  if (url.protocol !== "https:") throw new Error(`${key} must use HTTPS`);
  return url;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const appEnvironment = requireValue(environment, "APP_ENV");
  if (appEnvironment !== "testnet" && appEnvironment !== "mainnet") {
    throw new Error("APP_ENV must be testnet or mainnet");
  }

  const chainId = Number(requireValue(environment, "CHAIN_ID"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("CHAIN_ID must be a positive integer");
  }

  const supabaseSecretKey = requireValue(environment, "SUPABASE_SECRET_KEY");
  if (!supabaseSecretKey.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY must use the sb_secret_ format");
  }

  return {
    appEnvironment,
    chainId,
    blockExplorerUrl: requireHttpsUrl(environment, "BLOCK_EXPLORER_URL"),
    supabaseUrl: requireHttpsUrl(environment, "SUPABASE_URL"),
    supabaseSecretKey,
  };
}

export function createPublicConfig(
  config: ServerConfig,
  addresses: PublicProtocolAddresses,
  walletConnectProjectId: string,
): PublicConfig {
  if (!/^[0-9a-f]{32}$/i.test(walletConnectProjectId)) {
    throw new Error("WALLETS_CONNECT_PROJECT_ID must be a 32-character project ID");
  }
  return {
    appEnvironment: config.appEnvironment,
    chainId: config.chainId,
    blockExplorerUrl: config.blockExplorerUrl.toString(),
    vaultAddress: addresses.vaultAddress,
    usdgAddress: addresses.usdgAddress,
    walletConnectProjectId,
    optionsMarketAddress: addresses.optionsMarketAddress ?? null,
    optionsVaultAddress: addresses.optionsVaultAddress ?? null,
    optionTokenAddress: addresses.optionTokenAddress ?? null,
    spotRoutes: addresses.spotRoutes ?? [],
    crossChainRoutes: addresses.crossChainRoutes ?? [],
  };
}
