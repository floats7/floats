import styles from "./SiteBackdrop.module.css";

/** Fixed starfield behind every page. Decorative, compositor-only motion, no pointer events. */
export function SiteBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <span className={`${styles.stars} ${styles.near}`} />
      <span className={`${styles.stars} ${styles.far}`} />
      <span className={styles.grain} />
    </div>
  );
}
