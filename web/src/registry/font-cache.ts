/**
 * Module for font downloading and caching in the browser.
 *
 * Inspired by the cached font middleware in the typst.ts compiler tempalte:
 * https://github.com/Myriad-Dreamin/typst.ts/blob/2a8b32d8cca70cc4d105fef074d2f35fc7546450/templates/compiler-wasm-cjs/src/cached-font-middleware.cts#L1-L52
 */

const FONT_CACHE_NAME = "typst-font-assets-v1";

/**
 * A fetch wrapper that caches font assets in the browser's Cache API, so the
 * (large) default font assets are downloaded at most once per browser.
 */
export async function cachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);

  if (!("caches" in globalThis) || request.method.toUpperCase() !== "GET") {
    return fetch(request);
  }

  let cache: Cache | null;
  try {
    cache = await caches.open(FONT_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      // 🎈 Cached response
      return cached;
    }
  } catch {
    // No cache access possible
    return fetch(request);
  }

  // 🎈 No cached response
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch {
      // Ignore cache write failures and keep network response.
    }
  }

  return response;
}
