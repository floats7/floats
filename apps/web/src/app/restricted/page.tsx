import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import styles from "./restricted.module.css";

export const metadata: Metadata = { title: "Unavailable in your region" };

export default function RestrictedPage() {
  return (
    <section className={`container ${styles.page}`}>
      <p className="eyebrow">Region restricted</p>
      <h1 className={styles.title}>Floats is not available where you are.</h1>
      <p className={styles.body}>
        Transactional access is unavailable in your jurisdiction. You can still review the methodology, risks, and public onchain record.
      </p>
      <LinkButton href="/methodology" variant="outline">
        Read the methodology
      </LinkButton>
    </section>
  );
}
