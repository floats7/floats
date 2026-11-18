import { readFileSync } from "node:fs";

const environmentPath = process.argv[2];
if (!environmentPath || !/^\.env\.(testnet|mainnet)$/.test(environmentPath)) {
  throw new Error("Usage: validate-options-expiry.ts <.env.testnet|.env.mainnet>");
}

const values = new Map<string, string>();
for (const line of readFileSync(environmentPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1));
}

const rawExpiry = values.get("OPTIONS_CANARY_EXPIRY")?.trim();
if (!rawExpiry || !/^[1-9][0-9]*$/.test(rawExpiry)) {
  throw new Error("OPTIONS_CANARY_EXPIRY must be a positive Unix timestamp");
}

const expirySeconds = Number(rawExpiry);
if (!Number.isSafeInteger(expirySeconds)) throw new Error("OPTIONS_CANARY_EXPIRY is outside the safe integer range");

const expiry = new Date(expirySeconds * 1_000);
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
}).formatToParts(expiry);
const part = (type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((item) => item.type === type)?.value ?? "";

if (part("weekday") !== "Friday" || part("hour") !== "16" || part("minute") !== "00" || part("second") !== "00") {
  throw new Error("OPTIONS_CANARY_EXPIRY must be Friday at 16:00:00 America/New_York");
}

if (expirySeconds <= Math.floor(Date.now() / 1_000) + 86_400) {
  throw new Error("OPTIONS_CANARY_EXPIRY must be more than 24 hours in the future");
}

console.log(`Options expiry is valid: ${expiry.toISOString()} (Friday 16:00 America/New_York).`);
