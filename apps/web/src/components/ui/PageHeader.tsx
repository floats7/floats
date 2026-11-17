import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  description: string;
  aside?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className={`container ${styles.header}`}>
      <Reveal className={styles.copy}>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
      </Reveal>
      {aside && <Reveal delay={0.1}>{aside}</Reveal>}
    </header>
  );
}
