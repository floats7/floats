import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { Constituent } from "@/data/types";
import styles from "./ConstituentPager.module.css";

interface ConstituentPagerProps {
  previous: Constituent;
  next: Constituent;
}

export function ConstituentPager({ previous, next }: ConstituentPagerProps) {
  return (
    <nav className={`container ${styles.pager}`} aria-label="Other constituents">
      <Link href={`/holdings/${previous.ticker}`} className={styles.link}>
        <span className={`eyebrow ${styles.label}`}>
          <Icon name="arrow-left" size={12} />
          Previous
        </span>
        <span className={styles.ticker}>{previous.ticker}</span>
      </Link>
      <Link href={`/holdings/${next.ticker}`} className={styles.link} data-align="end">
        <span className={`eyebrow ${styles.label}`}>
          Next
          <Icon name="arrow-right" size={12} />
        </span>
        <span className={styles.ticker}>{next.ticker}</span>
      </Link>
    </nav>
  );
}
