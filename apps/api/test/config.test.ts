import assert from "node:assert/strict";
import test from "node:test";

import { createPublicConfig, loadServerConfig } from "../src/config.ts";

const validEnvironment: NodeJS.ProcessEnv = {
  APP_ENV: "testnet",
  CHAIN_ID: "46630",
  BLOCK_EXPLORER_URL: "https://explorer.testnet.chain.robinhood.com",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_example",
  WALLETS_CONNECT_PROJECT_ID: "0123456789abcdef0123456789abcdef",
  FLOATS_VAULT_ADDRESS: `0x${"1".repeat(40)}`,
  USDG_ADDRESS: `0x${"2".repeat(40)}`,
};

test("public configuration excludes all Supabase values", () => {
  const publicConfig = createPublicConfig(loadServerConfig(validEnvironment), {
    vaultAddress: validEnvironment.FLOATS_VAULT_ADDRESS!,
    usdgAddress: validEnvironment.USDG_ADDRESS!,
  }, validEnvironment.WALLETS_CONNECT_PROJECT_ID!);

  assert.deepEqual(publicConfig, {
    appEnvironment: "testnet",
    chainId: 46630,
    blockExplorerUrl: "https://explorer.testnet.chain.robinhood.com/",
    vaultAddress: validEnvironment.FLOATS_VAULT_ADDRESS,
    usdgAddress: validEnvironment.USDG_ADDRESS,
    walletConnectProjectId: validEnvironment.WALLETS_CONNECT_PROJECT_ID,
    optionsMarketAddress: null,
    optionsVaultAddress: null,
    optionTokenAddress: null,
  });
  assert.equal("supabaseUrl" in publicConfig, false);
  assert.equal("supabaseSecretKey" in publicConfig, false);
});

test("legacy Supabase keys cannot satisfy server configuration", () => {
  const legacyEnvironment = {
    ...validEnvironment,
    SUPABASE_SECRET_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: "legacy-secret",
  };

  assert.throws(() => loadServerConfig(legacyEnvironment), /SUPABASE_SECRET_KEY/);
});

test("publishable keys are rejected as backend credentials", () => {
  assert.throws(
    () =>
      loadServerConfig({
        ...validEnvironment,
        SUPABASE_SECRET_KEY: "sb_publishable_example",
      }),
    /sb_secret_/,
  );
});
