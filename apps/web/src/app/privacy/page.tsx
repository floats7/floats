import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = { title: "Privacy", description: "Floats privacy policy." };

export default function PrivacyPage() {
  return (
    <section className={`container ${styles.page}`}>
      <header className={styles.header}>
        <p className="eyebrow">Privacy</p>
        <h1 className={styles.title}>Privacy by design.</h1>
        <p className={styles.lead}>Floats uses public blockchain data and the minimum information needed to operate the application.</p>
      </header>
      <article className={styles.section}>
        <h2>Wallet information</h2>
        <p>When you connect a wallet, the application processes its public address, selected network and public onchain activity. Floats never requests or stores seed phrases, private keys or wallet passwords.</p>
      </article>
      <article className={styles.section}>
        <h2>Read-only verification</h2>
        <p>An optional signature can be used to prove wallet ownership before private portfolio records are returned. The challenge is bound to the requesting domain, contains a one-time nonce and expires after five minutes.</p>
      </article>
      <article className={styles.section}>
        <h2>Infrastructure data</h2>
        <p>Hosting and security providers may process standard technical information such as request timestamps, IP addresses, browser details and error logs to deliver and protect the service.</p>
      </article>
      <article className={styles.section}>
        <h2>Contact</h2>
        <p>Privacy questions can be sent to <a className={styles.link} href="mailto:privacy@floats.trade">privacy@floats.trade</a>.</p>
      </article>
    </section>
  );
}
