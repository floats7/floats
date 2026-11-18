import { priceQuote, type QuotePolicyInput, type QuotePolicyResult } from "./quote-policy.ts";

export interface QuoteAuditRecord {
  readonly requestId: string;
  readonly seriesId: `0x${string}`;
  readonly buyer: `0x${string}`;
  readonly side: "buy" | "sell-back";
  readonly decision: "quoted" | "rejected";
  readonly reason?: string;
  readonly policyInput: QuotePolicyInput;
  readonly result?: QuotePolicyResult;
}

export interface QuoteAuditSink {
  append(record: QuoteAuditRecord): Promise<void>;
}

export interface PriceRequest {
  readonly requestId: string;
  readonly seriesId: `0x${string}`;
  readonly buyer: `0x${string}`;
  readonly policyInput: QuotePolicyInput;
}

export class PricerService {
  constructor(private readonly audit: QuoteAuditSink) {}

  async price(request: PriceRequest): Promise<QuotePolicyResult> {
    try {
      const result = priceQuote(request.policyInput);
      await this.audit.append({
        requestId: request.requestId,
        seriesId: request.seriesId,
        buyer: request.buyer,
        side: request.policyInput.side,
        decision: "quoted",
        policyInput: request.policyInput,
        result,
      });
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "PRICING_FAILED";
      await this.audit.append({
        requestId: request.requestId,
        seriesId: request.seriesId,
        buyer: request.buyer,
        side: request.policyInput.side,
        decision: "rejected",
        reason,
        policyInput: request.policyInput,
      });
      throw error;
    }
  }
}
