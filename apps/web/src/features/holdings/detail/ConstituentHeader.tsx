import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Delta } from "@/components/ui/Delta";
import { Reveal } from "@/components/ui/Reveal";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Constituent } from "@/data/types";
import { formatUsd } from "@/lib/format";
import styles from "./ConstituentHeader.module.css";

export function ConstituentHeader({ item }: { item: Constituent }) {
  return (
    <header className={`container ${styles.header}`}>
      <Reveal className={styles.copy}>
        <nav aria-label="Breadcrumb">
          <ol className={styles.crumbs}>
            <li>
              <Link href="/holdings" className={styles.crumb}>
                Holdings
              </Link>
            </li>
            <li className={styles.current} aria-current="page">
              <Icon name="chevron-right" size={12} />
              {item.ticker}
            </li>
          </ol>
        </nav>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{item.ticker}</h1>
          <StatusChip tone="solid">In index</StatusChip>
        </div>
        <p className={styles.name}>{item.name}</p>
      </Reveal>

      <Reveal delay={0.1} className={styles.price}>
        <span className={`${styles.amount} tabular`}>{formatUsd(item.price)}</span>
        <span className={styles.change}>
          <Delta value={item.returnSinceEntry} /> since index entry
        </span>
      </Reveal>
    </header>
  );
}
