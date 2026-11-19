import { readFileSync } from "node:fs";
import {
  parseCrossChainDeploymentConfig,
  type CrossChainEnvironment,
  type CrossChainDeploymentConfig,
} from "../packages/crosschain/src/index.ts";

function fail(message: string): never {
  throw new Error(`Cross-chain manifest generation failed: ${message}`);
}

function parseEnvironment(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return values;
}

function publicManifest(config: CrossChainDeploymentConfig) {
  const network = (value: CrossChainDeploymentConfig["hub"]) => ({
    name: value.name,
    chainId: value.chainId,
    eid: value.eid,
    explorerUrl: value.explorerUrl.toString(),
    endpointV2: value.endpointV2,
  });
  return {
    schemaVersion: 1,
    environment: config.environment,
    architecture: "hub-and-spoke",
    hub: network(config.hub),
    spoke: network(config.spoke),
    paths: config.paths.map((path) => ({
      tokenSymbol: path.tokenSymbol,
      hubContract: path.hubContract,
      spokeContract: path.spokeContract,
    })),
  } as const;
}

const environmentPath = process.argv[2];
if (!environmentPath) fail("usage: generate-crosschain-manifest.ts <environment-file>");
const values = parseEnvironment(environmentPath);
const environment = values.get("APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") {
  fail("APP_ENV must be testnet or mainnet");
}
const raw = values.get("CROSSCHAIN_DEPLOYMENT_CONFIG_JSON");
if (!raw) fail("CROSSCHAIN_DEPLOYMENT_CONFIG_JSON is required");
const config = parseCrossChainDeploymentConfig(raw, environment as CrossChainEnvironment);
console.log(JSON.stringify(publicManifest(config), null, 2));
