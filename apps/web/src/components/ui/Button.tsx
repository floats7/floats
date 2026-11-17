import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "chrome" | "outline" | "dark";

interface BaseProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

type LinkButtonProps = BaseProps & { href: string };
type ActionButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

function classNames(variant: Variant, className?: string) {
  return `${styles.button} ${styles[variant]} ${className ?? ""}`;
}

export function LinkButton({ href, variant = "chrome", className, children }: LinkButtonProps) {
  return (
    <Link href={href} className={classNames(variant, className)}>
      <span className={styles.label}>{children}</span>
    </Link>
  );
}

export function Button({ variant = "chrome", className, loading = false, disabled, children, ...rest }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={classNames(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
