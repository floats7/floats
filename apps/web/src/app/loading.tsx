import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./state.module.css";

/** Shown while a route segment streams in. */
export default function Loading() {
  return (
    <div className={`container ${styles.page}`} role="status" aria-label="Loading page">
      <Skeleton width="10rem" height="0.9rem" />
      <Skeleton width="min(100%, 28rem)" height="4rem" />
      <Skeleton width="min(100%, 36rem)" height="1.25rem" />
      <Skeleton height="16rem" />
    </div>
  );
}
