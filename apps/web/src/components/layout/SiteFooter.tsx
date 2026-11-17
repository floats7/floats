import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { DISCLAIMER, NAV_LINKS } from "@/lib/constants";
import styles from "./SiteFooter.module.css";

const COLUMNS = [
  { title: "Products", paths: ["/holdings", "/trade", "/portfolio"] },
  { title: "Protocol", paths: ["/", "/pipeline", "/methodology"] },
] as const;

export function SiteFooter() {
  return (
    <footer className={styles.footer} data-tone="paper">
      <div className={styles.cta}>
        <span className={styles.chip}>Start holding</span>
        <h2 className={styles.title}>
          Ready to hold <br />
          the next wave
        </h2>
        <LinkButton href="/trade" variant="dark">
          Mint fIPO
        </LinkButton>
      </div>

      <div className={styles.columns}>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className={styles.heading}>{column.title}</p>
            <ul>
              {NAV_LINKS.filter((link) => (column.paths as readonly string[]).includes(link.href)).map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <p className={styles.network}>Deployed on Robinhood Chain</p>
      </div>

      <div className={styles.legal}>
        <p>&copy; 2026 Floatss. All rights reserved.</p>
        <p className={styles.disclaimer}>{DISCLAIMER} Not available in restricted jurisdictions.</p>
      </div>

      <p className={styles.wordmark} aria-hidden="true">
        Floatss
      </p>
    </footer>
  );
}
