"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { NAV_LINKS } from "@/lib/constants";
import { Icon } from "@/components/ui/Icon";
import styles from "./MenuOverlay.module.css";

const CLOSE_ANIMATION_MS = 260;

interface MenuOverlayProps {
  open: boolean;
  pathname: string;
  onClose: () => void;
}

/** Full-screen navigation on the native dialog element: focus trap and Escape come built in. */
export function MenuOverlay({ open, pathname, onClose }: MenuOverlayProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      delete dialog.dataset.closing;
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;

    dialog.dataset.closing = "true";
    const timer = window.setTimeout(() => dialog.close(), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.overlay}
      aria-label="Site navigation"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.bar}>
        <button type="button" className={styles.close} onClick={onClose}>
          <Icon name="close" size={18} />
          <span>Close</span>
        </button>
      </div>

      <nav className={`container ${styles.nav}`} aria-label="Primary">
        <ol className={styles.list}>
          {NAV_LINKS.map((link, index) => (
            <li key={link.href} className={styles.item} style={{ "--index": index } as React.CSSProperties}>
              <Link href={link.href} className={styles.link} aria-current={link.href === pathname ? "page" : undefined} onClick={onClose}>
                <span className={`${styles.number} tabular`}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.label}>{link.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </dialog>
  );
}
