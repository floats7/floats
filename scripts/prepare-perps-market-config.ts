import { readFileSync } from "node:fs";
import { getAddress, isAddress, keccak256, stringToHex, toBytes } from "viem";

interface MarketFile {
  readonly chainId: number;
  readonly symbol: string;
  readonly underlyingSymbol: string;
  readonly underlyingAddress: string;
  readonly priceFeedAddress: string | null;
  readonly marketState: "disabled";
  readonly risk: Readonly<Record<string, string | number | boolean>>;
}

function fail(message: string): never { throw new Error(`Perps market preparation failed: ${message}`); }
const path = process.argv[2];
if (!path) fail("usage: prepare-perps-market-config.ts <market-config.json>");
const parsed = JSON.parse(readFileSync(path, "utf8")) as MarketFile;
if (!Number.isSafeInteger(parsed.chainId) || parsed.chainId <= 0) fail("chainId is invalid");
if (!/^[A-Z0-9][A-Z0-9-]{0,30}-PERP$/.test(parsed.symbol)) fail("symbol is invalid");
if (!/^[A-Z0-9][A-Z0-9-]{0,30}$/.test(parsed.underlyingSymbol)) fail("underlyingSymbol is invalid");
if (!isAddress(parsed.underlyingAddress)) fail("underlyingAddress is invalid");
if (parsed.marketState !== "disabled") fail("new markets must remain disabled");
if (!parsed.priceFeedAddress || !isAddress(parsed.priceFeedAddress)) {
  fail("an official priceFeedAddress is required before a timelock market proposal can be prepared");
}
const requiredRisk = [
  "maxLeverageBps", "initialMarginBps", "maintenanceMarginBps", "openInterestCapBps",
  "baseSpreadBps", "tradingFeeBps", "extendedSpreadMultiplierBps",
  "extendedLeverageDivisorBps", "maxPriceAgeSeconds", "isolatedOnly",
  "fundingSkewCoefficient18", "maximumFundingRate18",
] as const;
for (const key of requiredRisk) if (parsed.risk[key] === undefined) fail(`risk.${key} is required`);
const values = {
  PERPS_CONFIG_MARKET_ID: keccak256(toBytes(parsed.symbol)),
  PERPS_CONFIG_UNDERLYING_ADDRESS: getAddress(parsed.underlyingAddress),
  PERPS_CONFIG_UNDERLYING_UID: keccak256(toBytes(parsed.underlyingSymbol)),
  PERPS_CONFIG_SYMBOL: stringToHex(parsed.symbol, { size: 32 }),
  PERPS_CONFIG_PRICE_FEED_ADDRESS: getAddress(parsed.priceFeedAddress),
  PERPS_CONFIG_MAX_LEVERAGE_BPS: parsed.risk.maxLeverageBps,
  PERPS_CONFIG_INITIAL_MARGIN_BPS: parsed.risk.initialMarginBps,
  PERPS_CONFIG_MAINTENANCE_MARGIN_BPS: parsed.risk.maintenanceMarginBps,
  PERPS_CONFIG_OPEN_INTEREST_CAP_BPS: parsed.risk.openInterestCapBps,
  PERPS_CONFIG_BASE_SPREAD_BPS: parsed.risk.baseSpreadBps,
  PERPS_CONFIG_TRADING_FEE_BPS: parsed.risk.tradingFeeBps,
  PERPS_CONFIG_EXTENDED_SPREAD_MULTIPLIER_BPS: parsed.risk.extendedSpreadMultiplierBps,
  PERPS_CONFIG_EXTENDED_LEVERAGE_DIVISOR_BPS: parsed.risk.extendedLeverageDivisorBps,
  PERPS_CONFIG_MAX_PRICE_AGE_SECONDS: parsed.risk.maxPriceAgeSeconds,
  PERPS_CONFIG_ISOLATED_ONLY: parsed.risk.isolatedOnly,
  PERPS_CONFIG_FUNDING_SKEW_COEFFICIENT_18: parsed.risk.fundingSkewCoefficient18,
  PERPS_CONFIG_MAX_FUNDING_RATE_18: parsed.risk.maximumFundingRate18,
};
for (const [key, value] of Object.entries(values)) console.log(`${key}=${String(value)}`);
