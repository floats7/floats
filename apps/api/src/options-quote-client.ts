export interface OptionsQuoteRequest {
  readonly requestId: string;
  readonly seriesId: string;
  readonly buyer: string;
  readonly side: "buy" | "sell-back";
  readonly size18: string;
}

export interface OptionsQuoteResponse {
  readonly quote: {
    readonly seriesId: string;
    readonly side: number;
    readonly buyer: string;
    readonly size18: string;
    readonly premiumPerUnit6: string;
    readonly signedSpotUsd18: string;
    readonly nonce: string;
    readonly issuedAt: number;
    readonly validUntil: number;
  };
  readonly signature: string;
  readonly fairValueUsd: number;
  readonly volatility: number;
  readonly ivSource: string;
  readonly spreadBps: number;
  readonly utilizationBps: number;
}

export class OptionsQuoteClient {
  constructor(
    private readonly url: URL,
    private readonly authToken: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async quote(input: OptionsQuoteRequest, signal?: AbortSignal): Promise<OptionsQuoteResponse> {
    const response = await this.request(new URL("/quote", this.url), {
      method: "POST",
      headers: { authorization: `Bearer ${this.authToken}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(7_000)]) : AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new Error(`PRICER_UNAVAILABLE:${response.status}`);
    return await response.json() as OptionsQuoteResponse;
  }
}
