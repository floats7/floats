import assert from "node:assert/strict";
import test from "node:test";

import { postgresTls } from "../src/postgres-tls.ts";

test("keeps TLS enabled and supports optional CA pinning", () => {
  assert.deepEqual(postgresTls(), { rejectUnauthorized: false });
  assert.throws(() => postgresTls(undefined, true), /required for mainnet/);
  const pem = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----";
  assert.deepEqual(postgresTls(Buffer.from(pem).toString("base64")), {
    rejectUnauthorized: true,
    ca: pem,
  });
  assert.throws(() => postgresTls(Buffer.from("not pem").toString("base64")), /PEM certificate/);
});
