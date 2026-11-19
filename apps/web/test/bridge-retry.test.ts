import assert from "node:assert/strict";
import test from "node:test";
import type { CrossChainMessageDto, CrossChainRouteDto } from "../src/lib/api-client.ts";
import { safeBridgeRetryUrl } from "../src/lib/bridge-retry.ts";

const route: CrossChainRouteDto = {
  id: "fipo-hub-zero",
  tokenSymbol: "fIPO",
  tokenDecimals: 18,
  sourceTokenAddress: `0x${"1".repeat(40)}`,
  sourceRequiresApproval: true,
  minimumReceivedBps: 9_990,
  enforcedOptions: "0x",
  sourceNetworkName: "Robinhood Testnet",
  sourceChainId: 46_630,
  sourceEid: 40_001,
  sourceContract: `0x${"2".repeat(40)}`,
  sourceExplorerUrl: "https://explorer.example",
  destinationChainId: 43_002,
  destinationNetworkName: "Zero Testnet",
  destinationEid: 43_002,
  destinationContract: `0x${"3".repeat(40)}`,
  destinationTokenAddress: `0x${"4".repeat(40)}`,
  destinationExplorerUrl: "https://zero-explorer.example",
  layerZeroScanUrl: "https://testnet.layerzeroscan.com",
  maximumNavAgeSeconds: 1_800,
};
const message: CrossChainMessageDto = {
  sourceChainId: route.sourceChainId,
  destinationChainId: route.destinationChainId,
  sourceEid: route.sourceEid,
  destinationEid: route.destinationEid,
  guid: `0x${"a".repeat(64)}`,
  sender: `0x${"5".repeat(40)}`,
  recipient: `0x${"6".repeat(40)}`,
  token: route.sourceTokenAddress,
  amountLocal: "1000000000000000000",
  nativeFee: "1",
  state: "retryable",
  sourceTransactionHash: `0x${"b".repeat(64)}`,
  destinationTransactionHash: null,
  sentAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:01:00.000Z",
};

test("exposes LayerZero retry only for a verified retryable route", () => {
  assert.equal(
    safeBridgeRetryUrl(message, [route]),
    `https://testnet.layerzeroscan.com/tx/${message.guid}`,
  );
  assert.equal(safeBridgeRetryUrl({ ...message, state: "failed" }, [route]), null);
  assert.equal(safeBridgeRetryUrl({ ...message, state: "delivered" }, [route]), null);
});

test("rejects unknown routes, malformed GUIDs, and unsafe scan URLs", () => {
  assert.equal(safeBridgeRetryUrl(message, []), null);
  assert.equal(safeBridgeRetryUrl({ ...message, guid: "0x1234" }, [route]), null);
  assert.equal(
    safeBridgeRetryUrl(message, [{ ...route, layerZeroScanUrl: "http://scan.example" }]),
    null,
  );
});
