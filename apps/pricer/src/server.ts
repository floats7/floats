import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { getAddress } from "viem";

import { AuthoritativePricingContextSource } from "./authoritative-context.ts";
import { RpcOptionsChainPricingReader } from "./chain-pricing-reader.ts";
import { PostgresQuoteAuditSink } from "./postgres-audit.ts";
import { PostgresQuoteNonceSource } from "./postgres-nonce.ts";
import { RailwayQuoteSigner } from "./railway-quote-signer.ts";
import { PrivateQuoteRuntime, type RuntimeQuoteRequest } from "./runtime.ts";
import { PricerService } from "./service.ts";

const config = loadConfig(process.env);
const database = new Pool({ connectionString: config.databaseUrl, max: 5, ssl: { rejectUnauthorized: true } });
const context = new AuthoritativePricingContextSource(
  database,
  new RpcOptionsChainPricingReader(config.rpcUrl, config.optionsVault),
  config.environment,
  config.chainId,
  config.riskFreeRate,
);
const runtime = new PrivateQuoteRuntime(
  new PricerService(new PostgresQuoteAuditSink(database, config.environment, config.chainId)),
  context,
  new PostgresQuoteNonceSource(database, config.environment, config.chainId),
  new RailwayQuoteSigner({
    url: config.signerUrl,
    authToken: config.signerToken,
    chainId: config.chainId,
    verifyingContract: config.quoteVerifier,
    expectedSigner: config.signerAddress,
  }),
);

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { status: "ok" });
    if (request.method !== "POST" || request.url !== "/quote") return json(response, 404, { error: "NOT_FOUND" });
    if (!authorized(request.headers.authorization, config.authToken)) return json(response, 401, { error: "UNAUTHORIZED" });
    const body = await readJson(request);
    const quoteRequest = parseRequest(body);
    return json(response, 200, await runtime.quote(quoteRequest));
  } catch (error) {
    const code = error instanceof Error ? error.message : "QUOTE_FAILED";
    return json(response, 400, { error: code });
  }
}).listen(config.port, "0.0.0.0", () => console.log(JSON.stringify({ event: "pricer_started", environment: config.environment })));

function parseRequest(body: Record<string, unknown>): RuntimeQuoteRequest {
  if (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 128) throw new Error("INVALID_REQUEST_ID");
  if (typeof body.seriesId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.seriesId)) throw new Error("INVALID_SERIES_ID");
  if (typeof body.buyer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.buyer)) throw new Error("INVALID_BUYER");
  if (body.side !== "buy" && body.side !== "sell-back") throw new Error("INVALID_SIDE");
  if (typeof body.size18 !== "string" || !/^[1-9][0-9]{0,77}$/.test(body.size18)) throw new Error("INVALID_SIZE");
  return { requestId: body.requestId, seriesId: body.seriesId as `0x${string}`, buyer: body.buyer as `0x${string}`, side: body.side, size18: BigInt(body.size18) };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 16_384) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(value);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_JSON");
  return parsed as Record<string, unknown>;
}

function authorized(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item));
}

function loadConfig(env: NodeJS.ProcessEnv) {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const environment = required("APP_ENV");
  if (environment !== "testnet" && environment !== "mainnet") throw new Error("APP_ENV is invalid");
  const chainId = Number(required("CHAIN_ID"));
  const port = Number(env.PORT ?? "3000");
  const authToken = required("PRICER_INTERNAL_AUTH_TOKEN");
  if (authToken.length < 32) throw new Error("PRICER_INTERNAL_AUTH_TOKEN is too short");
  return {
    environment,
    chainId,
    port,
    authToken,
    databaseUrl: required("SUPABASE_DB_URL"),
    rpcUrl: required("RPC_URL"),
    optionsVault: getAddress(required("OPTIONS_VAULT_ADDRESS")),
    quoteVerifier: getAddress(required("QUOTE_VERIFIER_ADDRESS")),
    signerAddress: getAddress(required("OPTIONS_QUOTE_SIGNER_ADDRESS")),
    signerUrl: required("OPTIONS_QUOTE_SIGNER_URL"),
    signerToken: required("OPTIONS_QUOTE_SIGNER_AUTH_TOKEN"),
    riskFreeRate: Number(env.OPTIONS_RISK_FREE_RATE ?? "0.05"),
  } as const;
}
