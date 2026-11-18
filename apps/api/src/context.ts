import { createPublicConfig, loadServerConfig, type PublicConfig } from "./config.ts";
import { ReadModelRepository } from "./read-model-repository.ts";
import { SupabaseRestClient } from "./supabase-rest-client.ts";
import { VaultQuoteReader } from "./vault-quote-reader.ts";
import { OptionsVaultReader } from "./options-vault-reader.ts";
import { OptionsQuoteClient } from "./options-quote-client.ts";
import type { Address } from "../../indexer/src/types.ts";
import { MarketCatalog } from "./market-catalog.ts";
import { TokenMetadataReader } from "./token-metadata-reader.ts";

export interface ApiContext {
  readonly publicConfig: PublicConfig;
  readonly vaultAddress: string;
  readonly readModels: ReadModelRepository;
  readonly vaultQuotes: VaultQuoteReader;
  readonly optionsVault?: OptionsVaultReader;
  readonly optionsQuotes?: OptionsQuoteClient;
  readonly markets: MarketCatalog;
}

export function createApiContext(environment: NodeJS.ProcessEnv): ApiContext {
  const serverConfig = loadServerConfig(environment);
  const vaultAddress = requireAddress(environment, "FLOATS_VAULT_ADDRESS");
  const usdgAddress = requireAddress(environment, "USDG_ADDRESS");
  const client = new SupabaseRestClient({
    baseUrl: serverConfig.supabaseUrl,
    secretKey: serverConfig.supabaseSecretKey,
  });
  const optionsVaultAddress = optionalAddress(environment, "OPTIONS_VAULT_ADDRESS");
  const optionsMarketAddress = optionalAddress(environment, "OPTIONS_MARKET_ADDRESS");
  const optionTokenAddress = optionalAddress(environment, "OPTION_TOKEN_ADDRESS");
  const optionsPricerUrl = optionalHttpsUrl(environment, "OPTIONS_PRICER_URL");
  const optionsPricerToken = environment.OPTIONS_PRICER_AUTH_TOKEN?.trim();
  if ((optionsPricerUrl === undefined) !== !optionsPricerToken) {
    throw new Error("OPTIONS_PRICER_URL and OPTIONS_PRICER_AUTH_TOKEN must be configured together");
  }
  const publicConfig = createPublicConfig(
      serverConfig,
      {
        vaultAddress,
        usdgAddress,
        ...(optionsMarketAddress ? { optionsMarketAddress } : {}),
        ...(optionsVaultAddress ? { optionsVaultAddress } : {}),
        ...(optionTokenAddress ? { optionTokenAddress } : {}),
      },
      requireValue(environment, "WALLETS_CONNECT_PROJECT_ID"),
    );
  const readModels = new ReadModelRepository(client, {
    environment: serverConfig.appEnvironment,
    chainId: serverConfig.chainId,
  });
  return {
    publicConfig,
    vaultAddress,
    readModels,
    markets: new MarketCatalog(
      readModels,
      new TokenMetadataReader(requireHttpsUrl(environment, "RPC_URL")),
      publicConfig,
    ),
    vaultQuotes: new VaultQuoteReader(requireHttpsUrl(environment, "RPC_URL"), vaultAddress as Address),
    ...(optionsVaultAddress === undefined
      ? {}
      : {
          optionsVault: new OptionsVaultReader(
            requireHttpsUrl(environment, "RPC_URL"),
            optionsVaultAddress as Address,
          ),
        }),
    ...(optionsPricerUrl && optionsPricerToken
      ? { optionsQuotes: new OptionsQuoteClient(optionsPricerUrl, optionsPricerToken) }
      : {}),
  };
}

function optionalHttpsUrl(environment: NodeJS.ProcessEnv, key: string): URL | undefined {
  const value = environment[key]?.trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname) &&
    !url.hostname.endsWith(".railway.internal")
  ) {
    throw new Error(`${key} must use HTTPS outside local development`);
  }
  return url;
}

function optionalAddress(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = environment[key]?.trim();
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${key} must be an EVM address`);
  return value.toLowerCase();
}

function requireHttpsUrl(environment: NodeJS.ProcessEnv, key: string): URL {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} must be configured`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${key} must use HTTPS`);
  return url;
}

function requireAddress(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${key} must be a configured EVM address`);
  }
  return value.toLowerCase();
}

function requireValue(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} must be configured`);
  return value;
}
