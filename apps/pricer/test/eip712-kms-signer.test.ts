import assert from "node:assert/strict";
import test from "node:test";
import { parseSignature, recoverAddress, toBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Eip712KmsQuoteSigner, recoverEthereumSignature } from "../src/eip712-kms-signer.ts";
import type { UnsignedRuntimeQuote } from "../src/runtime.ts";

const account = privateKeyToAccount(`0x${"44".repeat(32)}`);
const quote: UnsignedRuntimeQuote = {
  seriesId: `0x${"11".repeat(32)}`,
  side: 0,
  buyer: `0x${"22".repeat(20)}`,
  size18: 10n ** 18n,
  premiumPerUnit6: 60_000_000n,
  signedSpotUsd18: 150n * 10n ** 18n,
  nonce: 7n,
  issuedAt: 1_000,
  validUntil: 1_030,
};

test("converts a DER KMS signature into the expected Ethereum signer", async () => {
  let digestSeen = "";
  const signer = new Eip712KmsQuoteSigner(
    {
      async signDigest(digest) {
        digestSeen = digest;
        const compact = await account.sign({ hash: digest });
        const parsed = parseSignature(compact);
        return encodeDer(BigInt(parsed.r), BigInt(parsed.s));
      },
    },
    {
      chainId: 46_630,
      verifyingContract: `0x${"33".repeat(20)}`,
      expectedSigner: account.address,
    },
  );

  const signature = await signer.sign(quote);
  assert.equal(digestSeen, signer.hashQuote(quote));
  assert.equal(
    (await recoverAddress({ hash: signer.hashQuote(quote), signature })).toLowerCase(),
    account.address.toLowerCase(),
  );
});

test("rejects malformed DER and a signature from the wrong key", async () => {
  await assert.rejects(
    () => recoverEthereumSignature(`0x${"11".repeat(32)}`, new Uint8Array([1, 2, 3]), account.address),
    /INVALID_KMS_DER_SIGNATURE/,
  );
  const other = privateKeyToAccount(`0x${"55".repeat(32)}`);
  const digest = `0x${"66".repeat(32)}` as const;
  const compact = await other.sign({ hash: digest });
  const parsed = parseSignature(compact);
  await assert.rejects(
    () => recoverEthereumSignature(digest, encodeDer(BigInt(parsed.r), BigInt(parsed.s)), account.address),
    /KMS_SIGNATURE_SIGNER_MISMATCH/,
  );
});

function encodeDer(r: bigint, s: bigint): Uint8Array {
  const left = encodeInteger(r);
  const right = encodeInteger(s);
  return new Uint8Array([0x30, left.length + right.length, ...left, ...right]);
}

function encodeInteger(value: bigint): Uint8Array {
  let bytes = toBytes(toHex(value));
  if ((bytes[0] ?? 0) >= 0x80) bytes = new Uint8Array([0, ...bytes]);
  return new Uint8Array([0x02, bytes.length, ...bytes]);
}
