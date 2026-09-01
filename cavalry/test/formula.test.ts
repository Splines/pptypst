import test from "node:test";
import assert from "node:assert/strict";

import {
  FORMULA_VERSION,
  formulaLayerName,
  parseFormula,
  serializeFormula,
} from "../src/core/formula.ts";

const naming = { maxSourceChars: 20 };

test("round-trips a formula through the stored payload", () => {
  const formula = { source: "integral_0^1 x^2 dif x", fontSizePt: 42, mathMode: true };
  assert.deepEqual(parseFormula(serializeFormula(formula)), formula);
});

test("round-trips a formula with 'Only Math' off", () => {
  const formula = { source: "$ x $", fontSizePt: 28, mathMode: false };
  assert.deepEqual(parseFormula(serializeFormula(formula)), formula);
});

test("stamps the payload with the format version", () => {
  const stored = serializeFormula({ source: "x", fontSizePt: 28, mathMode: false });
  assert.equal((stored as { v: number }).v, FORMULA_VERSION);
});

test("rejects payloads that are not current-version PPTypst formulas", () => {
  const raws: unknown[] = [
    null,
    undefined,
    42,
    "text",
    {},
    { v: 1 },
    { code: 7 },
    { v: 0, code: "x", fontSize: 28, math: false }, // older / unknown version
    { v: 1, code: "x", math: false }, // missing font size
    { v: 1, code: "x", fontSize: 28 }, // missing math flag
    { v: 1, code: "x", fontSize: "28", math: false }, // wrong type
  ];
  for (const raw of raws) {
    assert.equal(parseFormula(raw), null, JSON.stringify(raw));
  }
});

test("names a layer after a short formula in full", () => {
  assert.equal(formulaLayerName("x^2", naming), "x^2");
});

test("truncates a long formula without an ellipsis and collapses whitespace", () => {
  assert.equal(formulaLayerName("integral_0^1   x^2\n dif x = 1/3", naming), "integral_0^1 x^2 dif");
});

test("strips the surrounding Typst math delimiters", () => {
  assert.equal(formulaLayerName("$ integral_0^1 x^2 dif x = 1/3 $", naming), "integral_0^1 x^2 dif");
});
