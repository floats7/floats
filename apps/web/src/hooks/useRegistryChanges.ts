"use client";

import { useCallback, useEffect, useState } from "react";
import type { RegistryChange } from "@/data/types";
import { floatApi, type RegistryChangeDto } from "@/lib/api-client";

interface RegistryChangesState {
  readonly changes: readonly RegistryChange[];
  readonly loading: boolean;
  readonly error: boolean;
  readonly retry: () => void;
}

export function useRegistryChanges(): RegistryChangesState {
  const [changes, setChanges] = useState<readonly RegistryChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    Promise.all([
      floatApi.getRegistryChanges(50, controller.signal),
      floatApi.getPublicConfig(controller.signal),
    ])
      .then(([rows, config]) => setChanges(rows.map((row) => toRegistryChange(row, config.blockExplorerUrl))))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  return { changes, loading, error, retry };
}

function toRegistryChange(row: RegistryChangeDto, blockExplorerUrl: string): RegistryChange {
  const kind = row.change_kind === "constituent_configured"
    ? "add"
    : row.change_kind === "constituent_removed"
      ? "remove"
      : "weights";
  const subject = shortAddress(row.token_address ?? row.configuration_hash);
  const version = row.registry_version === null ? "" : ` · version ${row.registry_version}`;
  return {
    id: `${row.transaction_hash}:${row.log_index}`,
    date: row.observed_at.slice(0, 10),
    kind,
    title: titleFor(row.change_kind, subject),
    detail: `Confirmed onchain${version}.`,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
    registryVersion: row.registry_version,
    explorerUrl: `${blockExplorerUrl.replace(/\/$/, "")}/tx/${row.transaction_hash}`,
  };
}

function titleFor(kind: RegistryChangeDto["change_kind"], subject: string): string {
  switch (kind) {
    case "constituent_configured": return `${subject} configured`;
    case "constituent_removed": return `${subject} removed`;
    case "configuration_proposed": return `Configuration ${subject} proposed`;
    case "configuration_cancelled": return `Configuration ${subject} cancelled`;
    case "configuration_executed": return `Configuration ${subject} executed`;
  }
}

function shortAddress(value: string | null): string {
  if (!value) return "Index";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
