import test from "node:test";
import assert from "node:assert/strict";

import { buildTypstDocument } from "../src/core/typst-document.ts";

const options = { fontSizePt: 28, mathMode: false, color: "#000000" };

test("sets an auto-sized, unfilled page so the SVG is a tight bounding box", () => {
  const doc = buildTypstDocument("x", options);
  assert.match(doc, /^#set page\(margin: 3pt, background: none, width: auto, fill: none, height: auto\)$/m);
});

test("applies the configured font size", () => {
  assert.match(buildTypstDocument("x", { ...options, fontSizePt: 42 }), /#set text\(size: 42pt,/);
});

test("applies the configured fill color to text and maths", () => {
  assert.match(buildTypstDocument("x", { ...options, color: "#ff8800" }), /fill: rgb\("#ff8800"\)/);
});

test("falls back to black for a non-hex color rather than emitting it verbatim", () => {
  assert.match(buildTypstDocument("x", { ...options, color: "red\") + panic(" }), /fill: rgb\("#000000"\)/);
});

test("inserts the source verbatim when math mode is off", () => {
  const doc = buildTypstDocument("$ a + b $", options);
  assert.ok(doc.endsWith("$ a + b $"));
});

test("wraps the source in display math when math mode is on", () => {
  const doc = buildTypstDocument("a + b", { ...options, mathMode: true });
  assert.ok(doc.endsWith("$\na + b\n$"));
});
