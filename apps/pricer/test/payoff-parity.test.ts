import assert from "node:assert/strict";
import test from "node:test";

import {
  maximumOptionPayoffUsd18,
  optionPayoffUsd18,
} from "../../web/src/lib/options-payoff.ts";

const unit = 10n ** 18n;

test("web payoff vectors match capped-call settlement contract cases", () => {
  const terms = {
    kind: "capped-call" as const,
    strikeUsd18: 100n * unit,
    capUsd18: 200n * unit,
    contractSize18: unit,
  };
  assert.equal(optionPayoffUsd18(terms, 80n * unit), 0n);
  assert.equal(optionPayoffUsd18(terms, 150n * unit), 50n * unit);
  assert.equal(optionPayoffUsd18(terms, 250n * unit), 100n * unit);
  assert.equal(maximumOptionPayoffUsd18(terms), 100n * unit);
});

test("web payoff vectors match put settlement contract cases", () => {
  const terms = {
    kind: "put" as const,
    strikeUsd18: 100n * unit,
    capUsd18: 0n,
    contractSize18: unit,
  };
  assert.equal(optionPayoffUsd18(terms, 60n * unit), 40n * unit);
  assert.equal(optionPayoffUsd18(terms, 100n * unit), 0n);
  assert.equal(maximumOptionPayoffUsd18(terms), 100n * unit);
});
