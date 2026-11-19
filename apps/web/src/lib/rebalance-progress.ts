import type { OperationalActionDto } from "./api-client";

export function deriveRebalanceProgress(actions: readonly OperationalActionDto[]): { readonly authorized: number; readonly executed: number } {
  const authorized = new Set<string>();
  const executed = new Set<string>();
  const cancelled = new Set<string>();
  for (const action of actions) {
    const hash = typeof action.payload.instructionHash === "string" ? action.payload.instructionHash.toLowerCase() : null;
    if (!hash) continue;
    const event = action.action.toLowerCase();
    if (event === "instructionauthorized") authorized.add(hash);
    if (event === "instructionexecuted") executed.add(hash);
    if (event === "instructioncancelled") cancelled.add(hash);
  }
  for (const hash of cancelled) authorized.delete(hash);
  return { authorized: authorized.size, executed: [...executed].filter((hash) => authorized.has(hash)).length };
}
