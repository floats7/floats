import assert from "node:assert/strict";
import test from "node:test";
import { MarketCatalog } from "../src/market-catalog.ts";
import type { ReadModelRepository } from "../src/read-model-repository.ts";
import type { TokenMetadataSource } from "../src/token-metadata-reader.ts";

const vault = `0x${"1".repeat(40)}`;
const token = `0x${"2".repeat(40)}`;
const staleToken = `0x${"9".repeat(40)}`;

test("catalog derives identity and products without frontend symbol branching", async () => {
  const readModels = {
    async listActiveAssets() {
      return [{
        chain_id: 46630, token_address: token, asset_uid: `0x${"3".repeat(64)}`,
        symbol: "FALLBACK", decimals: 18, feed_address: `0x${"4".repeat(40)}`,
        active: true, registry_version: 1, source_block: 10, updated_at: "2026-01-01",
        target_weight_bps: 10_000, eligible_from: 0, exit_after: 0, registry_status: "active",
      }, {
        chain_id: 46630, token_address: staleToken, asset_uid: `0x${"8".repeat(64)}`,
        symbol: "STALE", decimals: 18, feed_address: `0x${"7".repeat(40)}`,
        active: true, registry_version: 1, source_block: 5, updated_at: "2025-01-01",
        target_weight_bps: 5_000, eligible_from: 0, exit_after: 0, registry_status: "active",
      }];
    },
    async latestNav() {
      return [{ block_number: 10, nav_usd_18: "100", total_supply_18: "100", share_price_usd_18: "1", oracle_health: {}, observed_at: "2026-01-01" }];
    },
    async listLatestHoldings() {
      return [{ token_address: token, block_number: 10, raw_balance: "1", ui_multiplier_18: "1", normalized_price_usd_18: "100", value_usd_18: "100", oracle_health: "live", oracle_updated_at: 1, observed_at: "2026-01-01" }];
    },
    async listOptionsSeries() {
      return [{ underlying: token, state: "0" }];
    },
    async listMarketCandidates() {
      return [{ token_address: token, symbol: "FALLBACK", logo_url: "https://assets.example/asset.png" }];
    },
  } as unknown as ReadModelRepository;
  const metadata: TokenMetadataSource = {
    async read(address) {
      return address.toLowerCase() === vault
        ? { name: "Dynamic Index", symbol: "DYN", decimals: 18 }
        : { name: "Dynamic Asset", symbol: "ASSET", decimals: 18 };
    },
  };
  const catalog = new MarketCatalog(readModels, metadata, {
    appEnvironment: "testnet", chainId: 46630, blockExplorerUrl: "https://explorer.test/",
    vaultAddress: vault, usdgAddress: `0x${"5".repeat(40)}`,
    walletConnectProjectId: "0".repeat(32), optionsMarketAddress: `0x${"6".repeat(40)}`,
    optionsVaultAddress: `0x${"7".repeat(40)}`, optionTokenAddress: `0x${"8".repeat(40)}`,
  });

  const markets = await catalog.list();
  assert.equal(markets[0]?.symbol, "DYN");
  assert.equal(markets[1]?.symbol, "ASSET");
  assert.equal(markets[1]?.activeOptionSeries, 1);
  assert.equal(markets[1]?.products[0]?.enabled, true);
  assert.equal(markets[1]?.logoUrl, "https://assets.example/asset.png");
  assert.equal(markets.length, 2);
  assert.equal(markets.some((market) => market.address === staleToken), false);
});
