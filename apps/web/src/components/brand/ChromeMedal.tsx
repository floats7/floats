"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import { Separator } from "@/components/ui/Icon";
import { SPRING } from "@/lib/motion";
import styles from "./ChromeMedal.module.css";

const MAX_TILT_DEGREES = 14;

/** Floatsing chrome medallion that tilts toward the pointer. */
export function ChromeMedal() {
  const reducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-1, 1], [-MAX_TILT_DEGREES, MAX_TILT_DEGREES]), SPRING.soft);
  const rotateX = useSpring(useTransform(pointerY, [-1, 1], [MAX_TILT_DEGREES, -MAX_TILT_DEGREES]), SPRING.soft);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1);
    pointerY.set(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  };

  const resetTilt = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <div className={styles.stage} onPointerMove={handlePointerMove} onPointerLeave={resetTilt} aria-hidden="true">
      <motion.div
        className={styles.floats}
        animate={reducedMotion ? undefined : { y: [0, -14, 0] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
      >
        <motion.div className={styles.medal} style={{ rotateX, rotateY }}>
          <div className={styles.rim} />
          <div className={styles.face}>
            <span className={styles.mark}>fIPO</span>
            <span className={styles.caption}>Index <Separator /> Robinhood Chain</span>
          </div>
          <div className={styles.glint} />
        </motion.div>
      </motion.div>
      <div className={styles.shadow} />
    </div>
  );
}
