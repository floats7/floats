import type { CrossChainMessage } from "./message.ts";
import { reconcileSupply, type SupplySnapshot } from "./reconciliation.ts";

export type CrossChainAlertCode =
  | "SUPPLY_INVARIANT_MISMATCH"
  | "MESSAGE_DELIVERY_DELAYED"
  | "MESSAGE_EXECUTION_FAILED"
  | "NAV_STALE"
  | "CONFIGURATION_DRIFT";

export interface CrossChainAlert {
  readonly code: CrossChainAlertCode;
  readonly severity: "warning" | "critical";
  readonly subject: string;
  readonly observedAt: Date;
  readonly details: Readonly<Record<string, string>>;
}

export interface MonitoringSnapshot {
  readonly observedAt: Date;
  readonly supply: SupplySnapshot;
  readonly messages: readonly CrossChainMessage[];
  readonly maximumDeliveryDelaySeconds: number;
  readonly navObservedAt?: Date;
  readonly maximumNavAgeSeconds?: number;
  readonly expectedConfigurationHash: string;
  readonly observedConfigurationHash: string;
}

export function evaluateCrossChainAlerts(snapshot: MonitoringSnapshot): readonly CrossChainAlert[] {
  validateSnapshot(snapshot);
  const alerts: CrossChainAlert[] = [];
  const supply = reconcileSupply(snapshot.supply);
  if (!supply.isBacked) {
    alerts.push({
      code: "SUPPLY_INVARIANT_MISMATCH",
      severity: "critical",
      subject: "crosschain-supply",
      observedAt: snapshot.observedAt,
      details: {
        adapterBalance: supply.canonicalAdapterBalance.toString(),
        remoteSupply: supply.remoteOftTotalSupply.toString(),
        backingSurplus: supply.backingSurplus.toString(),
      },
    });
  }

  for (const message of snapshot.messages) {
    if (message.state === "failed" || message.state === "retryable") {
      alerts.push({
        code: "MESSAGE_EXECUTION_FAILED",
        severity: message.state === "failed" ? "critical" : "warning",
        subject: message.guid,
        observedAt: snapshot.observedAt,
        details: { state: message.state, transactionHash: message.transactionHash },
      });
    }
    const ageSeconds = (snapshot.observedAt.getTime() - message.sentAt.getTime()) / 1_000;
    if (message.state === "pending" && ageSeconds > snapshot.maximumDeliveryDelaySeconds) {
      alerts.push({
        code: "MESSAGE_DELIVERY_DELAYED",
        severity: "warning",
        subject: message.guid,
        observedAt: snapshot.observedAt,
        details: { ageSeconds: Math.floor(ageSeconds).toString() },
      });
    }
  }

  if (snapshot.navObservedAt && snapshot.maximumNavAgeSeconds !== undefined) {
    const navAgeSeconds =
      (snapshot.observedAt.getTime() - snapshot.navObservedAt.getTime()) / 1_000;
    if (navAgeSeconds > snapshot.maximumNavAgeSeconds) {
      alerts.push({
        code: "NAV_STALE",
        severity: "critical",
        subject: "nav-mirror",
        observedAt: snapshot.observedAt,
        details: { ageSeconds: Math.floor(navAgeSeconds).toString() },
      });
    }
  }

  if (snapshot.expectedConfigurationHash !== snapshot.observedConfigurationHash) {
    alerts.push({
      code: "CONFIGURATION_DRIFT",
      severity: "critical",
      subject: "layerzero-pathway",
      observedAt: snapshot.observedAt,
      details: {
        expected: snapshot.expectedConfigurationHash,
        observed: snapshot.observedConfigurationHash,
      },
    });
  }
  return alerts;
}

function validateSnapshot(snapshot: MonitoringSnapshot): void {
  if (Number.isNaN(snapshot.observedAt.getTime())) throw new Error("CROSSCHAIN_OBSERVED_AT_INVALID");
  if (
    !Number.isSafeInteger(snapshot.maximumDeliveryDelaySeconds) ||
    snapshot.maximumDeliveryDelaySeconds <= 0
  ) {
    throw new Error("CROSSCHAIN_DELIVERY_DELAY_INVALID");
  }
  if (
    snapshot.maximumNavAgeSeconds !== undefined &&
    (!Number.isSafeInteger(snapshot.maximumNavAgeSeconds) || snapshot.maximumNavAgeSeconds <= 0)
  ) {
    throw new Error("CROSSCHAIN_NAV_AGE_INVALID");
  }
}
