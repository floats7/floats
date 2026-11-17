import { createPublicConfig, loadServerConfig, type PublicConfig } from "./config.ts";
import { ReadModelRepository } from "./read-model-repository.ts";
import { SupabaseRestClient } from "./supabase-rest-client.ts";
import { VaultQuoteReader } from "./vault-quote-reader.ts";
import type { Address } from "../../indexer/src/types.ts";

export interface ApiContext {
  readonly publicConfig: PublicConfig;
  readonly vaultAddress: string;
  readonly readModels: ReadModelRepository;
  readonly vaultQuotes: VaultQuoteReader;
}

export function createApiContext(environment: NodeJS.ProcessEnv): ApiContext {
  const serverConfig = loadServerConfig(environment);
  const vaultAddress = requireAddress(environment, "FLOATS_VAULT_ADDRESS");
  const usdgAddress = requireAddress(environment, "USDG_ADDRESS");
  const client = new SupabaseRestClient({
    baseUrl: serverConfig.supabaseUrl,
    secretKey: serverConfig.supabaseSecretKey,
  });
  return {
    publicConfig: createPublicConfig(serverConfig, { vaultAddress, usdgAddress }),
    vaultAddress,
    readModels: new ReadModelRepository(client, {
      environment: serverConfig.appEnvironment,
      chainId: serverConfig.chainId,
    }),
    vaultQuotes: new VaultQuoteReader(requireHttpsUrl(environment, "RPC_URL"), vaultAddress as Address),
  };
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
