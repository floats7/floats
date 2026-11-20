import type { Alert, AlertSink, Hex, JobName, TransactionRequest } from "./types.ts";
import { TransactionCoordinator } from "./transaction-coordinator.ts";

export interface KeeperJob<TInput> {
  readonly name: JobName;
  run(input: TInput): Promise<void>;
}

abstract class TransactionJob<TInput extends { idempotencyKey: string; request: TransactionRequest }>
  implements KeeperJob<TInput>
{
  abstract readonly name: JobName;
  constructor(protected readonly coordinator: TransactionCoordinator) {}

  async run(input: TInput): Promise<void> {
    await this.coordinator.execute(this.name, input.idempotencyKey, input.request);
  }
}

export class EntryExitJob extends TransactionJob<{
  idempotencyKey: string;
  request: TransactionRequest;
}> {
  readonly name = "entry-exit" as const;
}

export class RebalanceJob extends TransactionJob<{
  idempotencyKey: string;
  request: TransactionRequest;
}> {
  readonly name = "rebalance" as const;
}

abstract class OptionsSeriesJob<TInput extends { seriesId: Hex; request: TransactionRequest }>
  implements KeeperJob<TInput>
{
  abstract readonly name: "options-series" | "options-series-close" | "options-settlement";
  constructor(protected readonly coordinator: TransactionCoordinator) {}

  async run(input: TInput): Promise<void> {
    await this.coordinator.execute(this.name, input.seriesId, input.request);
  }
}

export class OptionsSeriesCreationJob extends OptionsSeriesJob<{
  seriesId: Hex;
  request: TransactionRequest;
}> {
  readonly name = "options-series" as const;
}

export class OptionsSettlementJob extends OptionsSeriesJob<{
  seriesId: Hex;
  request: TransactionRequest;
}> {
  readonly name = "options-settlement" as const;
}

export class OptionsSeriesCloseJob extends OptionsSeriesJob<{
  seriesId: Hex;
  request: TransactionRequest;
}> {
  readonly name = "options-series-close" as const;
}

export class OptionsWithdrawalEpochJob
  implements KeeperJob<{ epochId: bigint; request: TransactionRequest }>
{
  readonly name = "options-withdrawal-epoch" as const;
  constructor(private readonly coordinator: TransactionCoordinator) {}

  async run(input: { epochId: bigint; request: TransactionRequest }): Promise<void> {
    await this.coordinator.execute(this.name, input.epochId.toString(), input.request);
  }
}

export class PerpsFundingJob extends TransactionJob<{ idempotencyKey: string; request: TransactionRequest }> { readonly name = "perps-funding" as const; }
export class PerpsLiquidationJob extends TransactionJob<{ idempotencyKey: string; request: TransactionRequest }> { readonly name = "perps-liquidation" as const; }
export class PerpsSessionJob extends TransactionJob<{ idempotencyKey: string; request: TransactionRequest }> { readonly name = "perps-session" as const; }
export class PerpsWithdrawalJob extends TransactionJob<{ idempotencyKey: string; request: TransactionRequest }> { readonly name = "perps-withdrawal" as const; }

export class PerpsRiskAlertJob {
  constructor(private readonly sink: AlertSink) {}
  async run(input: {
    readonly idempotencyKey: string;
    readonly utilizationBps: bigint;
    readonly utilizationWarningBps: bigint;
    readonly recognizedBadDebt6: bigint;
    readonly insuranceBalance6: bigint;
    readonly minimumInsurance6: bigint;
    readonly largestLiquidationUsd18: bigint;
    readonly largeLiquidationThresholdUsd18: bigint;
    readonly openInterest: readonly { marketId: string; sideOpenInterestUsd18: bigint; capUsd18: bigint }[];
    readonly openInterestWarningBps: bigint;
  }) {
    const context = { idempotencyKey: input.idempotencyKey };
    if (input.recognizedBadDebt6 > 0n) await this.sink.publish({ code: "PERPS_BAD_DEBT", severity: "critical", message: "Perps vault has recognized bad debt", context: { ...context, recognizedBadDebt6: input.recognizedBadDebt6.toString() } });
    if (input.minimumInsurance6 > 0n && input.insuranceBalance6 < input.minimumInsurance6) await this.sink.publish({ code: "PERPS_LOW_INSURANCE", severity: "critical", message: "Perps insurance balance is below its configured minimum", context: { ...context, insuranceBalance6: input.insuranceBalance6.toString(), minimumInsurance6: input.minimumInsurance6.toString() } });
    if (input.utilizationBps >= input.utilizationWarningBps) await this.sink.publish({ code: "PERPS_HIGH_UTILIZATION", severity: "warning", message: "Perps LP utilization is approaching its safety limit", context: { ...context, utilizationBps: input.utilizationBps.toString() } });
    if (input.largeLiquidationThresholdUsd18 > 0n && input.largestLiquidationUsd18 >= input.largeLiquidationThresholdUsd18) await this.sink.publish({ code: "PERPS_LARGE_LIQUIDATION", severity: "warning", message: "A large Perps liquidation was finalized", context: { ...context, liquidationUsd18: input.largestLiquidationUsd18.toString() } });
    for (const market of input.openInterest) {
      if (market.capUsd18 > 0n && market.sideOpenInterestUsd18 * 10_000n >= market.capUsd18 * input.openInterestWarningBps) await this.sink.publish({ code: "PERPS_HIGH_OPEN_INTEREST", severity: "warning", message: "Perps open interest is approaching the configured market cap", context: { ...context, marketId: market.marketId, sideOpenInterestUsd18: market.sideOpenInterestUsd18.toString(), capUsd18: market.capUsd18.toString() } });
    }
  }
}

export class DriftJob implements KeeperJob<{
  idempotencyKey: string;
  driftBps: number;
  maximumDriftBps: number;
}> {
  readonly name = "drift" as const;
  constructor(private readonly alerts: AlertSink) {}

  async run(input: { idempotencyKey: string; driftBps: number; maximumDriftBps: number }) {
    if (input.driftBps <= input.maximumDriftBps) return;
    await this.alerts.publish({
      code: "EXCESSIVE_DRIFT",
      severity: "warning",
      message: "Index drift exceeds the configured threshold",
      context: input,
    });
  }
}

export class OracleHealthJob implements KeeperJob<{
  idempotencyKey: string;
  symbol: string;
  health: string;
}> {
  readonly name = "oracle-health" as const;
  constructor(private readonly alerts: AlertSink) {}

  async run(input: { idempotencyKey: string; symbol: string; health: string }) {
    if (input.health === "Live") return;
    await this.alerts.publish({
      code: "STALE_ORACLE",
      severity: input.health === "Invalid" || input.health === "Paused" ? "critical" : "warning",
      message: `Oracle ${input.symbol} is ${input.health}`,
      context: input,
    });
  }
}

export class AlertJob implements KeeperJob<{ idempotencyKey: string; alerts: readonly Alert[] }> {
  readonly name = "alert" as const;
  constructor(private readonly sink: AlertSink) {}

  async run(input: { idempotencyKey: string; alerts: readonly Alert[] }) {
    for (const alert of input.alerts) await this.sink.publish(alert);
  }
}

export class OperationalHealthJob implements KeeperJob<{
  idempotencyKey: string;
  premiumDiscountBps: number;
  maximumPremiumDiscountBps: number;
  gasBalance: bigint;
  minimumGasBalance: bigint;
  pendingNonceAgeMs: number;
  maximumPendingNonceAgeMs: number;
}> {
  readonly name = "alert" as const;
  constructor(private readonly sink: AlertSink) {}

  async run(input: {
    idempotencyKey: string;
    premiumDiscountBps: number;
    maximumPremiumDiscountBps: number;
    gasBalance: bigint;
    minimumGasBalance: bigint;
    pendingNonceAgeMs: number;
    maximumPendingNonceAgeMs: number;
  }) {
    if (Math.abs(input.premiumDiscountBps) > input.maximumPremiumDiscountBps) {
      await this.sink.publish({
        code: "PREMIUM_DISCOUNT",
        severity: "warning",
        message: "Vault premium or discount exceeds the configured threshold",
        context: {
          idempotencyKey: input.idempotencyKey,
          premiumDiscountBps: input.premiumDiscountBps,
        },
      });
    }
    if (input.gasBalance < input.minimumGasBalance) {
      await this.sink.publish({
        code: "LOW_GAS",
        severity: "critical",
        message: "Keeper gas balance is below the configured minimum",
        context: { idempotencyKey: input.idempotencyKey },
      });
    }
    if (input.pendingNonceAgeMs > input.maximumPendingNonceAgeMs) {
      await this.sink.publish({
        code: "STUCK_NONCE",
        severity: "critical",
        message: "Keeper nonce has remained pending beyond the configured maximum",
        context: {
          idempotencyKey: input.idempotencyKey,
          pendingNonceAgeMs: input.pendingNonceAgeMs,
        },
      });
    }
  }
}
