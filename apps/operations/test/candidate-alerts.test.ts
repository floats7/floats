import assert from "node:assert/strict";
import test from "node:test";

import { createCandidateAlertDelivery, formatCandidateAlert } from "../src/candidate-alerts.ts";

const alert = {
  severity: "critical" as const,
  code: "SUSPECTED_FAKE_STOCK_TOKEN" as const,
  candidateId: "anthropic",
  symbol: "ANT",
  tokenAddress: `0x${"a".repeat(40)}`,
  failures: ["SYMBOL_MISMATCH"],
  observedAt: "2026-11-19T12:00:00.000Z",
};

test("candidate alert contains actionable identity evidence", () => {
  assert.match(formatCandidateAlert(alert), /ANT/);
  assert.match(formatCandidateAlert(alert), /SYMBOL_MISMATCH/);
  assert.match(formatCandidateAlert(alert), new RegExp(alert.tokenAddress));
});

test("Telegram delivery retries transient failures", async () => {
  let calls = 0;
  const deliver = createCandidateAlertDelivery({
    telegramBotToken: "server-only-token",
    telegramChatId: "launch-room",
    retries: 2,
    fetch: async () => new Response(null, { status: ++calls === 1 ? 503 : 200 }),
  });
  await deliver(alert);
  assert.equal(calls, 2);
});

test("critical alerts are persisted for explicit operator acknowledgement", async () => {
  let body: Record<string, unknown> | undefined;
  const deliver = createCandidateAlertDelivery({
    databaseUrl: new URL("https://database.example"),
    secretKey: "sb_secret_server_only",
    environment: "mainnet",
    chainId: 4663,
    fetch: async (_input, init) => {
      if ((init?.method ?? "GET") === "POST") {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(null, { status: 201 });
      }
      return Response.json([]);
    },
  });
  await deliver(alert);
  assert.equal(body?.candidate_id, "anthropic");
  assert.equal(body?.state, undefined);
  assert.equal(typeof (body?.payload as { launchSnapshot?: unknown })?.launchSnapshot, "object");
  assert.match(String(body?.fingerprint), /^0x[0-9a-f]{64}$/);
});
