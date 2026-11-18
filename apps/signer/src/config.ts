import { getAddress, type Address, type Hex } from "viem";

export interface SignerConfig {
  readonly appEnvironment: "testnet" | "mainnet";
  readonly chainId: number;
  readonly quoteVerifierAddress: Address;
  readonly privateKey: Hex;
  readonly authToken: string;
  readonly port: number;
}

export function loadSignerConfig(environment: NodeJS.ProcessEnv): SignerConfig {
  const appEnvironment = required(environment, "APP_ENV");
  if (appEnvironment !== "testnet" && appEnvironment !== "mainnet") {
    throw new Error("APP_ENV must be testnet or mainnet");
  }
  const chainId = positiveInteger(required(environment, "CHAIN_ID"), "CHAIN_ID");
  const port = positiveInteger(environment.PORT ?? "3000", "PORT");
  const privateKey = required(environment, "OPTIONS_QUOTE_SIGNER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey) || /^0x0{64}$/i.test(privateKey)) {
    throw new Error("OPTIONS_QUOTE_SIGNER_PRIVATE_KEY must be a non-zero 32-byte hex value");
  }
  const authToken = required(environment, "SIGNER_INTERNAL_AUTH_TOKEN");
  if (authToken.length < 32) throw new Error("SIGNER_INTERNAL_AUTH_TOKEN must contain at least 32 characters");
  return {
    appEnvironment,
    chainId,
    quoteVerifierAddress: getAddress(required(environment, "QUOTE_VERIFIER_ADDRESS")),
    privateKey: privateKey as Hex,
    authToken,
    port,
  };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}
