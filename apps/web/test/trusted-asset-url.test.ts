import assert from "node:assert/strict";
import test from "node:test";

import { trustedAssetUrl } from "../src/lib/trusted-asset-url.ts";

test("allows the reviewed Google favicon redirect host used by market logos", () => {
  const logo = "https://t0.gstatic.com/faviconV2?client=SOCIAL&url=http://www.circle.com&size=256";

  assert.equal(trustedAssetUrl(logo), logo);
});

test("resolves reviewed Google favicon metadata to the final image host", () => {
  assert.equal(
    trustedAssetUrl("https://www.google.com/s2/favicons?domain=www.circle.com&sz=256"),
    "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE%2CSIZE%2CURL&url=https%3A%2F%2Fwww.circle.com&size=256",
  );
});

test("allows canonical market logos from the Robinhood asset registry", () => {
  const logo = "https://cdn.robinhood.com/ncw_assets/logos/0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5.png";

  assert.equal(trustedAssetUrl(logo), logo);
});

test("rejects unreviewed remote logo hosts", () => {
  assert.equal(trustedAssetUrl("https://assets.example/market-logo.png"), undefined);
});
