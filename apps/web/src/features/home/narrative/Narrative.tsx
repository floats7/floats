"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { HudSection } from "@/components/ui/HudSection";
import { RULES } from "@/data/methodology";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { OrbitScene } from "./OrbitScene";
import { RuleBar } from "./RuleBar";
import { StepCopy } from "./StepCopy";
import { STEPS, STEP_VIEWPORTS } from "./steps";
import styles from "./Narrative.module.css";

const FIRST_RULE_STEP = STEPS.findIndex((step) => step.rule !== undefined);
const LIST_SLOTS = 3;

/**
 * Pinned, scroll-driven story. One tall track keeps a full-screen stage fixed while
 * the orbit scene pulls back and the copy, context readout and rule bar change with each step.
 */
export function Narrative() {
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const ruleProgress = useTransform(scrollYProgress, (value) => Math.min(1, Math.max(0, (value * STEPS.length - FIRST_RULE_STEP) / (STEPS.length - FIRST_RULE_STEP))));

  const [stepIndex, setStepIndex] = useState(0);
  const [activeItem, setActiveItem] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const scaled = value * STEPS.length;
    const index = Math.min(STEPS.length - 1, Math.floor(scaled));
    setStepIndex(index);
    setActiveItem(Math.min(LIST_SLOTS - 1, Math.floor((scaled - index) * LIST_SLOTS)));
  });

  const jumpToRule = (rule: number) => {
    const top = (track.current?.offsetTop ?? 0) + (FIRST_RULE_STEP + rule + 0.05) * STEP_VIEWPORTS * window.innerHeight;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const step = STEPS[stepIndex] ?? STEPS[0]!;

  return (
    <HudSection index="002" title="A rule-based index" meta="" flush>
      <div ref={track} className={styles.track} style={{ "--steps": STEPS.length, "--step": STEP_VIEWPORTS } as React.CSSProperties}>
        <div className={styles.stage}>
          <OrbitScene progress={scrollYProgress} activeRing={step.rule ?? null} />

          <div className={styles.meta} aria-hidden="true">
            <AnimatePresence mode="wait">
              <motion.p
                key={step.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: DURATION.fast } }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
              >
                <span>{step.hud[0]}</span>
                <span>{step.hud[1]}</span>
              </motion.p>
            </AnimatePresence>
          </div>

          <div className={styles.copy}>
            <AnimatePresence mode="wait">
              <StepCopy key={step.id} step={step} activeItem={activeItem} />
            </AnimatePresence>
          </div>

          <div className={styles.foot}>
            <p className={styles.scale}>Orbits not to scale</p>
            <AnimatePresence>
              {step.rule !== undefined && <RuleBar key="bar" activeRule={step.rule} ruleProgress={ruleProgress} onJump={jumpToRule} />}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ol className="visually-hidden">
        {STEPS.map((item) => (
          <li key={item.id}>
            {item.headline} {item.sub}
          </li>
        ))}
        {RULES.map((rule) => (
          <li key={rule.title}>{rule.body}</li>
        ))}
      </ol>
    </HudSection>
  );
}
