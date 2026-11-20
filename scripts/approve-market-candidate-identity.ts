import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, isAddress, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const [environmentPath, candidateId, tokenInput] = process.argv.slice(2);
if (!environmentPath || !candidateId || !/^[a-z0-9-]{1,80}$/.test(candidateId)
    || !tokenInput || !isAddress(tokenInput, { strict: false })) {
  throw new Error("Usage: approve-market-candidate-identity.ts <environment-file> <candidate-id> <token-address>");
}
const env = parseEnv(environmentPath);
const environment = required(env, "APP_ENV");
if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
const chainId = Number(required(env, "CHAIN_ID"));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID is invalid");
const tokenAddress = tokenInput.toLowerCase() as Address;
const approverAddress = requiredAddress(env, "ADMIN_ADDRESS");
const account = privateKeyToAccount(requiredPrivateKey(env, "ADMIN_PRIVATE_KEY"));
if (account.address.toLowerCase() !== approverAddress) throw new Error("ADMIN_PRIVATE_KEY does not match ADMIN_ADDRESS");
const rpcUrl = required(env, "RPC_URL");
const transport = http(rpcUrl);
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
if (await publicClient.getChainId() !== chainId) throw new Error("RPC chain ID does not match environment");
const balance = await publicClient.getBalance({ address: account.address });
if (balance === 0n) throw new Error("Identity approver has no gas balance");

const statement = [
  "FLOATS_MARKET_IDENTITY_APPROVAL_V1",
  environment,
  String(chainId),
  candidateId,
  tokenAddress,
].join("|");
// Use a code-free sink so contract-based approver accounts cannot execute the
// attestation payload against their own fallback implementation.
const attestationSink = "0x000000000000000000000000000000000000dEaD" as Address;
const transactionHash = await walletClient.sendTransaction({
  account,
  chain: null,
  to: attestationSink,
  value: 0n,
  data: toHex(statement),
  gas: 50_000n,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== "success") throw new Error("Identity approval attestation reverted");
const approvedAt = new Date().toISOString();

const response = await fetch(new URL("/rest/v1/rpc/approve_market_candidate_identity", required(env, "SUPABASE_URL")), {
  method: "POST",
  headers: { "content-type": "application/json", apikey: required(env, "SUPABASE_SECRET_KEY") },
  body: JSON.stringify({
    p_environment: environment,
    p_chain_id: chainId,
    p_candidate_id: candidateId,
    p_token_address: tokenAddress,
    p_multisig_address: approverAddress,
    p_approval_transaction_hash: transactionHash,
    p_approved_by: `designated-approver:${approverAddress}`,
    p_approved_at: approvedAt,
  }),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Identity approval recording failed with status ${response.status}: ${await response.text()}`);
console.log(JSON.stringify({ event: "market_candidate_identity_approved", environment, chainId, candidateId, tokenAddress, approverAddress, attestationSink, transactionHash, blockNumber: receipt.blockNumber.toString(), approvedAt }));

function parseEnv(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.startsWith("#")) values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return values;
}
function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}
function requiredAddress(values: ReadonlyMap<string, string>, key: string): Address {
  const value = required(values, key);
  if (!isAddress(value, { strict: false })) throw new Error(`${key} is invalid`);
  return value.toLowerCase() as Address;
}
function requiredPrivateKey(values: ReadonlyMap<string, string>, key: string): Hex {
  const value = required(values, key);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${key} is invalid`);
  return value as Hex;
}
