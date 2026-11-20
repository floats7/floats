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
import { FUSDReader } from "./fusd-reader.ts";
import { PerpsReader } from "./perps-reader.ts";

export interface ApiContext {
  readonly publicConfig: PublicConfig;
  readonly vaultAddress: string;
  readonly readModels: ReadModelRepository;
  readonly vaultQuotes: VaultQuoteReader;
  readonly optionsVault?: OptionsVaultReader;
  readonly optionsQuotes?: OptionsQuoteClient;
  readonly markets: MarketCatalog;
  readonly candidateMarketData: CandidateMarketData;
  readonly fusd?: FUSDReader;
  readonly fusdVaultAddress?: string;
  readonly perps?: PerpsReader;
  readonly perpsRestrictedCountries?: ReadonlySet<string>;
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
  const fusdVaultAddress = optionalAddress(environment, "FUSD_VAULT_ADDRESS");
  const fusdStrategyAddress = optionalAddress(environment, "FUSD_STRATEGY_ADDRESS");
  const fusdRateOracleAddress = optionalAddress(environment, "FUSD_RATE_ORACLE_ADDRESS");
  const fusdToFipoRouterAddress = optionalAddress(environment, "FUSD_TO_FIPO_ROUTER_ADDRESS");
  const perps = readPerpsAddresses(environment);
  const perpsRestrictedCountries = readCountrySet(environment.PERPS_RESTRICTED_COUNTRIES);
  const hasCompleteFusdConfiguration = Boolean(
    fusdVaultAddress && fusdStrategyAddress && fusdRateOracleAddress,
  );
  if (
    [fusdVaultAddress, fusdStrategyAddress, fusdRateOracleAddress].some(Boolean)
    && !hasCompleteFusdConfiguration
  ) {
    throw new Error("All fUSD contract addresses must be configured together");
  }
  if (hasCompleteFusdConfiguration && serverConfig.appEnvironment !== "mainnet") {
    throw new Error("fUSD is mainnet-only");
  }
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
        ...(fusdVaultAddress && fusdStrategyAddress && fusdRateOracleAddress
          ? {
              fusdVaultAddress,
              fusdStrategyAddress,
              fusdRateOracleAddress,
              ...(fusdToFipoRouterAddress ? { fusdToFipoRouterAddress } : {}),
            }
          : {}),
        ...(perps ? { perps } : {}),
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
    perpsRestrictedCountries,
    vaultAddress,
    readModels,
    markets: new MarketCatalog(
      readModels,
      new TokenMetadataReader(requireHttpsUrl(environment, "RPC_URL")),
      publicConfig,
    ),
    candidateMarketData: new CandidateMarketData(),
    vaultQuotes: new VaultQuoteReader(requireHttpsUrl(environment, "RPC_URL"), vaultAddress as Address),
    ...(hasCompleteFusdConfiguration && fusdVaultAddress && fusdStrategyAddress
      ? {
          fusd: new FUSDReader(
            requireHttpsUrl(environment, "RPC_URL"),
            fusdVaultAddress as Address,
            fusdStrategyAddress as Address,
          ),
          fusdVaultAddress,
        }
      : {}),
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
    ...(perps
      ? {
          perps: new PerpsReader(
            requireHttpsUrl(environment, "RPC_URL"),
            perps.marketAddress as Address,
            perps.registryAddress as Address,
            perps.marginAccountAddress as Address,
            perps.riskEngineAddress as Address,
            perps.oracleAddress as Address,
            perps.liquidityVaultAddress as Address,
          ),
        }
      : {}),
  };
}

function readCountrySet(raw: string | undefined): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  const countries = raw.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
    throw new Error("PERPS_RESTRICTED_COUNTRIES must contain comma-separated ISO alpha-2 codes");
  }
  return new Set(countries);
}

function readPerpsAddresses(environment: NodeJS.ProcessEnv) {
  const keys = [
    "PERPS_REGISTRY_ADDRESS",
    "PERPS_MARKET_ADDRESS",
    "PERPS_ORACLE_ADDRESS",
    "PERPS_MARGIN_ACCOUNT_ADDRESS",
    "PERPS_FUNDING_ENGINE_ADDRESS",
    "PERPS_RISK_ENGINE_ADDRESS",
    "PERPS_LIQUIDATION_ENGINE_ADDRESS",
    "PERPS_LIQUIDITY_VAULT_ADDRESS",
    "PERPS_INSURANCE_FUND_ADDRESS",
    "PERPS_FIPO_PRICE_FEED_ADDRESS",
  ] as const;
  const values = keys.map((key) => optionalAddress(environment, key));
  if (!values.some(Boolean)) return undefined;
  if (!values.every(Boolean)) {
    throw new Error("All Perps contract addresses must be configured together");
  }
  return {
    registryAddress: values[0]!,
    marketAddress: values[1]!,
    oracleAddress: values[2]!,
    marginAccountAddress: values[3]!,
    fundingEngineAddress: values[4]!,
    riskEngineAddress: values[5]!,
    liquidationEngineAddress: values[6]!,
    liquidityVaultAddress: values[7]!,
    insuranceFundAddress: values[8]!,
    fipoPriceFeedAddress: values[9]!,
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
