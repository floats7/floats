import { LinkButton } from "@/components/ui/Button";
import styles from "./restricted/restricted.module.css";

export default function NotFound() {
  return (
    <section className={`container ${styles.page}`}>
      <p className="eyebrow">404</p>
      <h1 className={styles.title}>This page drifted away.</h1>
      <p className={styles.body}>The page you are looking for does not exist or has moved.</p>
      <LinkButton href="/">Back to the index</LinkButton>
    </section>
  );
}
