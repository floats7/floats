import assert from "node:assert/strict";
import test from "node:test";

import {
  OptionsUnderlyingSource,
  type IndexUnderlyingReader,
} from "../src/options-underlying-source.ts";

const registry = `0x${"11".repeat(20)}` as const;
const active = `0x${"22".repeat(20)}` as const;
const removed = `0x${"33".repeat(20)}` as const;
const priceSource = `0x${"88".repeat(20)}` as const;

test("maps every tracked IndexRegistry asset to an Options enablement decision", async () => {
  const reader: IndexUnderlyingReader = {
    async trackedTokens() {
      return [active, removed, active.toUpperCase() as `0x${string}`];
    },
    async constituent(_registry, token) {
      return token.toLowerCase() === active.toLowerCase()
        ? { feed: `0x${"44".repeat(20)}`, uid: `0x${"55".repeat(32)}`, status: 1 }
        : { feed: `0x${"66".repeat(20)}`, uid: `0x${"77".repeat(32)}`, status: 2 };
    },
  };
  const result = await new OptionsUnderlyingSource(reader, registry, priceSource).load();
  assert.deepEqual(result, [
    {
      underlying: active,
      priceSource,
      underlyingUid: `0x${"55".repeat(32)}`,
      enabled: true,
    },
    {
      underlying: removed,
      priceSource,
      underlyingUid: `0x${"77".repeat(32)}`,
      enabled: false,
    },
  ]);
});
