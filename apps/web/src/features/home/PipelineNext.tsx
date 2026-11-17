import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { PIPELINE } from "@/data/pipeline";
import { formatDate } from "@/lib/format";
import styles from "./PipelineNext.module.css";

const COUNT = 3;

export function PipelineNext() {
  return (
    <div className={styles.block}>
      <h3 className={styles.title}>Next in line</h3>
      <ul className={styles.list}>
        {PIPELINE.slice(0, COUNT).map((item) => (
          <li key={item.id}>
            <Link href={`/pipeline/${item.id}`} className={styles.row}>
              <span className={styles.name}>{item.name}</span>
              <StatusChip tone="muted">{item.status}</StatusChip>
              <span className={`${styles.date} tabular`}>Enters {formatDate(item.entryDate)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/pipeline" className={styles.more}>
        Full pipeline <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}
