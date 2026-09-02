import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { simplifyTypstSvg } from "../src/core/svg-simple.ts";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

/** Applies a `matrix(a b c d e f)` string to a point. */
function applyMatrixAttr(attr: string, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = attr.replace(/matrix\(|\)/g, "").trim().split(/[\s,]+/).map(Number);
  return [a * x + c * y + e, b * x + d * y + f];
}

const firstPoint = (d: string): [number, number] => {
  const [, x, y] = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d) ?? [];
  return [Number(x), Number(y)];
};

test("resolves <use>, folds the transform chain into one matrix, elevates quadratics", () => {
  const svg = simplifyTypstSvg(fixture("typst-output.svg"));

  // One <path> per visible glyph + the fraction bar (same 11 as the flattener).
  assert.equal((svg.match(/<path /g) ?? []).length, 11);
  // No <use>, no <defs>, no nested <g> left.
  assert.doesNotMatch(svg, /<use|<defs|<g[\s>]/);
  // The raw font quadratics are degree-elevated -- Cavalry's importer mishandles Q.
  assert.doesNotMatch(svg, /[Qq]\s/);
  assert.match(svg, /d="M 943\.000 1268\.000 C /);
  assert.match(svg, /viewBox="0 0 174 81"/);
});

test("the composed matrix places a glyph exactly where the flattener's baked coords do", () => {
  // Flattener output for this fixture starts the first glyph at (29.404, 11.618)
  // (see svg-flatten.test.ts golden). The simple version must land the same
  // point once its matrix is applied to the raw glyph's first coordinate.
  const svg = simplifyTypstSvg(fixture("typst-output.svg"));
  const first = /<path d="([^"]+)" transform="(matrix\([^"]+\))"/.exec(svg);
  assert.ok(first);
  const [rawX, rawY] = firstPoint(first[1]);
  const [x, y] = applyMatrixAttr(first[2], rawX, rawY);
  assert.ok(Math.abs(x - 29.404) < 1e-3, `x=${String(x)}`);
  assert.ok(Math.abs(y - 11.618) < 1e-3, `y=${String(y)}`);
});

test("folds #RRGGBBAA transparency into a single opacity attribute (fill-opacity is ignored)", () => {
  const svg = simplifyTypstSvg(
    `<svg data-width="4" data-height="4"><g transform="translate(1,1)">`
    + `<path d="M0 0 L1 1" fill="#ff000080"/></g></svg>`,
  );
  assert.match(svg, /fill="#ff0000"/);
  assert.doesNotMatch(svg, /fill-opacity/);
  assert.match(svg, /opacity="0\.502"/);
});

test("multiplies a group's opacity into the leaf's opacity", () => {
  const svg = simplifyTypstSvg(
    `<svg data-width="4" data-height="4"><g opacity="0.5">`
    + `<path d="M0 0 L1 1" fill="#000" fill-opacity="0.4"/></g></svg>`,
  );
  assert.match(svg, /opacity="0\.2"/); // 0.5 * 0.4
});

test("flattens a url(#gradient) fill to the coverage-weighted average of its stops", () => {
  const svg = simplifyTypstSvg(
    `<svg data-width="10" data-height="10">`
    + `<defs class="clip-path"><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">`
    + `<stop offset="0%" stop-color="#ff0000"/><stop offset="100%" stop-color="#0000ff"/></linearGradient></defs>`
    + `<g transform="translate(2,3)"><g>`
    + `<linearGradient id="p" gradientTransform="scale(6,6)" href="#g"></linearGradient>`
    + `<path d="M0 0 L6 0 L6 6 Z" fill="url(#p)"/></g></g></svg>`,
  );
  // href chain resolved (stops inherited from #g), midpoint of #ff0000..#0000ff.
  assert.doesNotMatch(svg, /url\(|<defs|Gradient/);
  assert.match(svg, /<path d="M 0\.000 0\.000 L 6\.000 0\.000 L 6\.000 6\.000 Z" transform="matrix\(1 0 0 1 2 3\)" fill="#800080"/);
});

test("folds a transparent gradient stop into the flattened fill's opacity", () => {
  const svg = simplifyTypstSvg(
    `<svg data-width="10" data-height="10">`
    + `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0">`
    + `<stop offset="0%" stop-color="#ff0000" stop-opacity="0"/>`
    + `<stop offset="100%" stop-color="#ff0000"/></linearGradient>`
    + `<path d="M0 0 L10 0 L10 10 Z" fill="url(#g)"/></svg>`,
  );
  assert.match(svg, /fill="#ff0000"[^>]*opacity="0\.5"/);
});

test("drops fully invisible paths (no fill, no stroke)", () => {
  const svg = simplifyTypstSvg(
    `<svg data-width="4" data-height="4">`
    + `<path d="M0 0 L4 4" fill="none"/>`
    + `<path d="M0 0 L4 0" fill="none" stroke="#000" stroke-width="1"/></svg>`,
  );
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.match(svg, /stroke="#000"/);
});

test("skips foreignObject subtrees", () => {
  const svg = simplifyTypstSvg(
    `<svg data-width="4" data-height="4"><g fill="#000">`
    + `<foreignObject><path d="M9 9 L9 9"/></foreignObject>`
    + `<path d="M1 1 L2 2"/></g></svg>`,
  );
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.match(svg, /d="M 1\.000 1\.000 L 2\.000 2\.000"/);
});
