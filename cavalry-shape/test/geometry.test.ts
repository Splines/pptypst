import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GEOMETRY_VERSION,
  geometryFromFlattened,
  parseGeometry,
  serializeGeometry,
  type Geometry,
} from "../src/core/geometry.ts";
import { flattenTypstSvg } from "../src/core/svg-flatten.ts";

const typstSvg = readFileSync(new URL("fixtures/typst-output.svg", import.meta.url), "utf8");

function sample(): Geometry {
  return {
    width: 174,
    height: 81,
    paths: [
      { d: "M 1 2 L 3 4 Z", fill: "#000000" },
      { d: "M 0 0 L 10 0", stroke: "#ff0000", strokeWidth: 2 },
    ],
  };
}

test("a geometry survives a round trip", () => {
  const parsed = parseGeometry(serializeGeometry(sample()));
  assert.deepEqual(parsed, sample());
});

test("optional style keys are omitted, not stored as undefined", () => {
  const stored = JSON.parse(serializeGeometry(sample())) as { v: number; p: Record<string, unknown>[] };
  assert.equal(stored.v, GEOMETRY_VERSION);
  assert.deepEqual(Object.keys(stored.p[0]), ["d", "f"]);
  assert.deepEqual(Object.keys(stored.p[1]), ["d", "s", "sw"]);
});

test("unusable payloads parse to null rather than throwing", () => {
  assert.equal(parseGeometry(""), null);
  assert.equal(parseGeometry("not json"), null);
  assert.equal(parseGeometry("[]"), null);
  assert.equal(parseGeometry(JSON.stringify({ v: GEOMETRY_VERSION + 1, w: 1, h: 1, p: [] })), null);
});

test("entries without a `d` string are dropped, the rest kept", () => {
  const raw = JSON.stringify({ v: GEOMETRY_VERSION, w: 1, h: 1, p: [{ d: "M 0 0" }, { f: "#fff" }, 7] });
  assert.deepEqual(parseGeometry(raw)?.paths, [{ d: "M 0 0" }]);
});

test("flattened typst output becomes drawable outlines", () => {
  const flat = flattenTypstSvg(typstSvg);
  const geometry = geometryFromFlattened(flat, { precision: 2 });

  assert.equal(geometry.width, flat.width);
  assert.equal(geometry.paths.length, flat.paths.length);
  // The fixture is one fraction: filled glyphs plus the stroked fraction bar.
  assert.ok(geometry.paths.some(p => p.fill !== undefined));
  assert.ok(geometry.paths.some(p => p.stroke !== undefined));
  assert.ok(geometry.paths.every(p => p.fill !== undefined || p.stroke !== undefined));
});

test("outlines that would draw nothing are dropped", () => {
  const invisible = { fill: "none", stroke: "none", strokeWidth: "1", fillRule: "nonzero" };
  const geometry = geometryFromFlattened(
    {
      width: 10,
      height: 10,
      paths: [
        { d: "M 0 0 L 10 10", style: invisible },
        { d: "   ", style: { ...invisible, fill: "#000000" } },
        { d: "M 0 0 L 1 1", style: { ...invisible, fill: "#000000" } },
      ],
    },
    { precision: 2 },
  );
  assert.deepEqual(geometry.paths, [{ d: "M 0 0 L 1 1", fill: "#000000" }]);
});

test("rounding trims coordinates and the payload with them", () => {
  const flat = flattenTypstSvg(typstSvg);
  const rounded = serializeGeometry(geometryFromFlattened(flat, { precision: 2 }));
  const full = serializeGeometry(geometryFromFlattened(flat, { precision: 3 }));

  assert.ok(rounded.length < full.length);
  assert.match(geometryFromFlattened(flat, { precision: 0 }).paths[0].d, /^M -?\d+ -?\d+/);
});

test("rounding leaves no trailing zeros behind", () => {
  const geometry = geometryFromFlattened(
    { width: 1, height: 1, paths: [{ d: "M 1.500 2.000 L 3.004 4.996", style: { fill: "#000000", stroke: "none", strokeWidth: "1", fillRule: "nonzero" } }] },
    { precision: 2 },
  );
  assert.equal(geometry.paths[0].d, "M 1.5 2 L 3 5");
});
