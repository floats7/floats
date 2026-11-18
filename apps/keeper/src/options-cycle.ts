import {
  OptionsSeriesCreationJob,
  OptionsSeriesCloseJob,
  OptionsSettlementJob,
  OptionsWithdrawalEpochJob,
} from "./jobs.ts";
import type { OptionsActionDiscovery, OptionsSeriesTerms } from "./options-discovery.ts";
import type { Hex } from "./types.ts";

export interface OptionsCycleInput {
  readonly observedAtSeconds: number;
  readonly desiredSeries: readonly OptionsSeriesTerms[];
  readonly settlementCandidates: readonly Hex[];
  readonly tradingCloseCandidates: readonly Hex[];
  readonly withdrawalCandidates: readonly bigint[];
}

export interface OptionsCycleResult {
  readonly seriesCreations: number;
  readonly settlements: number;
  readonly tradingClosures: number;
  readonly withdrawalFinalizations: number;
}

export class OptionsKeeperCycle {
  constructor(
    private readonly discovery: OptionsActionDiscovery,
    private readonly seriesJob: OptionsSeriesCreationJob,
    private readonly seriesCloseJob: OptionsSeriesCloseJob,
    private readonly settlementJob: OptionsSettlementJob,
    private readonly withdrawalJob: OptionsWithdrawalEpochJob,
  ) {}

  async run(input: OptionsCycleInput): Promise<OptionsCycleResult> {
    let seriesCreations = 0;
    let settlements = 0;
    let tradingClosures = 0;
    let withdrawalFinalizations = 0;

    for (const terms of input.desiredSeries) {
      const action = await this.discovery.seriesCreation(terms);
      if (!action || typeof action.id !== "string") continue;
      await this.seriesJob.run({ seriesId: action.id, request: action.request });
      seriesCreations += 1;
    }
    for (const seriesId of input.tradingCloseCandidates) {
      const action = await this.discovery.tradingClose(seriesId, input.observedAtSeconds);
      if (!action || typeof action.id !== "string") continue;
      await this.seriesCloseJob.run({ seriesId: action.id, request: action.request });
      tradingClosures += 1;
    }
    for (const seriesId of input.settlementCandidates) {
      const action = await this.discovery.settlement(seriesId, input.observedAtSeconds);
      if (!action || typeof action.id !== "string") continue;
      await this.settlementJob.run({ seriesId: action.id, request: action.request });
      settlements += 1;
    }
    for (const requestId of input.withdrawalCandidates) {
      const action = await this.discovery.withdrawal(requestId, input.observedAtSeconds);
      if (!action || typeof action.id !== "bigint") continue;
      await this.withdrawalJob.run({ epochId: action.id, request: action.request });
      withdrawalFinalizations += 1;
    }

    return { seriesCreations, tradingClosures, settlements, withdrawalFinalizations };
  }
}
