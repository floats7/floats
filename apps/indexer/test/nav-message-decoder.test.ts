import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, pad, parseAbiParameters } from "viem";
import {
  decodeNavMessageLog,
  NAV_MIRRORED_TOPIC,
  NAV_PUBLISHED_TOPIC,
} from "../src/nav-message-decoder.ts";

const guid = `0x${"a".repeat(64)}` as const;
const data = encodeAbiParameters(
  parseAbiParameters("uint256 nav18, uint256 canonicalTotalSupply, uint48 observedAt"),
  [1_010_000_000_000_000_000n, 2_000_000_000_000_000_000n, 1_795_046_400],
);

test("decodes a NAV publication without numeric precision loss", () => {
  assert.deepEqual(
    decodeNavMessageLog({
      topics: [NAV_PUBLISHED_TOPIC, guid, pad("0x7724", { size: 32 }), pad("0x01", { size: 32 })],
      data,
    }),
    {
      eventName: "NavPublished",
      payload: {
        guid,
        sequence: "1",
        nav18: "1010000000000000000",
        canonicalTotalSupply: "2000000000000000000",
        observedAt: "1795046400",
        dstEid: "30500",
      },
    },
  );
});

test("decodes a mirrored NAV with its source EID", () => {
  const decoded = decodeNavMessageLog({
    topics: [NAV_MIRRORED_TOPIC, guid, pad("0x76d0", { size: 32 }), pad("0x01", { size: 32 })],
    data,
  });
  assert.equal(decoded?.eventName, "NavMirrored");
  assert.equal(decoded?.payload.srcEid, "30416");
});

test("rejects zero NAV publication values", () => {
  assert.throws(
    () => decodeNavMessageLog({
      topics: [NAV_PUBLISHED_TOPIC, guid, pad("0x7724", { size: 32 }), pad("0x01", { size: 32 })],
      data: encodeAbiParameters(
        parseAbiParameters("uint256 nav18, uint256 canonicalTotalSupply, uint48 observedAt"),
        [0n, 1n, 1],
      ),
    }),
    /NAV_MESSAGE_VALUE_INVALID/,
  );
});
