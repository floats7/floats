"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import type { CSSProperties } from "react";
import { CONSTITUENTS } from "@/data/constituents";
import { RULES } from "@/data/methodology";
import styles from "./OrbitScene.module.css";

const CX = 150;
const CY = 1020;
const RING_RADII = [370, 480, 600, 740, 900, 1080] as const;
const BASE_PERIOD_S = 90;
const LABEL_ANGLE = (-78 * Math.PI) / 180;

/** Outlying parts of the system, revealed as the camera pulls back. */
const FAR_OBJECTS = [
  { label: "Vault", x: 860, y: 300, appear: 0.24 },
  { label: "Oracle", x: 1180, y: 170, appear: 0.3 },
  { label: "Registry", x: 1330, y: 430, appear: 0.36 },
  { label: "Keeper", x: 720, y: 110, appear: 0.42 },
  { label: "Timelock", x: 1040, y: 600, appear: 0.48 },
  { label: "DEX pool", x: 1450, y: 640, appear: 0.54 },
] as const;

const TRAJECTORIES = [
  "M 480 640 C 600 480, 760 420, 860 300",
  "M 860 300 C 960 230, 1060 190, 1180 170",
  "M 560 520 C 760 560, 940 600, 1040 600",
  "M 1040 600 C 1200 560, 1280 500, 1330 430",
] as const;

interface OrbitSceneProps {
  /** Overall scroll progress through the pinned section, 0 to 1. */
  progress: MotionValue<number>;
  /** Index of the ring to highlight, or null when no rule is being explained. */
  activeRing: number | null;
}

function FarObject({ label, x, y, appear, progress }: (typeof FAR_OBJECTS)[number] & { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [appear, appear + 0.08], [0, 1]);
  return (
    <motion.g style={{ opacity }} transform={`translate(${x} ${y})`}>
      <rect x="-5" y="-5" width="10" height="10" className={styles.marker} />
      <text x="16" y="4" className={styles.label}>
        {label}
      </text>
    </motion.g>
  );
}

function Trajectory({ d, index, progress }: { d: string; index: number; progress: MotionValue<number> }) {
  const start = 0.2 + index * 0.08;
  const pathLength = useTransform(progress, [start, start + 0.14], [0, 1]);
  return <motion.path d={d} className={styles.trajectory} style={{ pathLength }} />;
}

/** The index drawn as an orbital system: a planet of rings with constituents in orbit, pulling back as you scroll. */
export function OrbitScene({ progress, activeRing }: OrbitSceneProps) {
  const scale = useTransform(progress, [0, 0.55, 1], [1.12, 0.82, 0.64]);
  const outerOpacity = useTransform(progress, [0.1, 0.3], [0, 1]);

  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMinYMax slice" className={styles.scene} aria-hidden="true">
      <defs>
        <radialGradient id="planet-limb" cx={CX} cy={CY} r="330" gradientUnits="userSpaceOnUse">
          <stop offset="0.86" stopColor="#000" />
          <stop offset="0.97" stopColor="#8d9199" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.9" />
        </radialGradient>
        <filter id="planet-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <motion.g style={{ scale, transformOrigin: `${CX}px ${CY}px`, transformBox: "view-box" }}>
        {[560, 490, 420].map((radius, index) => (
          <circle key={radius} cx={CX} cy={CY} r={radius} fill="#fff" opacity={0.025 + index * 0.025} />
        ))}
        <circle cx={CX} cy={CY} r="318" fill="none" stroke="#fff" strokeWidth="6" opacity="0.5" filter="url(#planet-glow)" />
        <circle cx={CX} cy={CY} r="330" fill="url(#planet-limb)" />
        <circle cx={CX} cy={CY} r="300" fill="#000" />

        {RULES.map((rule, ring) => {
          const radius = RING_RADII[ring] ?? 0;
          return (
            <g key={rule.title} data-active={ring === activeRing} className={styles.ring}>
              <circle cx={CX} cy={CY} r={radius} className={styles.track} />
              <text x={CX + radius * Math.cos(LABEL_ANGLE)} y={CY + radius * Math.sin(LABEL_ANGLE) - 10} className={styles.ringLabel}>
                {rule.title}
              </text>
            </g>
          );
        })}

        {CONSTITUENTS.map((item, index) => {
          const ring = index % RING_RADII.length;
          const style = {
            "--period": `${BASE_PERIOD_S + ring * 22}s`,
            "--start": `${(index / CONSTITUENTS.length) * 360 + ring * 11}deg`,
            "--cx": `${CX}px`,
            "--cy": `${CY}px`,
          } as CSSProperties;
          return (
            <g key={item.ticker} className={styles.orbit} style={style}>
              <g transform={`translate(${CX + (RING_RADII[ring] ?? 0)} ${CY})`}>
                <g className={styles.counter}>
                  <rect x="-5" y="-5" width="10" height="10" className={styles.node} />
                  <text x="14" y="4" className={styles.nodeLabel}>
                    {item.ticker}
                  </text>
                </g>
              </g>
            </g>
          );
        })}

        <motion.g style={{ opacity: outerOpacity }}>
          {TRAJECTORIES.map((d, index) => (
            <Trajectory key={d} d={d} index={index} progress={progress} />
          ))}
          {FAR_OBJECTS.map((object) => (
            <FarObject key={object.label} {...object} progress={progress} />
          ))}
        </motion.g>
      </motion.g>
    </svg>
  );
}
