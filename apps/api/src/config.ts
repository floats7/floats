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
}

export interface PublicProtocolAddresses {
  readonly vaultAddress: string;
  readonly usdgAddress: string;
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
  };
}
