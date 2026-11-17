import { RULES } from "@/data/methodology";

export interface NarrativeStep {
  id: string;
  eyebrow: string;
  headline: string;
  sub?: string;
  list?: readonly string[];
  compare?: { small: string; big: string };
  /** Two-line context readout shown at the top right while the step is active. */
  hud: readonly [string, string];
  /** Index into RULES when the step explains one rule, which also lights the rule bar. */
  rule?: number;
}

const RULE_HUD: readonly (readonly [string, string])[] = [
  ["Universe", "New listings / US exchanges"],
  ["Entry", "Day five / Eligibility checks"],
  ["Exit", "24 months / Safety exits"],
  ["Weights", "Market cap / Per-name cap"],
  ["Rebalance", "Quarterly / Drift limits"],
  ["Oracle", "Chainlink / Stale-price pause"],
];

const INTRO_STEPS: readonly NarrativeStep[] = [
  {
    id: "why",
    eyebrow: "Why we exist",
    headline: "Floats exists to put every new listing within reach.",
    sub: "Today, a new listing is one stock at a time.",
    compare: { small: "One listing", big: "The whole class" },
    hud: ["The new listing class", "Today"],
  },
  {
    id: "ideas",
    eyebrow: "Today",
    headline: "Focused on three foundational ideas.",
    sub: "Everything that follows grows from these three.",
    list: ["One token", "Rules, not discretion", "Settled onchain"],
    hud: ["Three ideas", "One index"],
  },
  {
    id: "class",
    eyebrow: "Why it matters",
    headline: "A class of companies that outgrows any single stock.",
    sub: "Fresh issues, from first trade to exit, held together by one rulebook.",
    compare: { small: "One listing", big: "The whole class" },
    hud: ["The listing class", "Potential"],
  },
  {
    id: "goal",
    eyebrow: "Our goal",
    headline: "Make holding new listings routine.",
    sub: "Three things have to be true first, in this order.",
    list: ["A transparent rulebook", "Infrastructure that checks itself", "Access without friction"],
    hud: ["Full rulebook", "Self-checking"],
  },
];

const RULE_STEPS: readonly NarrativeStep[] = RULES.map((rule, index) => ({
  id: `rule-${rule.title.toLowerCase()}`,
  eyebrow: `Rule ${String(index + 1).padStart(2, "0")}`,
  headline: rule.headline,
  sub: rule.body,
  hud: RULE_HUD[index] ?? ["", ""],
  rule: index,
}));

export const STEPS: readonly NarrativeStep[] = [...INTRO_STEPS, ...RULE_STEPS];

/** Scroll distance of one step, in viewport heights. */
export const STEP_VIEWPORTS = 0.9;
