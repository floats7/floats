/** Shared motion tokens so every animation keeps the same rhythm. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.7,
} as const;

export const SPRING = {
  soft: { type: "spring", stiffness: 180, damping: 22 },
  snappy: { type: "spring", stiffness: 420, damping: 32 },
} as const;
