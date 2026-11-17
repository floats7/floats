import styles from "./CompareCircles.module.css";

interface CompareCirclesProps {
  small: string;
  big: string;
}

/** Two circles of very different size: one thing against the whole class it belongs to. */
export function CompareCircles({ small, big }: CompareCirclesProps) {
  return (
    <div className={styles.compare}>
      <figure className={styles.item}>
        <span className={styles.small} />
        <figcaption>{small}</figcaption>
      </figure>
      <figure className={styles.item}>
        <span className={styles.big}>
          <span className={styles.ring} />
          <span className={`${styles.ring} ${styles.inner}`} />
        </span>
        <figcaption>{big}</figcaption>
      </figure>
    </div>
  );
}
