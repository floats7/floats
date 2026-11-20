import assert from "node:assert/strict";
import test from "node:test";

import { decodeFloatsCoreLog } from "../src/event-decoder.ts";
import type { Hex } from "../src/types.ts";

const POSITION_MODIFIED =
  "0x0d50504f7163ee98c4b39b6ff598acda6b7e7f0b3859885b43b073f29f8fb7a9" as Hex;

test("decodes signed Perps position values without losing their sign", () => {
  const decoded = decodeFloatsCoreLog({
    address: `0x${"1".repeat(40)}`,
    topics: [
      POSITION_MODIFIED,
      word(BigInt(`0x${"2".repeat(40)}`)),
      `0x${"3".repeat(64)}`,
    ],
    data: concatWords([
      signedWord(-1n * 10n ** 18n),
      signedWord(-2n * 10n ** 18n),
      word(100n * 10n ** 18n),
      signedWord(-5n * 10n ** 18n),
      signedWord(2n * 10n ** 18n),
      word(60_000n),
    ]),
  });

  assert.equal(decoded?.eventName, "PerpsPositionModified");
  assert.equal(decoded?.payload.sizeDelta18, "-1000000000000000000");
  assert.equal(decoded?.payload.resultingSize18, "-2000000000000000000");
  assert.equal(decoded?.payload.realizedPnlUsd18, "-5000000000000000000");
  assert.equal(decoded?.payload.fundingPaymentUsd18, "2000000000000000000");
});

test("decodes Perps configuration, funding, margin, vault, and insurance evidence", () => {
  const address = `0x${"1".repeat(40)}` as const;
  const marketId = `0x${"3".repeat(64)}` as Hex;
  const cases = [
    {
      topic: "0xa58cd41b611f5133e6dc830579a34a182f5d12a603d535c584034f08a604be07" as Hex,
      topics: [marketId], data: [] as Hex[], eventName: "PerpsMarketConfigurationUpdated",
    },
    {
      topic: "0x9d6f0bb247c9d6f895d1f8c9656b4f0a0a685c0f5f0ecfd231b342d8aa9d3e7d" as Hex,
      topics: [marketId], data: [word(2n), word(3n)], eventName: "PerpsFundingConfigurationSet",
    },
    {
      topic: "0x1ede22bb456b466cf6690bd18f95ae097d7317a38c3d0c53cc5f0ee9e46a0c8d" as Hex,
      topics: [word(BigInt(address)), marketId, word(4n)], data: [word(5n), word(4n)], eventName: "PerpsMarginSeized",
    },
    {
      topic: "0x590fdbd85324c203dad812154d9a8c267fe84441dc242967c95b2dfc2cea280b" as Hex,
      topics: [word(BigInt(address))], data: [word(6n), word(7n)], eventName: "PerpsTraderProfitPaid",
    },
    {
      topic: "0x5af8184bef8e4b45eb9f6ed7734d04da38ced226495548f46e0c8ff8d7d9a524" as Hex,
      topics: [word(BigInt(address))], data: [word(8n)], eventName: "PerpsInsuranceFunded",
    },
    {
      topic: "0xea8ea29c7c4f813f38986371fb702c53d434b53d21a807fd9c8535a55b2823d4" as Hex,
      topics: [marketId, word(0n)], data: [word(9n), word(10n)], eventName: "PerpsAdlDeficitQueued",
    },
    {
      topic: "0x38c6f2cd36803e47dcac9ac5c75981ab7e49ec90a2d190c8a65639944f715f0d" as Hex,
      topics: [word(BigInt(address)), marketId], data: [word(10n), word(11n), word(12n), signedWord(-13n)], eventName: "PerpsPositionAutoDeleveraged",
    },
    {
      topic: "0x5fc21e09e5c0682308968c3c63a715f90ac91b3b51af1e9a5b9b46f81ec08da7" as Hex,
      topics: [marketId, word(BigInt(address)), word(4n)], data: [word(0n), word(11n), word(12n), word(13n)], eventName: "PerpsAdlExecuted",
    },
  ] as const;

  for (const item of cases) {
    const decoded = decodeFloatsCoreLog({
      address,
      topics: [item.topic, ...item.topics],
      data: concatWords(item.data),
    });
    assert.equal(decoded?.eventName, item.eventName);
  }
});

function signedWord(value: bigint): Hex {
  return word(value < 0n ? (1n << 256n) + value : value);
}

function word(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function concatWords(words: readonly Hex[]): Hex {
  return `0x${words.map((item) => item.slice(2)).join("")}`;
}
