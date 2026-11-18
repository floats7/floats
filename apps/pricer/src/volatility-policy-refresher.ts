import type { Pool } from "pg";

export class VolatilityPolicyRefresher {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly database: Pool,
    private readonly environment: "testnet" | "mainnet",
    private readonly chainId: number,
    private readonly pollIntervalMs = 300_000,
  ) {
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 60_000) {
      throw new Error("Volatility policy poll interval is invalid");
    }
  }

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async refresh(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const result = await this.database.query(
        `insert into public.options_volatility_observations
           (environment, chain_id, underlying, source, annualized_volatility, observed_at)
         select policy.environment, policy.chain_id, policy.underlying, policy.source,
                policy.annualized_volatility, now()
           from public.options_volatility_policies policy
          where policy.environment = $1 and policy.chain_id = $2
            and policy.enabled and policy.valid_until > now()
            and not exists (
              select 1 from public.options_volatility_observations observation
               where observation.environment = policy.environment
                 and observation.chain_id = policy.chain_id
                 and observation.underlying = policy.underlying
                 and observation.source = policy.source
                 and observation.observed_at > now() - make_interval(secs => policy.refresh_interval_seconds)
            )
         returning underlying`,
        [this.environment, this.chainId],
      );
      if (result.rowCount) console.log(JSON.stringify({ event: "volatility_policies_refreshed", environment: this.environment, chainId: this.chainId, count: result.rowCount }));
      return result.rowCount ?? 0;
    } catch (error) {
      console.error(JSON.stringify({ event: "volatility_policy_refresh_failed", environment: this.environment, chainId: this.chainId, error: error instanceof Error ? error.message : "Unknown error" }));
      return 0;
    } finally {
      this.running = false;
    }
  }
}
