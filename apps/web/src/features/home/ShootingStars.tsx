import type { CSSProperties } from "react";
import styles from "./ShootingStars.module.css";

interface Streak {
  top: string;
  left: string;
  /** Direction of travel in degrees; below 90 falls to the right, above 90 falls to the left. */
  angle: number;
  /** Full cycle length. The streak is only visible for a short part of it. */
  period: number;
  delay: number;
}

/** Few and far between: together they average one streak every ten seconds or so. */
const STREAKS: readonly Streak[] = [
  { top: "9%", left: "58%", angle: 32, period: 23, delay: 4 },
  { top: "6%", left: "88%", angle: 148, period: 31, delay: 13 },
  { top: "24%", left: "8%", angle: 38, period: 43, delay: 22 },
];

/** Decorative falling stars behind the hero copy. */
export function ShootingStars() {
  return (
    <div className={styles.sky} aria-hidden="true">
      {STREAKS.map((streak) => (
        <span
          key={streak.left}
          className={styles.streak}
          style={{ top: streak.top, left: streak.left, "--angle": `${streak.angle}deg`, "--period": `${streak.period}s`, "--delay": `${streak.delay}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}
