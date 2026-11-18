import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import { hashOptionsQuote } from "../src/eip712-kms-signer.ts";
import { RailwayQuoteSigner } from "../src/railway-quote-signer.ts";
import type { UnsignedRuntimeQuote } from "../src/runtime.ts";

const account = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const domain = {
  chainId: 46630,
  verifyingContract: "0x1111111111111111111111111111111111111111" as const,
  expectedSigner: account.address,
};
const quote: UnsignedRuntimeQuote = {
  seriesId: `0x${"22".repeat(32)}`,
  side: 0,
  buyer: "0x3333333333333333333333333333333333333333",
  size18: 10n ** 18n,
  premiumPerUnit6: 2_500_000n,
  signedSpotUsd18: 100n * 10n ** 18n,
  nonce: 7n,
  issuedAt: 1_000,
  validUntil: 1_030,
};

test("verifies the Railway signer response before returning it", async () => {
  const signature = await account.sign({ hash: hashOptionsQuote(domain, quote) });
  const signer = new RailwayQuoteSigner(
    { url: "http://signer.railway.internal", authToken: "secret", ...domain },
    async (_input, init) => {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer secret");
      assert.match(String(init?.body), /"size18":"1000000000000000000"/);
      return Response.json({ signature });
    },
  );
  assert.equal(await signer.sign(quote), signature);
});

test("rejects a valid signature from an unexpected key", async () => {
  const wrongAccount = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  const signature = await wrongAccount.sign({ hash: hashOptionsQuote(domain, quote) });
  const signer = new RailwayQuoteSigner(
    { url: "http://signer.railway.internal", authToken: "secret", ...domain },
    async () => Response.json({ signature }),
  );
  await assert.rejects(signer.sign(quote), /QUOTE_SIGNER_MISMATCH/);
});
