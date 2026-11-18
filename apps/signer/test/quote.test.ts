import assert from "node:assert/strict";
import test from "node:test";
import { recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { hashOptionsQuote } from "../../pricer/src/eip712-kms-signer.ts";
import type { UnsignedRuntimeQuote } from "../../pricer/src/runtime.ts";
import type { SignerConfig } from "../src/config.ts";
import { signOptionsQuote } from "../src/quote.ts";

const config: SignerConfig = {
  appEnvironment: "testnet",
  chainId: 46630,
  quoteVerifierAddress: "0x1111111111111111111111111111111111111111",
  privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  authToken: "a".repeat(32),
  port: 3000,
};

const quote = {
  seriesId: `0x${"22".repeat(32)}`,
  side: 0,
  buyer: "0x3333333333333333333333333333333333333333",
  size18: "1000000000000000000",
  premiumPerUnit6: "2500000",
  signedSpotUsd18: "100000000000000000000",
  nonce: "0",
  issuedAt: 1_000,
  validUntil: 1_030,
};

test("signs only a fresh exact-domain Options quote", async () => {
  const result = await signOptionsQuote(quote, config, 1_001);
  const typedQuote: UnsignedRuntimeQuote = {
    ...quote,
    seriesId: quote.seriesId as `0x${string}`,
    buyer: quote.buyer as `0x${string}`,
    side: 0,
    size18: 10n ** 18n,
    premiumPerUnit6: 2_500_000n,
    signedSpotUsd18: 100n * 10n ** 18n,
    nonce: 0n,
  };
  const digest = hashOptionsQuote(
    { chainId: config.chainId, verifyingContract: config.quoteVerifierAddress },
    typedQuote,
  );
  assert.equal(await recoverAddress({ hash: digest, signature: result.signature }), privateKeyToAccount(config.privateKey).address);
});

test("rejects stale and oversized quote windows", async () => {
  await assert.rejects(signOptionsQuote({ ...quote, validUntil: 1_031 }, config, 1_001), /INVALID_QUOTE_WINDOW/);
  await assert.rejects(signOptionsQuote(quote, config, 1_100), /STALE_QUOTE/);
});
