import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const [environmentPath, amountInput] = process.argv.slice(2);
if (!environmentPath || !amountInput || !/^\.env\.(testnet|mainnet)$/.test(environmentPath)) {
  throw new Error("Usage: fund-options-vault.ts <.env.testnet|.env.mainnet> <USDG amount>");
}

const environment = Object.fromEntries(readFileSync(environmentPath, "utf8").split(/\r?\n/).flatMap((line) => {
  const separator = line.indexOf("=");
  return separator > 0 && !line.startsWith("#") ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
}));
const required = (key: string): string => {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const account = privateKeyToAccount(required("ADMIN_PRIVATE_KEY") as `0x${string}`);
if (account.address.toLowerCase() !== required("ADMIN_ADDRESS").toLowerCase()) {
  throw new Error("ADMIN_PRIVATE_KEY does not match ADMIN_ADDRESS");
}

const rpcUrl = required("RPC_URL");
const chainId = Number(required("CHAIN_ID"));
const chain = { id: chainId, name: required("APP_ENV"), nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
const usdg = required("USDG_ADDRESS") as `0x${string}`;
const vault = required("OPTIONS_VAULT_ADDRESS") as `0x${string}`;
const amount = parseUnits(amountInput, 6);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const vaultAbi = parseAbi(["function deposit(uint256,address) returns (uint256)"]);

const balance = await publicClient.readContract({ address: usdg, abi: erc20, functionName: "balanceOf", args: [account.address] });
if (balance < amount) throw new Error("ADMIN_ADDRESS has insufficient USDG");

const approval = await walletClient.writeContract({ address: usdg, abi: erc20, functionName: "approve", args: [vault, amount] });
const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approval });
if (approvalReceipt.status !== "success") throw new Error("USDG approval reverted");
const deposit = await walletClient.writeContract({ address: vault, abi: vaultAbi, functionName: "deposit", args: [amount, account.address] });
const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: deposit });
if (depositReceipt.status !== "success") throw new Error("Options Vault deposit reverted");
console.log(JSON.stringify({ amount: amountInput, approval, deposit }));
