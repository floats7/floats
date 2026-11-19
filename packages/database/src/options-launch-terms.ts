import { usEquitySession } from "./us-equity-calendar.ts";

export interface LaunchStrike {
  readonly label: "minus-20" | "minus-10" | "atm" | "plus-10" | "plus-20";
  readonly strikeUsd18: bigint;
  readonly cappedCallCapUsd18: bigint;
}

export function buildLaunchStrikes(spotUsd18: bigint): readonly LaunchStrike[] {
  if (spotUsd18 <= 0n) throw new Error("Spot price must be positive");
  return ([
    ["minus-20", 8_000n],
    ["minus-10", 9_000n],
    ["atm", 10_000n],
    ["plus-10", 11_000n],
    ["plus-20", 12_000n],
  ] as const).map(([label, bps]) => {
    const strikeUsd18 = spotUsd18 * bps / 10_000n;
    return { label, strikeUsd18, cappedCallCapUsd18: strikeUsd18 * 15n / 10n };
  });
}

export function expiryAtUsMarketClose(date: string): number {
  const session = usEquitySession(date);
  if (session.state === "closed") throw new Error("Options expiry cannot use a closed market date");
  if (session.state === "early_close") throw new Error("Launch options expiry cannot use an early-close session");
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Expiry date is invalid");
  const target = Date.UTC(year, month - 1, day, 16, 0);
  let result = new Date(target);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(result);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
    result = new Date(result.getTime() + target - represented);
  }
  return Math.floor(result.getTime() / 1_000);
}
