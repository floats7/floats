import assert from "node:assert/strict";
import test from "node:test";
import { parseCandidate, parseMarketCandidates } from "../lib/market-candidate-input.ts";

const openAi = {
  id: "openai",
  symbol: "OPENAI",
  name: "OpenAI",
  status: "upcoming",
  ipoDate: null,
  listingDate: null,
  eligibleFrom: null,
  sourceUrl: "https://openai.com/index/openai-submits-confidential-s-1/",
  tokenAddress: null,
  logoUrl: "https://openai.com/favicon.svg",
  tokenLive: false,
  oracleReady: false,
  liquidityReady: false,
  governanceApproved: false,
  disabledReason: "Confidential filing submitted",
  ipoStage: "confidential_filed",
  tickerAnnounced: false,
  stageSourceUrl: "https://openai.com/index/openai-submits-confidential-s-1/",
  stageUpdatedAt: "2026-11-19T15:00:00Z",
  impostorAliases: ["OpenAI", "OAI", "ChatGPT"],
};

test("accepts an internal pre-IPO identifier without treating it as an announced ticker", () => {
  const candidate = parseCandidate(openAi);
  assert.equal(candidate.symbol, "OPENAI");
  assert.equal(candidate.tickerAnnounced, false);
  assert.equal(candidate.listingDate, null);
  assert.equal(candidate.ipoStage, "confidential_filed");
});

test("rejects trading stage without an announced ticker, exchange or listing date", () => {
  assert.throws(() => parseCandidate({
    ...openAi,
    ipoStage: "trading",
    priceRangeLow: 10,
    priceRangeHigh: 12,
    ipoPrice: 11,
  }), /announced ticker, exchange and listing date/);
});

test("rejects publishing an internal placeholder as an announced ticker without an official exchange", () => {
  assert.throws(() => parseCandidate({
    ...openAi,
    tickerAnnounced: true,
  }), /announced candidate ticker requires an official exchange/);
});

test("rejects roadshow and priced stages without required official pricing fields", () => {
  assert.throws(() => parseCandidate({ ...openAi, ipoStage: "roadshow" }), /valid price range/);
  assert.throws(() => parseCandidate({ ...openAi, ipoStage: "priced", priceRangeLow: 10, priceRangeHigh: 12 }), /requires ipoPrice/);
});

test("rejects duplicate internal IDs and symbols", () => {
  assert.throws(() => parseMarketCandidates([openAi, { ...openAi, name: "Duplicate" }]), /Duplicate candidate id/);
  assert.throws(() => parseMarketCandidates([openAi, { ...openAi, id: "openai-two" }]), /Duplicate candidate symbol/);
});
