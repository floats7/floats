import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

import { loadSignerConfig } from "./config.ts";
import { signOptionsQuote } from "./quote.ts";

const config = loadSignerConfig(process.env);
const signerAddress = privateKeyToAccount(config.privateKey).address;

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { status: "ok", environment: config.appEnvironment, signer: signerAddress });
    }
    if (request.method !== "POST" || request.url !== "/sign/options-quote") {
      return json(response, 404, { error: "NOT_FOUND" });
    }
    if (!authorized(request.headers.authorization, config.authToken)) {
      return json(response, 401, { error: "UNAUTHORIZED" });
    }
    const body = await readJson(request, 16_384);
    return json(response, 200, await signOptionsQuote(body, config));
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_REQUEST";
    return json(response, 400, { error: message });
  }
}).listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "signer_started", environment: config.appEnvironment, signer: signerAddress }));
});

function authorized(header: string | undefined, expectedToken: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;
  const received = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function readJson(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_JSON");
  return parsed as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
