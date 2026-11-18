import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const deploymentSourceFiles = [
  "foundry.toml",
  "contracts/script/DeployCore.s.sol",
  "contracts/script/ConfigureCore.s.sol",
  "contracts/script/DeployOptions.s.sol",
  "contracts/script/ConfigureOptions.s.sol",
  "contracts/src/core/FloatsVault.sol",
  "contracts/src/fees/FeeModule.sol",
  "contracts/src/oracle/NavOracle.sol",
  "contracts/src/oracle/SwapQuoteOracle.sol",
  "contracts/src/rebalance/Rebalancer.sol",
  "contracts/src/registry/IndexRegistry.sol",
  "contracts/src/swap/SwapAdapter.sol",
  "contracts/src/options/OptionToken.sol",
  "contracts/src/options/OptionsMarket.sol",
  "contracts/src/options/OptionsTypes.sol",
  "contracts/src/options/OptionsVault.sol",
  "contracts/src/options/QuoteVerifier.sol",
  "contracts/src/options/RiskManager.sol",
  "contracts/src/options/SeriesRegistry.sol",
  "contracts/src/options/SettlementEngine.sol",
  "package-lock.json",
  "package.json",
] as const;

export function calculateDeploymentSourceHash(): `0x${string}` {
  const digest = createHash("sha256");
  for (const path of deploymentSourceFiles) {
    digest.update(path);
    digest.update("\0");
    digest.update(readFileSync(path));
    digest.update("\0");
  }
  return `0x${digest.digest("hex")}`;
}
