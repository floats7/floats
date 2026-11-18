"use client";

import { formatUnits } from "@/lib/units";
import styles from "./BalanceShortcuts.module.css";

const PERCENTAGES = [25, 50, 100] as const;

export function BalanceShortcuts({ balance, decimals, onSelect }: { readonly balance?: bigint; readonly decimals: number; readonly onSelect: (value: string) => void }) {
  if (balance === undefined) return null;
  return (
    <div className={styles.shortcuts} aria-label="Balance shortcuts">
      {PERCENTAGES.map((percentage) => (
        <button key={percentage} type="button" disabled={balance === 0n} onClick={() => onSelect(toInputValue(balance * BigInt(percentage) / 100n, decimals))}>
          {percentage}%
        </button>
      ))}
    </div>
  );
}

function toInputValue(value: bigint, decimals: number): string {
  return formatUnits(value.toString(), decimals, decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
