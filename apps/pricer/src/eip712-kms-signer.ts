import {
  hashTypedData,
  recoverAddress,
  serializeSignature,
  toHex,
  type Address,
} from "viem";

import type { Hex, KmsQuoteSigner, UnsignedRuntimeQuote } from "./runtime.ts";

const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_CURVE_ORDER = CURVE_ORDER / 2n;

export interface KmsDigestClient {
  signDigest(digest: Hex): Promise<Uint8Array>;
}

export interface Eip712QuoteDomain {
  readonly chainId: number;
  readonly verifyingContract: Address;
  readonly expectedSigner: Address;
}

export function hashOptionsQuote(
  domain: Pick<Eip712QuoteDomain, "chainId" | "verifyingContract">,
  quote: UnsignedRuntimeQuote,
): Hex {
  if (!Number.isSafeInteger(domain.chainId) || domain.chainId <= 0) {
    throw new Error("Invalid quote chain ID");
  }
  return hashTypedData({
    domain: {
      name: "Floats Options",
      version: "1",
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    primaryType: "Quote",
    types: {
      Quote: [
        { name: "seriesId", type: "bytes32" },
        { name: "side", type: "uint8" },
        { name: "buyer", type: "address" },
        { name: "size18", type: "uint256" },
        { name: "premiumPerUnit6", type: "uint256" },
        { name: "signedSpotUsd18", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "issuedAt", type: "uint48" },
        { name: "validUntil", type: "uint48" },
      ],
    },
    message: { ...quote, buyer: quote.buyer as Address },
  });
}

export class Eip712KmsQuoteSigner implements KmsQuoteSigner {
  constructor(
    private readonly client: KmsDigestClient,
    private readonly domain: Eip712QuoteDomain,
  ) {
    if (!Number.isSafeInteger(domain.chainId) || domain.chainId <= 0) {
      throw new Error("Invalid quote chain ID");
    }
  }

  hashQuote(quote: UnsignedRuntimeQuote): Hex {
    return hashOptionsQuote(this.domain, quote);
  }

  async sign(quote: UnsignedRuntimeQuote): Promise<Hex> {
    const digest = this.hashQuote(quote);
    const der = await this.client.signDigest(digest);
    return recoverEthereumSignature(digest, der, this.domain.expectedSigner);
  }
}

export async function recoverEthereumSignature(
  digest: Hex,
  derSignature: Uint8Array,
  expectedSigner: Address,
): Promise<Hex> {
  const parsed = parseDerSignature(derSignature);
  const normalizedS = parsed.s > HALF_CURVE_ORDER ? CURVE_ORDER - parsed.s : parsed.s;
  const r = toHex(parsed.r, { size: 32 });
  const s = toHex(normalizedS, { size: 32 });

  for (const yParity of [0, 1] as const) {
    const signature = serializeSignature({ r, s, yParity });
    const recovered = await recoverAddress({ hash: digest, signature });
    if (recovered.toLowerCase() === expectedSigner.toLowerCase()) return signature;
  }
  throw new Error("KMS_SIGNATURE_SIGNER_MISMATCH");
}

function parseDerSignature(bytes: Uint8Array): { r: bigint; s: bigint } {
  if (bytes.length < 8 || bytes[0] !== 0x30 || bytes[1] !== bytes.length - 2) {
    throw new Error("INVALID_KMS_DER_SIGNATURE");
  }
  const first = readDerInteger(bytes, 2);
  const second = readDerInteger(bytes, first.next);
  if (second.next !== bytes.length) throw new Error("INVALID_KMS_DER_SIGNATURE");
  if (first.value <= 0n || first.value >= CURVE_ORDER || second.value <= 0n || second.value >= CURVE_ORDER) {
    throw new Error("INVALID_KMS_DER_SCALAR");
  }
  return { r: first.value, s: second.value };
}

function readDerInteger(bytes: Uint8Array, offset: number): { value: bigint; next: number } {
  if (bytes[offset] !== 0x02) throw new Error("INVALID_KMS_DER_SIGNATURE");
  const length = bytes[offset + 1];
  if (length === undefined || length < 1 || length > 33) {
    throw new Error("INVALID_KMS_DER_SIGNATURE");
  }
  const start = offset + 2;
  const end = start + length;
  if (end > bytes.length) throw new Error("INVALID_KMS_DER_SIGNATURE");
  const encoded = bytes.slice(start, end);
  if ((encoded[0] ?? 0) >= 0x80) throw new Error("INVALID_KMS_DER_SIGNATURE");
  if (encoded.length > 1 && encoded[0] === 0 && (encoded[1] ?? 0) < 0x80) {
    throw new Error("INVALID_KMS_DER_SIGNATURE");
  }
  return { value: BigInt(toHex(encoded)), next: end };
}
