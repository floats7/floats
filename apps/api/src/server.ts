import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createApiContext } from "./context.ts";
import {
  getAssets,
  getLatestIndexState,
  getNavHistory,
  getOperationalActions,
  getPublicConfig,
  getRegistryChanges,
  getWalletChallenge,
  internalError,
  postVaultQuote,
  postWalletHistory,
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
    const response = await route(request, new URL(request.url));
    await writeResponse(outgoing, response, allowedOrigin);
  } catch {
    await writeResponse(outgoing, internalError(), allowedOrigin);
  }
});

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
  if (request.method === "GET" && endpoint === "assets") return getAssets(context, request.signal);
  if (request.method === "GET" && endpoint === "index-state") return getLatestIndexState(context, request.signal);
  if (request.method === "GET" && endpoint === "nav-history") return getNavHistory(context, url, request.signal);
  if (request.method === "GET" && endpoint === "registry-changes") return getRegistryChanges(context, url, request.signal);
  if (request.method === "GET" && endpoint === "operations") return getOperationalActions(context, url, request.signal);
  if (request.method === "POST" && endpoint === "quote") return postVaultQuote(context, request);
  if (request.method === "GET" && endpoint === "wallet-history") return getWalletChallenge(context, request);
  if (request.method === "POST" && endpoint === "wallet-history") return postWalletHistory(context, request);
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
