"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

interface RevealProps extends HTMLMotionProps<"div"> {
  delay?: number;
  offset?: number;
}

/** Fades content up once, the first time it scrolls into view. */
export function Reveal({ delay = 0, offset = 24, children, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
