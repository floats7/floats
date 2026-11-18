import assert from "node:assert/strict";
import test from "node:test";
import { decimalUnitsToNumber, formatUnits } from "../src/lib/units.ts";

test("preserves the complete fractional component when all decimals are requested", () => {
  assert.equal(formatUnits("989973548787967240", 18, 18), "0.98997354878796724");
  assert.equal(
    decimalUnitsToNumber("989973548787967240", 18),
    Number("0.98997354878796724"),
  );
});

test("formats whole and bounded fractional values without changing their scale", () => {
  assert.equal(formatUnits("123450000", 6, 4), "123.45");
  assert.equal(formatUnits("1000000", 6, 6), "1");
  assert.equal(formatUnits("56", 6, 6), "0.000056");
});
