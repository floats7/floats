import { recoverAddress, type Address } from "viem";

import { hashOptionsQuote } from "./eip712-kms-signer.ts";
import type { Hex, QuoteSigner, UnsignedRuntimeQuote } from "./runtime.ts";

export interface RailwayQuoteSignerConfig {
  readonly url: string;
  readonly authToken: string;
  readonly chainId: number;
  readonly verifyingContract: Address;
  readonly expectedSigner: Address;
}

export class RailwayQuoteSigner implements QuoteSigner {
  constructor(
    private readonly config: RailwayQuoteSignerConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  async sign(quote: UnsignedRuntimeQuote): Promise<Hex> {
    const response = await this.request(`${this.config.url.replace(/\/$/, "")}/sign/options-quote`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.authToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(encodeQuote(quote)),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`QUOTE_SIGNER_UNAVAILABLE:${response.status}`);
    const body = await response.json() as { signature?: unknown };
    if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) {
      throw new Error("INVALID_QUOTE_SIGNER_RESPONSE");
    }
    const signature = body.signature as Hex;
    const digest = hashOptionsQuote(this.config, quote);
    const recovered = await recoverAddress({ hash: digest, signature });
    if (recovered.toLowerCase() !== this.config.expectedSigner.toLowerCase()) {
      throw new Error("QUOTE_SIGNER_MISMATCH");
    }
    return signature;
  }
}

function encodeQuote(quote: UnsignedRuntimeQuote): Record<string, string | number> {
  return {
    ...quote,
    size18: quote.size18.toString(),
    premiumPerUnit6: quote.premiumPerUnit6.toString(),
    signedSpotUsd18: quote.signedSpotUsd18.toString(),
    nonce: quote.nonce.toString(),
  };
}
