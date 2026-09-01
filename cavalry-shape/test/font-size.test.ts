import test from "node:test";
import assert from "node:assert/strict";

import { defaultFontSizePt } from "../src/core/font-size.ts";
import { FONT_SIZE_REFERENCE } from "../src/config.ts";

const reference = { pt: 28, heightPx: 1080 };

test("returns the reference size unchanged at the reference height", () => {
  assert.equal(defaultFontSizePt(1080, reference), 28);
});

test("scales up proportionally for a taller composition (e.g. 4K)", () => {
  assert.equal(defaultFontSizePt(2160, reference), 56);
});

test("scales down proportionally for a shorter composition", () => {
  assert.equal(defaultFontSizePt(540, reference), 14);
});

test("falls back to the reference size when the height is unusable", () => {
  for (const heightPx of [0, -100, NaN]) {
    assert.equal(defaultFontSizePt(heightPx, reference), reference.pt);
  }
});

test("the configured reference targets ~150pt for a 4K-tall composition", () => {
  assert.equal(defaultFontSizePt(2160, FONT_SIZE_REFERENCE), 150);
});
