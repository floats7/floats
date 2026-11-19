import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionResult, parseAbi, type Address, type Hex } from "viem";
import type { CrossChainRouteDto } from "../src/lib/api-client.ts";
import { executeBridge, quoteBridge } from "../src/lib/bridge-transactions.ts";
import type { Eip1193Provider, Eip1193RequestArguments } from "../src/lib/eip1193.ts";

const oftAbi = parseAbi([
  "function quoteSend((uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd) sendParam,bool payInLzToken) view returns ((uint256 nativeFee,uint256 lzTokenFee) fee)",
]);
const account = `0x${"1".repeat(40)}` as Address;
const hash = `0x${"a".repeat(64)}` as Hex;
const route: CrossChainRouteDto = {
  id: "floats-hub-spoke",
  tokenSymbol: "FLOATS",
  tokenDecimals: 18,
  sourceTokenAddress: `0x${"2".repeat(40)}`,
  sourceRequiresApproval: false,
  minimumReceivedBps: 9_950,
  enforcedOptions: "0x0003",
  sourceNetworkName: "Robinhood Chain",
  sourceChainId: 4663,
  sourceEid: 30416,
  sourceContract: `0x${"3".repeat(40)}`,
  sourceExplorerUrl: "https://explorer.example/",
  destinationNetworkName: "Zero",
  destinationChainId: 9999,
  destinationEid: 39999,
  destinationContract: `0x${"4".repeat(40)}`,
  destinationTokenAddress: `0x${"4".repeat(40)}`,
  destinationExplorerUrl: "https://zero.example/",
  layerZeroScanUrl: "https://layerzeroscan.example/",
  maximumNavAgeSeconds: 600,
};

test("quotes an IOFT send with bounded minimum received and native fee", async () => {
  const provider = providerFor((request) => {
    if (request.method === "eth_chainId") return "0x1237";
    if (request.method === "eth_call") {
      return encodeFunctionResult({
        abi: oftAbi,
        functionName: "quoteSend",
        result: { nativeFee: 25n, lzTokenFee: 0n },
      });
    }
    throw new Error(`Unexpected method ${request.method}`);
  });
  const quote = await quoteBridge({ provider, account, route, amount: "2" });
  assert.equal(quote.amountLocal, 2n * 10n ** 18n);
  assert.equal(quote.minimumReceivedLocal, 1_990_000_000_000_000_000n);
  assert.equal(quote.nativeFee, 25n);
  assert.equal(quote.approvalRequired, false);
});

test("rejects quote requests on the wrong source chain", async () => {
  const provider = providerFor((request) => request.method === "eth_chainId" ? "0x1" : null);
  await assert.rejects(
    quoteBridge({ provider, account, route, amount: "1" }),
    /BRIDGE_WRONG_SOURCE_CHAIN/,
  );
});

test("submits native fee and reports confirmed send lifecycle", async () => {
  const observed: Eip1193RequestArguments[] = [];
  const provider = providerFor((request) => {
    observed.push(request);
    if (request.method === "eth_chainId") return "0x1237";
    if (request.method === "eth_estimateGas") return "0x10000";
    if (request.method === "eth_sendTransaction") return hash;
    if (request.method === "eth_getTransactionReceipt") return { status: "0x1" };
    throw new Error(`Unexpected method ${request.method}`);
  });
  const steps: string[] = [];
  const result = await executeBridge({
    provider,
    account,
    route,
    quote: {
      amountLocal: 1n,
      minimumReceivedLocal: 1n,
      nativeFee: 25n,
      approvalRequired: false,
      sendParam: {
        dstEid: route.destinationEid,
        to: `0x${"0".repeat(24)}${account.slice(2)}`,
        amountLD: 1n,
        minAmountLD: 1n,
        extraOptions: "0x0003",
        composeMsg: "0x",
        oftCmd: "0x",
      },
    },
    onStep: (step) => steps.push(step.type),
  });
  assert.equal(result, hash);
  assert.deepEqual(steps, ["send-submitted", "send-confirmed"]);
  const sendRequest = observed.find((request) => request.method === "eth_sendTransaction");
  assert.equal((sendRequest?.params as readonly [{ value: string }])[0].value, "0x19");
});

function providerFor(handler: (request: Eip1193RequestArguments) => unknown): Eip1193Provider {
  return { request: async <T>(request: Eip1193RequestArguments) => handler(request) as T };
}
