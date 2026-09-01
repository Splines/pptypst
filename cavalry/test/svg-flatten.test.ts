import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { flattenSvg, flattenTypstSvg } from "../src/core/svg-flatten.ts";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

test("reproduces the golden flattening of real typst.ts output", () => {
  // Regression guard: `fixtures/typst-output.svg` is genuine typst.ts "vector
  // format" output for `$ integral_0^1 x^2 dif x = 1/3 $`, and `flattened.svg`
  // is what Cavalry successfully imports. Any change to the flattener that
  // alters this output is a behaviour change and must be re-verified in Cavalry.
  assert.equal(flattenSvg(fixture("typst-output.svg")), fixture("flattened.svg"));
});

test("emits one path per visible glyph and shape, and nothing for <defs>", () => {
  // 9 glyphs + the "2" exponent + the fraction bar for the fixture formula.
  const { paths } = flattenTypstSvg(fixture("typst-output.svg"));
  assert.equal(paths.length, 11);
});

test("keeps the page dimensions from the source svg", () => {
  const { width, height } = flattenTypstSvg(fixture("typst-output.svg"));
  assert.deepEqual({ width, height }, { width: 174, height: 81 });
});

test("resolves <use> against <defs> and bakes in ancestor transforms", () => {
  const svg = `<svg width="10" height="10">`
    + `<defs><path id="g" d="M 0 0 L 1 0"/></defs>`
    + `<g transform="translate(5,7)"><g transform="scale(2,3)">`
    + `<use x="1" y="1" href="#g" fill="#000"/>`
    + `</g></g></svg>`;
  const { paths } = flattenTypstSvg(svg);
  // (0,0) -> scale(2,3) after translate(1,1) -> (2,3) -> translate(5,7) = (7,10)
  // (1,0) -> (2,0)+(2,3) offset ... = (9,10)
  assert.equal(paths.length, 1);
  assert.equal(paths[0].d, "M 7.000 10.000 L 9.000 10.000");
});

test("does not emit the raw glyph outlines sitting in <defs>", () => {
  // Regression: an early version walked into <defs> and emitted every glyph
  // twice -- once untransformed at the origin, once placed.
  const svg = `<svg width="4" height="4">`
    + `<defs><path id="g" d="M 0 0 L 9 9"/></defs>`
    + `</svg>`;
  assert.equal(flattenTypstSvg(svg).paths.length, 0);
});

test("skips foreignObject text-selection overlays", () => {
  const svg = `<svg width="4" height="4">`
    + `<g><foreignObject x="0" y="0" width="4" height="4">`
    + `<div><path d="M 0 0 L 1 1"/></div>`
    + `</foreignObject><path d="M 2 2 L 3 3" fill="#000"/></g></svg>`;
  const { paths } = flattenTypstSvg(svg);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].d, "M 2.000 2.000 L 3.000 3.000");
});

test("inherits fill down the tree and defaults to none at the root", () => {
  const svg = `<svg width="4" height="4">`
    + `<g fill="#123456"><path d="M 0 0 L 1 1"/></g>`
    + `<path d="M 1 1 L 2 2"/></svg>`;
  const { paths } = flattenTypstSvg(svg);
  assert.equal(paths[0].style.fill, "#123456");
  assert.equal(paths[1].style.fill, "none");
});

test("expands H/V into absolute linetos", () => {
  const { paths } = flattenTypstSvg(
    `<svg width="4" height="4"><path d="M 1 1 H 3 V 5" fill="#000"/></svg>`,
  );
  assert.equal(paths[0].d, "M 1.000 1.000 L 3.000 1.000 L 3.000 5.000");
});

test("expands smooth curves (S) into explicit cubics", () => {
  const { paths } = flattenTypstSvg(
    `<svg width="4" height="4"><path d="M 0 0 C 1 1, 2 2, 3 3 S 5 5, 6 6" fill="#000"/></svg>`,
  );
  // The implicit first control point of S is the reflection of (2,2) about (3,3).
  assert.match(paths[0].d, /C 4\.000 4\.000, 5\.000 5\.000, 6\.000 6\.000$/);
});
