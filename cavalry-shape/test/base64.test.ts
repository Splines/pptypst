import test from "node:test";
import assert from "node:assert/strict";

import { base64ToBytes } from "../src/core/base64.ts";

test("decodes a known string", () => {
  const bytes = base64ToBytes("SGVsbG8sIHdvcmxkIQ==");
  assert.equal(Buffer.from(bytes).toString("utf8"), "Hello, world!");
});

test("handles all three padding cases", () => {
  for (const text of ["a", "ab", "abc", "abcd", "abcde"]) {
    const encoded = Buffer.from(text, "utf8").toString("base64");
    assert.deepEqual(Buffer.from(base64ToBytes(encoded)), Buffer.from(text, "utf8"), text);
  }
});

test("round-trips arbitrary binary data", () => {
  const original = Buffer.alloc(4096);
  for (let i = 0; i < original.length; i++) {
    original[i] = (i * 7 + (i >> 3)) & 0xff;
  }
  const decoded = base64ToBytes(original.toString("base64"));
  assert.equal(decoded.length, original.length);
  assert.ok(Buffer.from(decoded).equals(original));
});

test("tolerates embedded whitespace", () => {
  const encoded = Buffer.from("wrapped output", "utf8").toString("base64");
  const wrapped = encoded.replace(/(.{4})/g, "$1\n");
  assert.equal(Buffer.from(base64ToBytes(wrapped)).toString("utf8"), "wrapped output");
});
