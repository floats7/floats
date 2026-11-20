import { PerpsFundingJob, PerpsLiquidationJob, PerpsSessionJob, PerpsWithdrawalJob } from "./jobs.ts";
import type { PerpsActionDiscovery, PerpsPositionCandidate } from "./perps-discovery.ts";
import type { Hex } from "./types.ts";

export interface PerpsCycleInput {
  readonly observedAtSeconds: number;
  readonly marketIds: readonly Hex[];
  readonly positions: readonly PerpsPositionCandidate[];
  readonly withdrawals: readonly bigint[];
  readonly sessions: readonly { readonly marketId: Hex; readonly desired: 0 | 1 | 2 | 3 }[];
}

export class PerpsKeeperCycle {
  constructor(private readonly discovery: PerpsActionDiscovery, private readonly fundingJob: PerpsFundingJob, private readonly liquidationJob: PerpsLiquidationJob, private readonly sessionJob: PerpsSessionJob, private readonly withdrawalJob: PerpsWithdrawalJob) {}
  async run(input: PerpsCycleInput) {
    let fundingUpdates = 0; let liquidations = 0; let adlExecutions = 0; let sessionUpdates = 0; let withdrawalProcesses = 0;
    for (const marketId of input.marketIds) {
      const action = await this.discovery.funding(marketId, input.observedAtSeconds);
      if (!action) continue;
      await this.fundingJob.run({ idempotencyKey: action.id, request: action.request }); fundingUpdates += 1;
    }
    const crossAccounts = new Set<string>();
    for (const position of input.positions) {
      if (position.mode === "cross" && crossAccounts.has(position.account)) continue;
      if (position.mode === "cross") crossAccounts.add(position.account);
      const action = await this.discovery.liquidation(position);
      if (!action) continue;
      await this.liquidationJob.run({ idempotencyKey: action.id, request: action.request }); liquidations += 1;
    }
    const adlAction = await this.discovery.adl(input.positions);
    if (adlAction) {
      await this.liquidationJob.run({ idempotencyKey: adlAction.id, request: adlAction.request });
      adlExecutions += 1;
    }
    for (const requestId of input.withdrawals) {
      const action = await this.discovery.withdrawal(requestId, input.observedAtSeconds);
      if (!action) continue;
      await this.withdrawalJob.run({ idempotencyKey: action.id, request: action.request }); withdrawalProcesses += 1;
    }
    for (const item of input.sessions) {
      const action = await this.discovery.session(item.marketId, item.desired, input.observedAtSeconds);
      if (!action) continue;
      await this.sessionJob.run({ idempotencyKey: action.id, request: action.request }); sessionUpdates += 1;
    }
    return { fundingUpdates, liquidations, adlExecutions, sessionUpdates, withdrawalProcesses };
  }
}
