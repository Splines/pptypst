import test from "node:test";
import assert from "node:assert/strict";

import { parsePathData } from "../src/core/svg-path.ts";
import { flattenTypstSvg } from "../src/core/svg-flatten.ts";
import { readFileSync } from "node:fs";

test("parses the M/L/C/Q/Z subset the flattener emits", () => {
  const verbs = parsePathData("M 1 2 L 3 4 C 5 6, 7 8, 9 10 Q 11 12, 13 14 Z");
  assert.deepEqual(verbs, [
    { type: "M", coords: [1, 2] },
    { type: "L", coords: [3, 4] },
    { type: "C", coords: [5, 6, 7, 8, 9, 10] },
    { type: "Q", coords: [11, 12, 13, 14] },
    { type: "Z", coords: [] },
  ]);
});

test("drops an unsupported verb and its orphaned numbers", () => {
  const verbs = parsePathData("M 0 0 A 5 5 0 0 1 10 10 L 20 20");
  assert.deepEqual(verbs, [
    { type: "M", coords: [0, 0] },
    { type: "L", coords: [20, 20] },
  ]);
});

test("stops cleanly on a truncated tail", () => {
  assert.deepEqual(parsePathData("M 1 2 L 3"), [{ type: "M", coords: [1, 2] }]);
});

test("every path in the golden flattened fixture round-trips through the parser", () => {
  const svg = readFileSync(new URL("./fixtures/typst-output.svg", import.meta.url), "utf8");
  const { paths } = flattenTypstSvg(svg);
  assert.ok(paths.length > 0);
  for (const { d } of paths) {
    const verbs = parsePathData(d);
    assert.ok(verbs.length > 0);
    assert.equal(verbs[0].type, "M");
    for (const { type, coords } of verbs) {
      assert.ok(coords.every(Number.isFinite), `finite coords for ${type}`);
    }
  }
});
