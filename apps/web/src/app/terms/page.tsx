import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = { title: "Terms of Use", description: "Floats terms of use and protocol risk disclosures." };

export default function TermsPage() {
  return (
    <section className={`container ${styles.page}`}>
      <header className={styles.header}>
        <p className="eyebrow">Terms of Use</p>
        <h1 className={styles.title}>Use the protocol responsibly.</h1>
        <p className={styles.lead}>By accessing Floats, you acknowledge the technical, market and regulatory risks of interacting with blockchain-based financial products.</p>
      </header>
      <article className={styles.section}>
        <h2>Non-custodial software</h2>
        <p>Floats provides an interface to public smart contracts. Floats does not control your wallet, hold your private keys or guarantee that a submitted transaction will execute at an expected price.</p>
      </article>
      <article className={styles.section}>
        <h2>Product and market risk</h2>
        <p>Digital assets, Stock Tokens, index vaults, options and cross-chain messaging can lose value or become unavailable. Quotes, oracle data and market information may be delayed, incomplete or interrupted.</p>
      </article>
      <article className={styles.section}>
        <h2>Eligibility</h2>
        <p>You are responsible for determining whether access and transactions are lawful in your jurisdiction. Floats is not available in restricted jurisdictions.</p>
      </article>
      <article className={styles.section}>
        <h2>Third-party systems</h2>
        <p>Wallets, RPC providers, block explorers, token issuers, bridges and other third-party services operate under their own terms and may fail independently of Floats.</p>
      </article>
      <article className={styles.section}>
        <h2>No affiliation</h2>
        <p>Floats is an independent project and is not affiliated with or endorsed by Robinhood or the companies represented by market data and logos in the application.</p>
      </article>
    </section>
  );
}
