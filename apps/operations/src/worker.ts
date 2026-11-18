import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

interface ManagedWorker {
  readonly name: string;
  readonly child: ChildProcess;
  readonly exited: Promise<{
    readonly name: string;
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>;
}

const workerPaths = [
  { name: "indexer", path: new URL("../../indexer/src/worker.ts", import.meta.url) },
  { name: "keeper", path: new URL("../../keeper/src/worker.ts", import.meta.url) },
  { name: "candidate-sync", path: new URL("./candidate-sync-worker.ts", import.meta.url) },
] as const;
const workers = workerPaths.map(({ name, path }) => startWorker(name, fileURLToPath(path)));
let stopping = false;

process.once("SIGINT", () => stopAll("SIGINT"));
process.once("SIGTERM", () => stopAll("SIGTERM"));
console.log(JSON.stringify({ event: "operations_started", workers: workers.map(({ name }) => name) }));

const firstExit = await Promise.race(workers.map(({ exited }) => exited));
if (!stopping) {
  stopping = true;
  console.error(JSON.stringify({ event: "operations_worker_exited", ...firstExit }));
  for (const { child } of workers) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
}

const exits = await Promise.all(workers.map(({ exited }) => exited));
if (exits.some(({ code, signal }) => code !== 0 && signal === null)) process.exitCode = 1;
console.log(JSON.stringify({ event: "operations_stopped", exits }));

function startWorker(name: string, path: string): ManagedWorker {
  const child = spawn(process.execPath, ["--experimental-transform-types", path], {
    env: process.env,
    stdio: "inherit",
  });
  const exited = new Promise<{
    readonly name: string;
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ name, code, signal }));
  });
  return { name, child, exited };
}

function stopAll(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  for (const { child } of workers) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}
