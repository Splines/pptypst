import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { flattenSvg, flattenTypstSvg, serializeFlatSvg } from "../src/core/svg-flatten.ts";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

test("reproduces the golden flattening of real typst.ts output", () => {
  // Regression guard: `fixtures/typst-output.svg` is genuine typst.ts "vector
  // format" output for `$ integral_0^1 x^2 dif x = 1/3 $`, and `flattened.svg`
  // is what Cavalry imports. Any change to the flattener that alters this output
  // is a behaviour change and must be re-verified in Cavalry. (The fixture was
  // regenerated when quadratics started being degree-elevated to cubics.)
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

test("degree-elevates quadratics (Q) to cubics -- Cavalry's importer mishandles Q", () => {
  // A quadratic p0=(0,0) control=(3,0) p2=(3,3) elevates exactly to a cubic
  // with controls p0 + 2/3(c-p0) = (2,0) and p2 + 2/3(c-p2) = (3,1).
  const { paths } = flattenTypstSvg(
    `<svg width="4" height="4"><path d="M 0 0 Q 3 0, 3 3" fill="#000"/></svg>`,
  );
  assert.doesNotMatch(paths[0].d, /Q/);
  assert.equal(paths[0].d, "M 0.000 0.000 C 2.000 0.000, 3.000 1.000, 3.000 3.000");
});

test("degree-elevates smooth quadratics (T) to cubics too", () => {
  const { paths } = flattenTypstSvg(
    `<svg width="4" height="4"><path d="M 0 0 Q 1 1, 2 2 T 4 4" fill="#000"/></svg>`,
  );
  assert.doesNotMatch(paths[0].d, /Q/);
  // T's implicit control is the reflection of (1,1) about (2,2) => (3,3);
  // elevating p0=(2,2) c=(3,3) p2=(4,4): controls (2.667,2.667) and (3.333,3.333).
  assert.match(paths[0].d, /C 2\.667 2\.667, 3\.333 3\.333, 4\.000 4\.000$/);
});

test("emits no quadratics for a real glyph outline (typst fonts are all-quadratic)", () => {
  const d = flattenTypstSvg(fixture("typst-output.svg")).paths.map(p => p.d).join(" ");
  assert.doesNotMatch(d, /Q/);
  assert.match(d, /C /);
});

/* -------------------------------------------------------------------------- */
/* serializeFlatSvg style merging                                            */
/* -------------------------------------------------------------------------- */

// Five paths, two interleaved styles (#000 x3, #f00 x2).
const INTERLEAVED = flattenTypstSvg(
  `<svg width="10" height="10">`
  + `<path d="M0 0 L1 1" fill="#000"/>`
  + `<path d="M1 1 L2 2" fill="#f00"/>`
  + `<path d="M2 2 L3 3" fill="#000"/>`
  + `<path d="M3 3 L4 4" fill="#f00"/>`
  + `<path d="M4 4 L5 5" fill="#000"/>`
  + `</svg>`,
);

const countPaths = (svg: string): number => (svg.match(/<path /g) ?? []).length;

test("serializeFlatSvg keeps one path per shape by default (no merge)", () => {
  assert.equal(countPaths(serializeFlatSvg(INTERLEAVED)), 5);
});

test("serializeFlatSvg merges same-style paths once the count passes the threshold", () => {
  const svg = serializeFlatSvg(INTERLEAVED, { mergePathsAbove: 3 });
  assert.equal(countPaths(svg), 2); // one #000 path, one #f00 path

  // First-seen style order, and every same-style `d` concatenated into it.
  assert.match(
    svg,
    /<path d="M 0\.000 0\.000 L 1\.000 1\.000 M 2\.000 2\.000 L 3\.000 3\.000 M 4\.000 4\.000 L 5\.000 5\.000" fill="#000"/,
  );
  assert.match(
    svg,
    /<path d="M 1\.000 1\.000 L 2\.000 2\.000 M 3\.000 3\.000 L 4\.000 4\.000" fill="#f00"/,
  );
});

test("serializeFlatSvg does not merge when the count is at or below the threshold", () => {
  assert.equal(countPaths(serializeFlatSvg(INTERLEAVED, { mergePathsAbove: 5 })), 5);
  assert.equal(countPaths(serializeFlatSvg(INTERLEAVED, { mergePathsAbove: 4 })), 2);
});

/* -------------------------------------------------------------------------- */
/* opacity + alpha-color normalization (mirrors web/src/svg.ts)              */
/* -------------------------------------------------------------------------- */

test("splits an #RRGGBBAA fill into an opaque color plus fill-opacity", () => {
  const svg = `<svg width="4" height="4"><path d="M0 0 L1 1" fill="#ff000080"/></svg>`;
  assert.match(flattenSvg(svg), /fill="#ff0000" fill-opacity="0\.502"/);
});

test("splits #RGBA shorthand and rgba() the same way", () => {
  const short = flattenSvg(`<svg width="4" height="4"><path d="M0 0 L1 1" fill="#f008"/></svg>`);
  assert.match(short, /fill="#ff0000" fill-opacity="0\.5333"/);

  const rgba = flattenSvg(
    `<svg width="4" height="4"><path d="M0 0 L1 1" fill="rgba(0, 128, 0, 0.4)"/></svg>`,
  );
  assert.match(rgba, /fill="#008000" fill-opacity="0\.4"/);
});

test("folds a group's opacity into both fill and stroke opacity of the leaf", () => {
  const svg = `<svg width="4" height="4">`
    + `<g opacity="0.5"><path d="M0 0 L1 1" fill="#000" fill-opacity="0.4" `
    + `stroke="#000" stroke-width="1" stroke-opacity="0.6"/></g></svg>`;
  const out = flattenSvg(svg);
  assert.match(out, /fill-opacity="0\.2"/); // 0.5 * 0.4
  assert.match(out, /stroke-opacity="0\.3"/); // 0.5 * 0.6
});

test("omits *-opacity attributes when everything is fully opaque (golden format unchanged)", () => {
  const svg = `<svg width="4" height="4"><path d="M0 0 L1 1" fill="#000"/></svg>`;
  const out = flattenSvg(svg);
  assert.doesNotMatch(out, /opacity/);
});

test("same color, different opacity are kept as separate merged buckets", () => {
  const svg = `<svg width="10" height="10">`
    + `<path d="M0 0 L1 1" fill="#000"/>`
    + `<path d="M1 1 L2 2" fill="#00000080"/>`
    + `<path d="M2 2 L3 3" fill="#000"/></svg>`;
  assert.equal((flattenSvg(svg, { mergePathsAbove: 2 }).match(/<path /g) ?? []).length, 2);
});

/* -------------------------------------------------------------------------- */
/* gradients                                                                 */
/* -------------------------------------------------------------------------- */

const GRADIENT_SVG = `<svg data-width="72" data-height="89" width="72" height="89">`
  + `<defs class="clip-path"><linearGradient id="g0" spreadMethod="pad" gradientUnits="userSpaceOnUse" `
  + `x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ff0000"/>`
  + `<stop offset="100%" stop-color="#0000ff"/></linearGradient></defs>`
  + `<g transform="translate(6,6)"><g>`
  + `<linearGradient id="p0" gradientTransform="scale(60,30)" href="#g0" xlink:href="#g0"></linearGradient>`
  + `<path class="typst-shape" d="M 0 0 L 0 30 L 60 30 L 60 0 Z " fill-rule="nonzero" fill="url(#p0)"/>`
  + `</g></g></svg>`;

test("by default flattens a gradient fill to the coverage-weighted average color", () => {
  const out = flattenSvg(GRADIENT_SVG);
  assert.doesNotMatch(out, /Gradient/);
  assert.doesNotMatch(out, /url\(/);
  // Halfway between #ff0000 and #0000ff.
  assert.match(out, /fill="#800080"/);
});

test("faithful mode re-emits the gradient with the path's baked transform composed in", () => {
  const out = flattenSvg(GRADIENT_SVG, { flattenGradientsToSolid: false });
  // href chain resolved: stops inherited from #g0, geometry inherited, the
  // inline alias' scale(60,30) composed under the ancestor translate(6,6).
  assert.match(out, /<defs><linearGradient id="pptypst-grad-0"[^>]*gradientUnits="userSpaceOnUse"/);
  assert.match(out, /gradientTransform="matrix\(60,0,0,30,6,6\)"/);
  assert.match(out, /<stop offset="0%" stop-color="#ff0000"\/><stop offset="100%" stop-color="#0000ff"\/>/);
  assert.match(out, /<path d="M 6\.000 6\.000[^"]*" fill="url\(#pptypst-grad-0\)"/);
});

test("faithful mode folds a transparent gradient stop into stop-opacity", () => {
  const svg = `<svg data-width="10" data-height="10" width="10" height="10">`
    + `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0">`
    + `<stop offset="0%" stop-color="#ff000080"/><stop offset="100%" stop-color="#0000ff"/></linearGradient>`
    + `<path d="M0 0 L10 0 L10 10 Z" fill="url(#g)"/></svg>`;
  const out = flattenSvg(svg, { flattenGradientsToSolid: false });
  assert.match(out, /<stop offset="0%" stop-color="#ff0000" stop-opacity="0\.502"\/>/);
});

test("a dangling gradient reference leaves the paint untouched rather than crashing", () => {
  const svg = `<svg width="4" height="4"><path d="M0 0 L1 1" fill="url(#missing)"/></svg>`;
  const { gradients, paths } = flattenTypstSvg(svg);
  assert.equal(gradients.length, 0);
  assert.equal(paths[0].style.fill, "url(#missing)");
});

test("flattenSvg forwards the merge option", () => {
  const merged = flattenSvg(
    `<svg width="10" height="10">`
    + `<path d="M0 0 L1 1" fill="#000"/><path d="M1 1 L2 2" fill="#000"/>`
    + `<path d="M2 2 L3 3" fill="#000"/></svg>`,
    { mergePathsAbove: 2 },
  );
  assert.equal(countPaths(merged), 1);
});
