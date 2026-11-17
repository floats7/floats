interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
const windows = new Map<string, WindowState>();

/** Per-instance abuse guard. A distributed deployment edge remains the authoritative production limit. */
export function takeRateLimit(key: string, limit: number, now = Date.now()): RateLimitResult {
  if (!key || !Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid rate-limit input");
  prune(now);

  const existing = windows.get(key);
  const state = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + WINDOW_MS }
    : { count: existing.count + 1, resetAt: existing.resetAt };
  windows.set(key, state);

  return {
    allowed: state.count <= limit,
    remaining: Math.max(0, limit - state.count),
    resetAt: state.resetAt,
  };
}

function prune(now: number): void {
  if (windows.size < MAX_KEYS) return;
  for (const [key, state] of windows) {
    if (state.resetAt <= now) windows.delete(key);
  }
  if (windows.size >= MAX_KEYS) {
    const oldestKey = windows.keys().next().value as string | undefined;
    if (oldestKey) windows.delete(oldestKey);
  }
}
