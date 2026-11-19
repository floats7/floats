import { readFileSync } from "node:fs";
import { parseMarketCandidates } from "./lib/market-candidate-input.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error("Usage: validate-market-candidates.ts <candidate-file> [...candidate-files]");
}

let count = 0;
for (const path of paths) {
  const candidates = parseMarketCandidates(JSON.parse(readFileSync(path, "utf8")) as unknown);
  count += candidates.length;
  console.log(`Validated ${candidates.length} candidate record(s) in ${path}.`);
}
console.log(`Validated ${count} candidate record(s); no external state was changed.`);
