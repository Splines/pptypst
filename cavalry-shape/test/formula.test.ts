import test from "node:test";
import assert from "node:assert/strict";

import { formulaLayerName, parseFormula } from "../src/core/formula.ts";

const naming = { maxSourceChars: 20 };

test("reads a v2 payload written before the plug-in existed", () => {
  const stored = { v: 2, code: "$ integral_0^1 x^2 dif x $", fontSize: 42 };
  assert.deepEqual(parseFormula(stored), { source: stored.code, fontSizePt: 42 });
});

test("reads a v1 payload (no font size) with fontSizePt left undefined", () => {
  const parsed = parseFormula({ v: 1, code: "x^2" });
  assert.deepEqual(parsed, { source: "x^2", fontSizePt: undefined });
});

test("rejects payloads that are not PPTypst formulas", () => {
  for (const raw of [null, undefined, 42, "text", {}, { v: 1 }, { code: 7 }]) {
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
