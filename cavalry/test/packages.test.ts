import test from "node:test";
import assert from "node:assert/strict";

import { cacheKeyForUrl, packageRequest, type PackageStore } from "../src/core/packages.ts";

const PHYSICA_URL = "https://packages.typst.org/preview/physica-0.9.8.tar.gz";

test("cacheKeyForUrl keeps the URL path, dropping scheme and host", () => {
  assert.equal(cacheKeyForUrl(PHYSICA_URL), "preview/physica-0.9.8.tar.gz");
});

test("cacheKeyForUrl rejects a path that would escape the cache directory", () => {
  assert.throws(() => cacheKeyForUrl("https://packages.typst.org/preview/../../etc/passwd"));
  assert.throws(() => cacheKeyForUrl("https://packages.typst.org/"));
});

function fakeStore(overrides: Partial<PackageStore> = {}): PackageStore {
  return {
    read: () => null,
    download: () => {
      throw new Error("download should not have been called");
    },
    ...overrides,
  };
}

test("packageRequest serves a cache hit without downloading", () => {
  const cached = new Uint8Array([1, 2, 3]);
  const response = packageRequest(fakeStore({ read: () => cached }), "GET", PHYSICA_URL);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.getBody(), cached);
});

test("packageRequest downloads once on a cache miss, under the URL-derived key", () => {
  const downloaded = new Uint8Array([9, 9]);
  let seenKey: string | undefined;
  const response = packageRequest(
    fakeStore({
      download: (_url, key) => {
        seenKey = key;
        return downloaded;
      },
    }),
    "GET",
    PHYSICA_URL,
  );
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.getBody(), downloaded);
  assert.equal(seenKey, "preview/physica-0.9.8.tar.gz");
});

test("packageRequest reports a failed download as a non-200 status, not a throw", (t) => {
  t.mock.method(console, "error", () => {}); // the failure is logged; keep test output clean
  const response = packageRequest(
    fakeStore({
      download: () => {
        throw new Error("network down");
      },
    }),
    "GET",
    PHYSICA_URL,
  );
  assert.equal(response.statusCode, 0);
  assert.equal(response.getBody().length, 0);
});

test("packageRequest only answers GET", () => {
  const response = packageRequest(fakeStore(), "POST", PHYSICA_URL);
  assert.equal(response.statusCode, 405);
});
