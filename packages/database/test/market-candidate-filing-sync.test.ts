import assert from "node:assert/strict";
import test from "node:test";
import { parseCandidateFilingRoutes, syncCandidateFilings } from "../src/market-candidate-filing-sync.ts";

test("parses exact-name SEC filing routes and rejects duplicate candidates", () => {
  assert.deepEqual(parseCandidateFilingRoutes(JSON.stringify([{
    candidateId: "openai",
    legalNames: ["OpenAI Group PBC", "OpenAI Group PBC"],
  }])), [{ candidateId: "openai", legalNames: ["OpenAI Group PBC"] }]);
  assert.throws(() => parseCandidateFilingRoutes(JSON.stringify([
    { candidateId: "openai", legalNames: ["OpenAI Group PBC"] },
    { candidateId: "openai", legalNames: ["OpenAI, Inc."] },
  ])), /Duplicate SEC filing candidateId/);
});

test("records and alerts on a newly observed public S-1 without promoting the candidate", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const alerts: unknown[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "www.sec.gov" && url.pathname.endsWith("company_tickers.json")) {
      return Response.json({ 0: { cik_str: 1234567, title: "OpenAI Group PBC", ticker: "", exchange: "" } });
    }
    if (url.hostname === "data.sec.gov") {
      return Response.json({ name: "OpenAI Group PBC", filings: { recent: {
        accessionNumber: ["0001234567-26-000001"],
        filingDate: ["2026-11-20"],
        form: ["S-1"],
        primaryDocument: ["openai-s1.htm"],
      } } });
    }
    writes.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json([{ accession_number: "0001234567-26-000001" }], { status: 201 });
  };

  const count = await syncCandidateFilings({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    secUserAgent: "Floats operations ops@floats.trade",
    filingRoutes: [{ candidateId: "openai", legalNames: ["OpenAI Group PBC"] }],
    fetch: fetchMock,
    onAlert: async (alert) => { alerts.push(alert); },
  });

  assert.equal(count, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.candidate_id, "openai");
  assert.equal(writes[0]?.form_type, "S-1");
  assert.equal(alerts.length, 1);
  assert.equal((alerts[0] as { code: string }).code, "PUBLIC_S1_DETECTED");
});

test("does not use fuzzy company-name matches", async () => {
  let submissionsRequested = false;
  const fetchMock: typeof fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "data.sec.gov") submissionsRequested = true;
    return Response.json({ 0: { cik_str: 1234567, title: "OpenAI SPV", ticker: "", exchange: "" } });
  };
  const count = await syncCandidateFilings({
    databaseUrl: new URL("https://database.example"),
    secretKey: `sb_secret_${"a".repeat(32)}`,
    environment: "mainnet",
    chainId: 4663,
    secUserAgent: "Floats operations ops@floats.trade",
    filingRoutes: [{ candidateId: "openai", legalNames: ["OpenAI Group PBC"] }],
    fetch: fetchMock,
  });
  assert.equal(count, 0);
  assert.equal(submissionsRequested, false);
});
