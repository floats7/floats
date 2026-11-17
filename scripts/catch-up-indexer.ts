import { createIndexerCycle, createProtocolIndexer } from "../services/indexer/src/bootstrap.ts";

function requireMaximumCycles(environment: NodeJS.ProcessEnv): number {
  const raw = environment.INDEXER_MAX_CATCH_UP_CYCLES?.trim() ?? "100";
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error("INDEXER_MAX_CATCH_UP_CYCLES is invalid");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 10_000) {
    throw new Error("INDEXER_MAX_CATCH_UP_CYCLES must be at most 10000");
  }
  return value;
}

const maximumCycles = requireMaximumCycles(process.env);
const batchSize = BigInt(process.env.INDEXER_BATCH_SIZE ?? "0");
if (batchSize <= 0n) throw new Error("INDEXER_BATCH_SIZE is invalid");
const indexer = createProtocolIndexer(process.env);
let synchronized = false;

for (let cycle = 1; cycle <= maximumCycles; cycle += 1) {
  const result = await indexer.runOnce();
  console.log(
    JSON.stringify({
      cycle,
      status: result.status,
      fromBlock: result.fromBlock?.toString(),
      toBlock: result.toBlock?.toString(),
      eventCount: result.eventCount,
    }),
  );
  if (result.status === "idle") {
    synchronized = true;
    break;
  }
  if (
    result.status === "indexed" &&
    result.fromBlock !== undefined &&
    result.toBlock !== undefined &&
    result.toBlock - result.fromBlock + 1n < batchSize
  ) {
    synchronized = true;
    break;
  }
}

if (!synchronized) throw new Error("Indexer did not catch up within the configured cycle limit");

const snapshotResult = await createIndexerCycle(process.env).runOnce();
console.log(
  JSON.stringify({
    status: "snapshot-committed",
    blockNumber: snapshotResult.snapshotBlock?.toString(),
  }),
);
