"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { NAV_LINKS } from "@/lib/constants";
import { WalletButton } from "@/features/wallet/WalletButton";
import { MenuOverlay } from "./MenuOverlay";
import { OracleBadge } from "./OracleBadge";
import styles from "./SiteHeader.module.css";

const SCROLL_THRESHOLD = 8;

export function SiteHeader() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => setScrolled(latest > SCROLL_THRESHOLD));

  return (
    <header className={styles.header} data-scrolled={scrolled}>
      <div className={styles.bar}>
        <div className={styles.left}>
          <button type="button" className={styles.menuButton} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" size={20} />
            <span className="visually-hidden">Open menu</span>
          </button>
          <Logo />
        </div>

        <nav className={styles.nav} aria-label="Primary">
          <ul className={styles.links}>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link} aria-current={link.href === pathname ? "page" : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <OracleBadge />
          <WalletButton />
        </div>
      </div>

      <MenuOverlay open={menuOpen} pathname={pathname} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
