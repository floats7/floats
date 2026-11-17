"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChromeMedal } from "@/components/brand/ChromeMedal";
import styles from "./HeroStage.module.css";

/** three.js is heavy, so it loads only on the client and only when needed. */
const HeroScene = dynamic(() => import("./hero3d/HeroScene"), { ssr: false });

let webglSupport: boolean | null = null;

function detectWebGL(): boolean {
  webglSupport ??= (() => {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
    } catch {
      return false;
    }
  })();
  return webglSupport;
}

const subscribeNever = () => () => {};

/** Full-bleed 3D backdrop for the hero. Falls back to a CSS medallion without WebGL. */
export function HeroStage() {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const webgl = useSyncExternalStore(subscribeNever, detectWebGL, () => null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.stage}>
      {webgl === true && <HeroScene active={visible && !reducedMotion} animate={!reducedMotion} />}
      {webgl === false && (
        <div className={styles.fallback}>
          <ChromeMedal />
        </div>
      )}
    </div>
  );
}
