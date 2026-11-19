import { createPublicConfig, loadServerConfig, type PublicConfig } from "./config.ts";
import { ReadModelRepository } from "./read-model-repository.ts";
import { SupabaseRestClient } from "./supabase-rest-client.ts";
import { VaultQuoteReader } from "./vault-quote-reader.ts";
import { OptionsVaultReader } from "./options-vault-reader.ts";
import { OptionsQuoteClient } from "./options-quote-client.ts";
import type { Address } from "../../indexer/src/types.ts";
import { MarketCatalog } from "./market-catalog.ts";
import { TokenMetadataReader } from "./token-metadata-reader.ts";
import { CandidateMarketData } from "./candidate-market-data.ts";

export interface ApiContext {
  readonly publicConfig: PublicConfig;
  readonly vaultAddress: string;
  readonly readModels: ReadModelRepository;
  readonly vaultQuotes: VaultQuoteReader;
  readonly optionsVault?: OptionsVaultReader;
  readonly optionsQuotes?: OptionsQuoteClient;
  readonly markets: MarketCatalog;
  readonly candidateMarketData: CandidateMarketData;
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
  const spotRoutes = readSpotRoutes(environment);
  const crossChainRoutes = readCrossChainRoutes(environment);
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
        spotRoutes,
        crossChainRoutes,
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
    candidateMarketData: new CandidateMarketData(),
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

export function readCrossChainRoutes(environment: NodeJS.ProcessEnv) {
  const raw = environment.CROSSCHAIN_ROUTES_JSON?.trim();
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("CROSSCHAIN_ROUTES_JSON must be an array");
  const identifiers = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`CROSSCHAIN_ROUTES_JSON[${index}] is invalid`);
    }
    const route = item as Record<string, unknown>;
    const id = stringValue(route.id, `CROSSCHAIN_ROUTES_JSON[${index}].id`, /^[a-z0-9-]{1,64}$/);
    if (identifiers.has(id)) throw new Error(`CROSSCHAIN_ROUTES_JSON contains duplicate id ${id}`);
    identifiers.add(id);
    const tokenSymbol = stringValue(
      route.tokenSymbol,
      `CROSSCHAIN_ROUTES_JSON[${index}].tokenSymbol`,
      /^[A-Z][A-Z0-9]{0,15}$/,
    );
    const sourceChainId = positiveInteger(route.sourceChainId, `CROSSCHAIN_ROUTES_JSON[${index}].sourceChainId`);
    const destinationChainId = positiveInteger(
      route.destinationChainId,
      `CROSSCHAIN_ROUTES_JSON[${index}].destinationChainId`,
    );
    const sourceEid = positiveInteger(route.sourceEid, `CROSSCHAIN_ROUTES_JSON[${index}].sourceEid`);
    const destinationEid = positiveInteger(
      route.destinationEid,
      `CROSSCHAIN_ROUTES_JSON[${index}].destinationEid`,
    );
    if (sourceChainId === destinationChainId || sourceEid === destinationEid) {
      throw new Error(`CROSSCHAIN_ROUTES_JSON[${index}] must connect different networks`);
    }
    return {
      id,
      tokenSymbol,
      tokenDecimals: boundedInteger(route.tokenDecimals, `CROSSCHAIN_ROUTES_JSON[${index}].tokenDecimals`, 0, 255),
      sourceTokenAddress: addressValue(route.sourceTokenAddress, `CROSSCHAIN_ROUTES_JSON[${index}].sourceTokenAddress`),
      sourceRequiresApproval: booleanValue(route.sourceRequiresApproval, `CROSSCHAIN_ROUTES_JSON[${index}].sourceRequiresApproval`),
      minimumReceivedBps: boundedInteger(route.minimumReceivedBps, `CROSSCHAIN_ROUTES_JSON[${index}].minimumReceivedBps`, 1, 10_000),
      enforcedOptions: hexValue(route.enforcedOptions, `CROSSCHAIN_ROUTES_JSON[${index}].enforcedOptions`),
      sourceNetworkName: stringValue(
        route.sourceNetworkName,
        `CROSSCHAIN_ROUTES_JSON[${index}].sourceNetworkName`,
        /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/,
      ),
      sourceChainId,
      sourceEid,
      sourceContract: addressValue(
        route.sourceContract,
        `CROSSCHAIN_ROUTES_JSON[${index}].sourceContract`,
      ),
      sourceExplorerUrl: publicHttpsUrl(
        route.sourceExplorerUrl,
        `CROSSCHAIN_ROUTES_JSON[${index}].sourceExplorerUrl`,
      ),
      destinationChainId,
      destinationNetworkName: stringValue(
        route.destinationNetworkName,
        `CROSSCHAIN_ROUTES_JSON[${index}].destinationNetworkName`,
        /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/,
      ),
      destinationEid,
      destinationContract: addressValue(
        route.destinationContract,
        `CROSSCHAIN_ROUTES_JSON[${index}].destinationContract`,
      ),
      destinationTokenAddress: addressValue(route.destinationTokenAddress, `CROSSCHAIN_ROUTES_JSON[${index}].destinationTokenAddress`),
      destinationExplorerUrl: publicHttpsUrl(
        route.destinationExplorerUrl,
        `CROSSCHAIN_ROUTES_JSON[${index}].destinationExplorerUrl`,
      ),
      layerZeroScanUrl: publicHttpsUrl(
        route.layerZeroScanUrl,
        `CROSSCHAIN_ROUTES_JSON[${index}].layerZeroScanUrl`,
      ),
      maximumNavAgeSeconds: positiveInteger(
        route.maximumNavAgeSeconds,
        `CROSSCHAIN_ROUTES_JSON[${index}].maximumNavAgeSeconds`,
      ),
    };
  });
}

function readSpotRoutes(environment: NodeJS.ProcessEnv) {
  const raw = environment.SPOT_ROUTES_JSON?.trim();
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("SPOT_ROUTES_JSON must be an array");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`SPOT_ROUTES_JSON[${index}] is invalid`);
    const route = item as Record<string, unknown>;
    const tokenAddress = addressValue(route.tokenAddress, `SPOT_ROUTES_JSON[${index}].tokenAddress`);
    const routerAddress = addressValue(route.routerAddress, `SPOT_ROUTES_JSON[${index}].routerAddress`);
    const quoterAddress = addressValue(route.quoterAddress, `SPOT_ROUTES_JSON[${index}].quoterAddress`);
    const fee = Number(route.fee);
    if (![100, 500, 3000, 10000].includes(fee)) throw new Error(`SPOT_ROUTES_JSON[${index}].fee is invalid`);
    return { tokenAddress, routerAddress, quoterAddress, fee };
  });
}

function addressValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} must be an EVM address`);
  return value.toLowerCase();
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function hexValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error(`${label} must be even-length hex`);
  }
  return value.toLowerCase();
}

function stringValue(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function publicHttpsUrl(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be an HTTPS URL`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be a public HTTPS URL without credentials, query, or fragment`);
  }
  return url.toString();
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
