import assert from "node:assert/strict";
import test from "node:test";

import { ReadModelRepository } from "../src/read-model-repository.ts";
import { BackendDataError, SupabaseRestClient } from "../src/supabase-rest-client.ts";

test("server client sends the secret only in the apikey request header", async () => {
  let observedUrl: URL | undefined;
  let observedHeaders: Headers | undefined;
  const fetchStub: typeof fetch = async (input, init) => {
    observedUrl = new URL(input instanceof Request ? input.url : input.toString());
    observedHeaders = new Headers(init?.headers);
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new SupabaseRestClient({
    baseUrl: new URL("https://example.supabase.co"),
    secretKey: "sb_secret_test-value",
    fetch: fetchStub,
  });
  const repository = new ReadModelRepository(client, { environment: "testnet", chainId: 46630 });

  await repository.listActiveAssets();

  assert.equal(observedHeaders?.get("apikey"), "sb_secret_test-value");
  assert.equal(observedHeaders?.get("authorization"), null);
  assert.equal(observedUrl?.searchParams.get("environment"), "eq.testnet");
  assert.equal(observedUrl?.searchParams.get("chain_id"), "eq.46630");
  assert.equal(observedUrl?.searchParams.get("limit"), "100");
  assert.equal(observedUrl?.toString().includes("sb_secret_"), false);
});

test("database response details are not exposed by backend errors", async () => {
  const client = new SupabaseRestClient({
    baseUrl: new URL("https://example.supabase.co"),
    secretKey: "sb_secret_test-value",
    fetch: async () => new Response('{"message":"sensitive database detail"}', { status: 500 }),
  });

  await assert.rejects(
    () => client.select("assets", new URLSearchParams()),
    (error: unknown) => {
      assert.ok(error instanceof BackendDataError);
      assert.equal(error.message, "Database request failed with status 500");
      assert.equal(error.message.includes("sensitive"), false);
      return true;
    },
  );
});

test("read repository rejects invalid addresses before database access", () => {
  const client = new SupabaseRestClient({
    baseUrl: new URL("https://example.supabase.co"),
    secretKey: "sb_secret_test-value",
    fetch: async () => new Response("[]"),
  });
  const repository = new ReadModelRepository(client, { environment: "testnet", chainId: 46630 });

  assert.throws(() => repository.latestNav("not-an-address"), /Invalid vault address/);
});

test("read repository exposes only canonical bounded registry changes", async () => {
  let observedUrl: URL | undefined;
  const client = new SupabaseRestClient({
    baseUrl: new URL("https://example.supabase.co"),
    secretKey: "sb_secret_test-value",
    fetch: async (input) => {
      observedUrl = new URL(input instanceof Request ? input.url : input.toString());
      return Response.json([]);
    },
  });
  const repository = new ReadModelRepository(client, { environment: "testnet", chainId: 46630 });

  await repository.listRegistryChanges(25);

  assert.equal(observedUrl?.pathname, "/rest/v1/registry_changes");
  assert.equal(observedUrl?.searchParams.get("canonical"), "eq.true");
  assert.equal(observedUrl?.searchParams.get("limit"), "25");
  assert.throws(() => repository.listRegistryChanges(101), /between 1 and 100/);
});
