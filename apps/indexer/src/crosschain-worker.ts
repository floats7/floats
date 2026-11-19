import { createCrossChainProtocolIndexer } from "./crosschain-bootstrap.ts";

const intervalMs = readInterval(process.env.CROSSCHAIN_INDEXER_POLL_INTERVAL_MS);
const indexer = createCrossChainProtocolIndexer(process.env);
let stopping = false;

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

while (!stopping) {
  const startedAt = Date.now();
  try {
    const result = await indexer.runOnce();
    console.log(JSON.stringify({
      status: result.status,
      fromBlock: result.fromBlock?.toString(),
      toBlock: result.toBlock?.toString(),
      eventCount: result.eventCount,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      status: "failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }));
  }
  const remaining = Math.max(0, intervalMs - (Date.now() - startedAt));
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function stop(): void {
  stopping = true;
}

function readInterval(value: string | undefined): number {
  const interval = Number(value ?? "15000");
  if (!Number.isSafeInteger(interval) || interval < 5_000 || interval > 300_000) {
    throw new Error("CROSSCHAIN_INDEXER_POLL_INTERVAL_MS must be between 5000 and 300000");
  }
  return interval;
}
