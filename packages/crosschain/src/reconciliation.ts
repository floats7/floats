import type { CrossChainMessage, CrossChainMessageState } from "./message.ts";

export interface MessageReconciliation {
  readonly total: number;
  readonly byState: Readonly<Record<CrossChainMessageState, number>>;
  readonly pendingAmount: bigint;
  readonly deliveredAmount: bigint;
  readonly retryableAmount: bigint;
  readonly failedAmount: bigint;
}

export interface SupplySnapshot {
  readonly canonicalTotalSupply: bigint;
  readonly canonicalAdapterBalance: bigint;
  readonly remoteOftTotalSupply: bigint;
}

export interface SupplyReconciliation extends SupplySnapshot {
  readonly backingSurplus: bigint;
  readonly canonicalCirculatingOutsideAdapter: bigint;
  readonly isBacked: boolean;
  readonly isCanonicalAccountingValid: boolean;
}

export function reconcileMessages(
  messages: readonly CrossChainMessage[],
): MessageReconciliation {
  const byState: Record<CrossChainMessageState, number> = {
    pending: 0,
    delivered: 0,
    retryable: 0,
    failed: 0,
  };
  const amounts: Record<CrossChainMessageState, bigint> = {
    pending: 0n,
    delivered: 0n,
    retryable: 0n,
    failed: 0n,
  };
  const identities = new Set<string>();

  for (const message of messages) {
    const identity = `${message.sourceEid}:${message.guid.toLowerCase()}`;
    if (identities.has(identity)) throw new Error(`CROSSCHAIN_DUPLICATE_MESSAGE:${identity}`);
    identities.add(identity);
    byState[message.state] += 1;
    amounts[message.state] += message.amountLocal;
  }

  return {
    total: messages.length,
    byState,
    pendingAmount: amounts.pending,
    deliveredAmount: amounts.delivered,
    retryableAmount: amounts.retryable,
    failedAmount: amounts.failed,
  };
}

export function reconcileSupply(snapshot: SupplySnapshot): SupplyReconciliation {
  if (
    snapshot.canonicalTotalSupply < 0n ||
    snapshot.canonicalAdapterBalance < 0n ||
    snapshot.remoteOftTotalSupply < 0n
  ) {
    throw new Error("CROSSCHAIN_SUPPLY_NEGATIVE");
  }

  const isCanonicalAccountingValid =
    snapshot.canonicalAdapterBalance <= snapshot.canonicalTotalSupply;
  const canonicalCirculatingOutsideAdapter = isCanonicalAccountingValid
    ? snapshot.canonicalTotalSupply - snapshot.canonicalAdapterBalance
    : 0n;
  const backingSurplus = snapshot.canonicalAdapterBalance - snapshot.remoteOftTotalSupply;

  return {
    ...snapshot,
    backingSurplus,
    canonicalCirculatingOutsideAdapter,
    isBacked: isCanonicalAccountingValid && backingSurplus >= 0n,
    isCanonicalAccountingValid,
  };
}
