import Image from "next/image";
import Link from "next/link";
import styles from "./Logo.module.css";

const MARK_SIZE = 40;

export function Logo() {
  return (
    <Link href="/" className={styles.logo} aria-label="Floatss home">
      <Image src="/brand/floats-logo.png" alt="" width={MARK_SIZE} height={MARK_SIZE} className={styles.mark} priority />
      <span className={styles.word}>Floatss</span>
    </Link>
  );
}
