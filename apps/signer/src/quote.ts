import { privateKeyToAccount } from "viem/accounts";

import { hashOptionsQuote } from "../../pricer/src/eip712-kms-signer.ts";
import type { UnsignedRuntimeQuote } from "../../pricer/src/runtime.ts";
import type { SignerConfig } from "./config.ts";

export type WireQuote = Record<string, unknown>;

export async function signOptionsQuote(
  input: WireQuote,
  config: SignerConfig,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<{ signature: `0x${string}`; signer: `0x${string}` }> {
  const quote = parseQuote(input);
  validateWindow(quote, nowSeconds);
  const account = privateKeyToAccount(config.privateKey);
  const digest = hashOptionsQuote(
    { chainId: config.chainId, verifyingContract: config.quoteVerifierAddress },
    quote,
  );
  return { signature: await account.sign({ hash: digest }), signer: account.address };
}

function parseQuote(input: WireQuote): UnsignedRuntimeQuote {
  const seriesId = hex(input.seriesId, 32, "seriesId");
  const buyer = hex(input.buyer, 20, "buyer");
  const side = number(input.side, "side");
  if (side !== 0 && side !== 1) throw new Error("INVALID_SIDE");
  const issuedAt = number(input.issuedAt, "issuedAt");
  const validUntil = number(input.validUntil, "validUntil");
  const size18 = uint(input.size18, "size18");
  const premiumPerUnit6 = uint(input.premiumPerUnit6, "premiumPerUnit6");
  const signedSpotUsd18 = uint(input.signedSpotUsd18, "signedSpotUsd18");
  const nonce = uint(input.nonce, "nonce", true);
  if (size18 === 0n || premiumPerUnit6 === 0n || signedSpotUsd18 === 0n) throw new Error("ZERO_QUOTE_VALUE");
  return { seriesId, buyer, side, issuedAt, validUntil, size18, premiumPerUnit6, signedSpotUsd18, nonce };
}

function validateWindow(quote: UnsignedRuntimeQuote, now: number): void {
  if (quote.validUntil <= quote.issuedAt || quote.validUntil - quote.issuedAt > 30) {
    throw new Error("INVALID_QUOTE_WINDOW");
  }
  if (quote.issuedAt > now + 5 || quote.issuedAt < now - 30 || quote.validUntil < now) {
    throw new Error("STALE_QUOTE");
  }
}

function hex(value: unknown, bytes: number, name: string): `0x${string}` {
  if (typeof value !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value)) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return value.toLowerCase() as `0x${string}`;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return value;
}

function uint(value: unknown, name: string, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`INVALID_${name.toUpperCase()}`);
  const parsed = BigInt(value);
  if ((!allowZero && parsed === 0n) || parsed > (1n << 256n) - 1n) throw new Error(`INVALID_${name.toUpperCase()}`);
  return parsed;
}
