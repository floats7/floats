import assert from "node:assert/strict";
import test from "node:test";

import { OptionsVaultReader } from "../src/options-vault-reader.ts";

const address = `0x${"1".repeat(40)}` as const;
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

test("reads every Options vault liability at one exact block", async () => {
  const observedBlocks: string[] = [];
  const values: Readonly<Record<string, bigint>> = {
    "0x01e1d114": 700_000_000n,
    "0xe1fb8ccf": 300_000_000n,
    "0xb9930b9c": 50_000_000n,
    "0x93dc32a2": 25_000_000n,
    "0x18160ddd": 1_000_000_000_000_000_000_000n,
    "0xbb373698": 0n,
  };
  const fetchStub: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: [{ data: string }, string];
    };
    if (request.method === "eth_blockNumber") {
      return Response.json({ jsonrpc: "2.0", id: request.id, result: "0x64" });
    }
    observedBlocks.push(request.params[1]);
    const value = values[request.params[0].data];
    assert.notEqual(value, undefined);
    return Response.json({ jsonrpc: "2.0", id: request.id, result: word(value ?? 0n) });
  };
  const reader = new OptionsVaultReader(new URL("https://rpc.example.com"), address, fetchStub);

  const state = await reader.readState();

  assert.deepEqual(observedBlocks, Array(6).fill("0x64"));
  assert.deepEqual(state, {
    blockNumber: "100",
    totalAssets6: "700000000",
    reservedCollateral6: "300000000",
    claimableCollateral6: "50000000",
    payableWithdrawalAssets6: "25000000",
    totalSupply18: "1000000000000000000000",
    utilizationBps: 3000,
    operationsPaused: false,
  });
});
