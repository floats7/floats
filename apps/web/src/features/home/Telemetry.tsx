"use client";

import { HudSection } from "@/components/ui/HudSection";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { FEES, INDEX_STATS } from "@/data/index-stats";
import { useOracleStatus } from "@/hooks/useOracleStatus";
import { formatPercent, formatUsdCompact } from "@/lib/format";
import styles from "./Telemetry.module.css";

const ORACLE_LABEL = { live: "Live", "off-hours": "Off-hours", stale: "Stale" } as const;

export function Telemetry() {
  const oracle = useOracleStatus();

  const readings = [
    { label: "Price oracle", value: oracle ? ORACLE_LABEL[oracle] : "Checking", live: oracle === "live" },
    { label: "Slippage limit", value: formatPercent(FEES.maxSlippage) },
    { label: "Timelock", value: "5 minutes" },
    { label: "Management fee", value: `${formatPercent(FEES.managementRate)} / yr` },
    { label: "TVL cap", value: formatUsdCompact(INDEX_STATS.tvlCap) },
    { label: "Rebalance", value: "Quarterly" },
  ];

  return (
    <HudSection index="006" title="Under the hood" meta="Guardrails / Live">
      <Reveal className={styles.giant}>
        <h2 className={styles.name}>fIPO</h2>
      </Reveal>

      <div className={styles.layout}>
        <Reveal className={styles.copy}>
          <p className={styles.lead}>Built to be checked, not trusted.</p>
          <p className={styles.body}>
            Every limit that protects the index is a published parameter. Prices pause cash flows when stale, changes wait out a timelock, and trades revert past the slippage limit.
          </p>
          <div className={styles.actions}>
            <LinkButton href="/trade">Mint fIPO</LinkButton>
            <LinkButton href="/methodology" variant="outline">
              Read the rules
            </LinkButton>
          </div>
        </Reveal>

        <dl className={styles.grid}>
          {readings.map((reading, index) => (
            <Reveal key={reading.label} delay={index * 0.05} className={styles.cell}>
              <dt className="eyebrow">{reading.label}</dt>
              <dd className={`${styles.value} tabular`} data-live={reading.live ?? false}>
                {reading.value}
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </HudSection>
  );
}
