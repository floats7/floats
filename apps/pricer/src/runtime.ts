import type { QuotePolicyInput } from "./quote-policy.ts";
import { PricerService } from "./service.ts";

export type Hex = `0x${string}`;

export interface RuntimeQuoteRequest {
  readonly requestId: string;
  readonly seriesId: Hex;
  readonly buyer: Hex;
  readonly side: "buy" | "sell-back";
  readonly size18: bigint;
}

export interface RuntimePricingContext {
  readonly policyInput: Omit<QuotePolicyInput, "side" | "nowSeconds">;
  readonly signedSpotUsd18: bigint;
}

export interface PricingContextSource {
  load(request: RuntimeQuoteRequest, nowSeconds: number): Promise<RuntimePricingContext>;
}

export interface QuoteNonceSource {
  next(buyer: Hex): Promise<bigint>;
}

export interface UnsignedRuntimeQuote {
  readonly seriesId: Hex;
  readonly side: 0 | 1;
  readonly buyer: Hex;
  readonly size18: bigint;
  readonly premiumPerUnit6: bigint;
  readonly signedSpotUsd18: bigint;
  readonly nonce: bigint;
  readonly issuedAt: number;
  readonly validUntil: number;
}

export interface QuoteSigner {
  sign(quote: UnsignedRuntimeQuote): Promise<Hex>;
}

/** @deprecated Use QuoteSigner. */
export type KmsQuoteSigner = QuoteSigner;

export interface SignedRuntimeQuote {
  readonly quote: UnsignedRuntimeQuote;
  readonly signature: Hex;
  readonly fairValueUsd: number;
  readonly volatility: number;
  readonly ivSource: string;
  readonly spreadBps: number;
  readonly utilizationBps: number;
}

export class PrivateQuoteRuntime {
  constructor(
    private readonly pricer: PricerService,
    private readonly contextSource: PricingContextSource,
    private readonly nonceSource: QuoteNonceSource,
    private readonly signer: QuoteSigner,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1_000),
  ) {}

  async quote(request: RuntimeQuoteRequest): Promise<SignedRuntimeQuote> {
    validateRequest(request);
    const nowSeconds = this.clock();
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new Error("INVALID_CLOCK");
    const context = await this.contextSource.load(request, nowSeconds);
    if (context.signedSpotUsd18 <= 0n) throw new Error("ORACLE_UNAVAILABLE");
    const result = await this.pricer.price({
      requestId: request.requestId,
      seriesId: request.seriesId,
      buyer: request.buyer,
      policyInput: {
        ...context.policyInput,
        side: request.side,
        nowSeconds,
      },
    });
    const quote: UnsignedRuntimeQuote = {
      seriesId: request.seriesId,
      side: request.side === "buy" ? 0 : 1,
      buyer: request.buyer.toLowerCase() as Hex,
      size18: request.size18,
      premiumPerUnit6: result.premiumPerUnit6,
      signedSpotUsd18: context.signedSpotUsd18,
      nonce: await this.nonceSource.next(request.buyer),
      issuedAt: nowSeconds,
      validUntil: nowSeconds + 30,
    };
    if (quote.nonce < 0n) throw new Error("INVALID_NONCE");
    const signature = await this.signer.sign(quote);
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("INVALID_KMS_SIGNATURE");
    return {
      quote,
      signature,
      fairValueUsd: result.fairValueUsd,
      volatility: result.volatility,
      ivSource: result.ivSource,
      spreadBps: result.spreadBps,
      utilizationBps: context.policyInput.utilizationBps,
    };
  }
}

function validateRequest(request: RuntimeQuoteRequest): void {
  if (!request.requestId || request.requestId.length > 128) throw new Error("INVALID_REQUEST_ID");
  if (!/^0x[0-9a-fA-F]{64}$/.test(request.seriesId)) throw new Error("INVALID_SERIES_ID");
  if (!/^0x[0-9a-fA-F]{40}$/.test(request.buyer)) throw new Error("INVALID_BUYER");
  if (request.size18 <= 0n || request.size18 > (1n << 256n) - 1n) {
    throw new Error("INVALID_SIZE");
  }
}
