import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { createApiContext } from "./context.ts";
import {
  getAssets,
  getBridgeMessage,
  getBridgeMessages,
  getBridgeNav,
  getFeeRates,
  getLatestIndexState,
  getMarket,
  getMarketCandidates,
  getMarketCandidateHistory,
  getMarketHistory,
  getMarkets,
  getNavHistory,
  getOperationalActions,
  getOptionsActivity,
  getPublicActivity,
  getOptionsSeries,
  getOptionsVaultState,
  postOptionsPortfolio,
  postOptionsQuote,
  getPublicConfig,
  getRegistryChanges,
  getWalletChallenge,
  internalError,
  postVaultQuote,
  postWalletHistory,
  postWalletData,
} from "./handlers.ts";

const port = readPort(process.env.PORT);
const allowedOrigin = readAllowedOrigin(process.env.WEB_ORIGIN);
const context = createApiContext(process.env);

const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.method === "OPTIONS") {
      await writeResponse(outgoing, new Response(null, { status: 204 }), allowedOrigin);
      return;
    }
    const request = await toRequest(incoming);
    const limit = sensitiveEndpointLimit(request);
    if (limit) {
      const key = `${readClientIp(incoming)}:${new URL(request.url).pathname}`;
      const result = await context.readModels.takeRateLimit(createHash("sha256").update(key).digest("hex"), limit);
      if (!result.allowed) {
        await writeResponse(outgoing, rateLimited(limit, result.resetAt), allowedOrigin);
        return;
      }
      outgoing.setHeader("x-ratelimit-limit", limit.toString());
      outgoing.setHeader("x-ratelimit-remaining", result.remaining.toString());
      outgoing.setHeader("x-ratelimit-reset", Math.ceil(result.resetAt / 1_000).toString());
    }
    const response = await route(request, new URL(request.url));
    await writeResponse(outgoing, response, allowedOrigin);
  } catch {
    await writeResponse(outgoing, internalError(), allowedOrigin);
  }
});

function sensitiveEndpointLimit(request: Request): number | null {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/wallet-history" || pathname === "/api/options/portfolio" || pathname === "/api/wallet-data") return 10;
  if ((pathname === "/api/quote" || pathname === "/api/options/quote") && request.method === "POST") return 60;
  return null;
}

function readClientIp(request: IncomingMessage): string {
  const cloudflare = request.headers["cf-connecting-ip"];
  if (typeof cloudflare === "string" && cloudflare.trim()) return cloudflare.trim();
  const forwarded = request.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",", 1)[0];
  return candidate?.trim() || request.socket.remoteAddress || "unknown";
}

function rateLimited(limit: number, resetAt: number): Response {
  return Response.json(
    { error: { code: "RATE_LIMITED" } },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": Math.max(1, Math.ceil((resetAt - Date.now()) / 1_000)).toString(),
        "x-ratelimit-limit": limit.toString(),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": Math.ceil(resetAt / 1_000).toString(),
      },
    },
  );
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Floats API listening on port ${port}`);
});

async function route(request: Request, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ status: "ok" });
  }
  if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 404 });

  const endpoint = url.pathname.slice(5);
  if (request.method === "GET" && endpoint === "config") return getPublicConfig(context);
  if (request.method === "GET" && endpoint === "fee-rates") return getFeeRates(context);
  if (request.method === "GET" && endpoint === "assets") return getAssets(context, request.signal);
  if (request.method === "GET" && endpoint === "bridge/messages") {
    return getBridgeMessages(context, url, request.signal);
  }
  if (request.method === "GET" && endpoint === "bridge/nav") {
    return getBridgeNav(context, url, request.signal);
  }
  const bridgeMessageMatch = endpoint.match(
    /^bridge\/messages\/([1-9][0-9]*)\/(0x[0-9a-fA-F]{64})$/,
  );
  if (request.method === "GET" && bridgeMessageMatch?.[1] && bridgeMessageMatch[2]) {
    return getBridgeMessage(
      context,
      bridgeMessageMatch[1],
      bridgeMessageMatch[2],
      request.signal,
    );
  }
  if (request.method === "GET" && endpoint === "markets") return getMarkets(context, request.signal);
  if (request.method === "GET" && endpoint === "market-candidates") return getMarketCandidates(context, request.signal);
  const candidateHistoryMatch = endpoint.match(/^market-candidates\/([a-z0-9-]{1,80})\/history$/);
  if (request.method === "GET" && candidateHistoryMatch?.[1]) {
    return getMarketCandidateHistory(context, candidateHistoryMatch[1], url, request.signal);
  }
  const marketHistoryMatch = endpoint.match(/^markets\/(index|0x[0-9a-fA-F]{40})\/history$/);
  if (request.method === "GET" && marketHistoryMatch?.[1]) {
    return getMarketHistory(context, marketHistoryMatch[1], url, request.signal);
  }
  const marketMatch = endpoint.match(/^markets\/(index|0x[0-9a-fA-F]{40})$/);
  if (request.method === "GET" && marketMatch?.[1]) {
    return getMarket(context, marketMatch[1], request.signal);
  }
  if (request.method === "GET" && endpoint === "index-state") return getLatestIndexState(context, request.signal);
  if (request.method === "GET" && endpoint === "nav-history") return getNavHistory(context, url, request.signal);
  if (request.method === "GET" && endpoint === "registry-changes") return getRegistryChanges(context, url, request.signal);
  if (request.method === "GET" && endpoint === "operations") return getOperationalActions(context, url, request.signal);
  if (request.method === "GET" && endpoint === "options/series") return getOptionsSeries(context, request.signal);
  if (request.method === "GET" && endpoint === "options/activity") return getOptionsActivity(context, url, request.signal);
  if (request.method === "GET" && endpoint === "activity") return getPublicActivity(context, url, request.signal);
  if (request.method === "GET" && endpoint === "options/vault") return getOptionsVaultState(context);
  if (request.method === "GET" && endpoint === "options/portfolio") return getWalletChallenge(context, request);
  if (request.method === "POST" && endpoint === "options/portfolio") return postOptionsPortfolio(context, request);
  if (request.method === "POST" && endpoint === "options/quote") return postOptionsQuote(context, request);
  if (request.method === "POST" && endpoint === "quote") return postVaultQuote(context, request);
  if (request.method === "GET" && endpoint === "wallet-history") return getWalletChallenge(context, request);
  if (request.method === "POST" && endpoint === "wallet-history") return postWalletHistory(context, request);
  if (request.method === "GET" && endpoint === "wallet-data") return getWalletChallenge(context, request);
  if (request.method === "POST" && endpoint === "wallet-data") return postWalletData(context, request);
  return new Response(null, { status: 404 });
}

async function toRequest(incoming: IncomingMessage): Promise<Request> {
  const host = incoming.headers.host ?? "localhost";
  const protocol = incoming.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : await readBody(incoming);
  const init: RequestInit = { method: incoming.method ?? "GET", headers };
  if (body !== undefined) init.body = body;
  return new Request(`${protocol}://${host}${incoming.url ?? "/"}`, init);
}

async function readBody(incoming: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of incoming) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeResponse(outgoing: ServerResponse, response: Response, origin: string): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.setHeader("access-control-allow-origin", origin);
  outgoing.setHeader("access-control-allow-credentials", "true");
  outgoing.setHeader("access-control-allow-headers", "content-type");
  outgoing.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  outgoing.setHeader("vary", "Origin");
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("PORT is invalid");
  return port;
}

function readAllowedOrigin(value: string | undefined): string {
  if (!value) throw new Error("WEB_ORIGIN is required");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("WEB_ORIGIN must use HTTPS");
  return url.origin;
}
