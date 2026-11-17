import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import styles from "./restricted.module.css";

export const metadata: Metadata = { title: "Unavailable in your region" };

export default function RestrictedPage() {
  return (
    <section className={`container ${styles.page}`}>
      <p className="eyebrow">Region restricted</p>
      <h1 className={styles.title}>Floatss is not available where you are.</h1>
      <p className={styles.body}>
        Stock Tokens cannot be offered in your jurisdiction, so access to minting and redeeming is blocked. You can still read how the index works.
      </p>
      <LinkButton href="/methodology" variant="outline">
        Read the methodology
      </LinkButton>
    </section>
  );
}
