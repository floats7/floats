"use client";

import { Button } from "@/components/ui/Button";
import styles from "./state.module.css";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Route-level error boundary with a retry that re-renders the segment. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <section className={`container ${styles.page}`} role="alert">
      <p className="eyebrow">Something broke</p>
      <h1 className={styles.title}>We could not load this page.</h1>
      <p className={styles.body}>Nothing was lost. Try again, and if it keeps happening, come back in a few minutes.</p>
      {error.digest && <p className={`${styles.digest} tabular`}>Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
