import assert from "node:assert/strict";
import test from "node:test";
import { readCrossChainRoutes } from "../src/context.ts";

const route = {
  id: "floats-robinhood-zero",
  tokenSymbol: "FLOATS",
  tokenDecimals: 18,
  sourceTokenAddress: `0x${"1".repeat(40)}`,
  sourceRequiresApproval: true,
  minimumReceivedBps: 9_950,
  enforcedOptions: "0x0003",
  sourceNetworkName: "Robinhood Chain",
  sourceChainId: 4663,
  sourceEid: 30416,
  sourceContract: `0x${"2".repeat(40)}`,
  sourceExplorerUrl: "https://explorer.robinhood.example/",
  destinationNetworkName: "Zero",
  destinationChainId: 9999,
  destinationEid: 39999,
  destinationContract: `0x${"3".repeat(40)}`,
  destinationTokenAddress: `0x${"4".repeat(40)}`,
  destinationExplorerUrl: "https://explorer.zero.example/",
  layerZeroScanUrl: "https://layerzeroscan.example/",
  maximumNavAgeSeconds: 600,
};

test("parses a complete fail-closed public cross-chain route", () => {
  const [parsed] = readCrossChainRoutes({ CROSSCHAIN_ROUTES_JSON: JSON.stringify([route]) });
  assert.equal(parsed?.tokenSymbol, "FLOATS");
  assert.equal(parsed?.minimumReceivedBps, 9_950);
  assert.equal(parsed?.sourceRequiresApproval, true);
  assert.equal(parsed?.sourceExplorerUrl, route.sourceExplorerUrl);
});

test("rejects colliding networks, invalid options, and credential-bearing public URLs", () => {
  const credentialBearingUrl = ["https://user", "secret@example.com"].join(":");
  assert.throws(
    () => readCrossChainRoutes({ CROSSCHAIN_ROUTES_JSON: JSON.stringify([{ ...route, destinationChainId: 4663 }]) }),
    /different networks/,
  );
  assert.throws(
    () => readCrossChainRoutes({ CROSSCHAIN_ROUTES_JSON: JSON.stringify([{ ...route, enforcedOptions: "0x123" }]) }),
    /even-length hex/,
  );
  assert.throws(
    () => readCrossChainRoutes({ CROSSCHAIN_ROUTES_JSON: JSON.stringify([{ ...route, sourceExplorerUrl: credentialBearingUrl }]) }),
    /without credentials/,
  );
});

test("rejects duplicate route IDs and out-of-bounds minimum received policy", () => {
  assert.throws(
    () => readCrossChainRoutes({ CROSSCHAIN_ROUTES_JSON: JSON.stringify([route, route]) }),
    /duplicate id/,
  );
  assert.throws(
    () => readCrossChainRoutes({ CROSSCHAIN_ROUTES_JSON: JSON.stringify([{ ...route, minimumReceivedBps: 10_001 }]) }),
    /between 1 and 10000/,
  );
});
