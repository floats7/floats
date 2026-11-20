"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { XLink } from "@/components/brand/XLink";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { FUSD_NAV_LINK, NAV_LINKS, type NavLink } from "@/lib/constants";
import { floatApi } from "@/lib/api-client";
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
  const [links, setLinks] = useState<readonly NavLink[]>(NAV_LINKS);

  useEffect(() => {
    const controller = new AbortController();
    void floatApi.getPublicConfig(controller.signal).then((config) => {
      if (config.fusdVaultAddress && !controller.signal.aborted) {
        setLinks([...NAV_LINKS.slice(0, 3), FUSD_NAV_LINK, ...NAV_LINKS.slice(3)]);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

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
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link} aria-current={link.href === pathname ? "page" : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <XLink />
          <OracleBadge />
          <WalletButton />
        </div>
      </div>

      <MenuOverlay links={links} open={menuOpen} pathname={pathname} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
