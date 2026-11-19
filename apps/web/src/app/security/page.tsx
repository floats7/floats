import type { Metadata } from "next";
import Link from "next/link";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Security",
  description: "Floats wallet safety, official contract information and responsible disclosure policy.",
};

const FLOATS_CA = "0x50187d5b6fdd6d39e89f30a161d77a6956fef437";

export default function SecurityPage() {
  return (
    <section className={`container ${styles.page}`}>
      <header className={styles.header}>
        <p className="eyebrow">Security</p>
        <h1 className={styles.title}>Verify before you sign.</h1>
        <p className={styles.lead}>Floats is non-custodial. Your wallet remains under your control and every onchain action requires confirmation in your wallet.</p>
      </header>

      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Floats will never ask for</h2>
          <ul>
            <li>Your seed phrase or recovery phrase</li>
            <li>Your private key or wallet password</li>
            <li>Remote access to your device</li>
            <li>A transfer to “verify” or “unlock” an account</li>
          </ul>
        </article>
        <article className={styles.card}>
          <h2>Wallet signatures</h2>
          <p>Connecting a wallet only shares its public address. The optional portfolio signature proves ownership for private records, expires after five minutes, and cannot approve or transfer tokens.</p>
        </article>
        <article className={styles.card}>
          <h2>Official Floats contract</h2>
          <p className={styles.address}>{FLOATS_CA}</p>
          <p>Always compare the complete address before interacting. Public protocol contracts are listed on the <Link className={styles.link} href="/methodology">Methodology page</Link>.</p>
        </article>
        <article className={styles.card}>
          <h2>Responsible disclosure</h2>
          <p>Security researchers can report a suspected vulnerability to <a className={styles.link} href="mailto:security@floats.trade">security@floats.trade</a>. Include reproduction steps and avoid exposing user data or funds.</p>
        </article>
      </div>
    </section>
  );
}
