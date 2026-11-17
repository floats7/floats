import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletChallenge, verifyWalletChallenge } from "../src/wallet-auth.ts";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const requestUrl = new URL("https://floats.example/api/wallet-history");

test("accepts a correctly scoped wallet challenge and rejects the wrong nonce", async () => {
  const challenge = createWalletChallenge(requestUrl, account.address, 46_630);
  const signature = await account.signMessage({ message: challenge.message });

  const verified = await verifyWalletChallenge({
    requestUrl,
    message: challenge.message,
    signature,
    cookieNonce: challenge.nonce,
    chainId: 46_630,
  });
  assert.equal(verified, account.address.toLowerCase());

  const rejected = await verifyWalletChallenge({
    requestUrl,
    message: challenge.message,
    signature,
    cookieNonce: "00".repeat(16),
    chainId: 46_630,
  });
  assert.equal(rejected, null);
});
