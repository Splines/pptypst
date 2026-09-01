import test from "node:test";
import assert from "node:assert/strict";

import {
  contrastInk,
  isDarkBackground,
  isHexColor,
  parseHexRgb,
  perceivedBrightness,
} from "../src/core/contrast.ts";

test("parseHexRgb reads long and short hex, ignoring alpha", () => {
  assert.deepEqual(parseHexRgb("#ff8800"), [255, 136, 0]);
  assert.deepEqual(parseHexRgb("#FFF"), [255, 255, 255]);
  assert.deepEqual(parseHexRgb("#0f08"), [0, 255, 0]);
  assert.deepEqual(parseHexRgb("#11223344"), [17, 34, 51]);
});

test("parseHexRgb rejects anything that isn't a hex colour", () => {
  for (const value of ["", "ff8800", "#12", "#12345", "rgb(0,0,0)", "red"]) {
    assert.equal(parseHexRgb(value), null, value);
    assert.equal(isHexColor(value), false, value);
  }
});

test("perceivedBrightness is ~0 for black and ~1 for white", () => {
  assert.ok((perceivedBrightness("#000000") ?? 1) < 0.01);
  assert.ok((perceivedBrightness("#ffffff") ?? 0) > 0.99);
  assert.equal(perceivedBrightness("not-a-colour"), null);
});

test("isDarkBackground is true for dark colours and false for light ones", () => {
  assert.equal(isDarkBackground("#000000"), true);
  assert.equal(isDarkBackground("#1e1e1e"), true);
  assert.equal(isDarkBackground("#ffffff"), false);
  assert.equal(isDarkBackground("#f0f0f0"), false);
});

test("isDarkBackground treats an unknown or missing colour as dark", () => {
  assert.equal(isDarkBackground(null), true);
  assert.equal(isDarkBackground("magenta"), true);
});

test("contrastInk gives white on dark and black on light", () => {
  assert.equal(contrastInk("#202020"), "#ffffff");
  assert.equal(contrastInk("#fafafa"), "#000000");
  assert.equal(contrastInk(null), "#ffffff");
});
