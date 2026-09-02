/**
 * Typst Universe package support: turning a `packages.typst.org` tarball URL
 * into an on-disk cache key, and serving a package request from that cache --
 * downloading it once on a miss.
 *
 * Pure: the disk and network work is delegated to a {@link PackageStore}
 * (implemented in `platform/files.ts` with `api.WebClient` and
 * `api.encodeBinary`). This mirrors `web/src/registry/registry.ts`, which fills
 * the same role for the browser add-in with a synchronous `XMLHttpRequest`.
 */

/** Byte source + sink for cached package tarballs, backed by the filesystem. */
export interface PackageStore {
  /**
   * Bytes of a previously cached tarball, or `null` if it has not been
   * downloaded yet. `key` is a slash-separated relative path such as
   * `"preview/physica-0.9.8.tar.gz"`.
   */
  read(key: string): Uint8Array | null;
  /**
   * Downloads `url`, stores the response body under `key`, and returns its
   * bytes. Throws on any network or filesystem failure.
   */
  download(url: string, key: string): Uint8Array;
}

/** Shape `NodeFetchPackageRegistry` expects back from its `request` function. */
export interface PackageRequestResponse {
  statusCode: number;
  getBody: (_encoding?: unknown) => Uint8Array;
}

/** One path segment of a cache key: a package name, a version, `foo.tar.gz`. */
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Maps a registry URL to its cache key -- the URL path, minus scheme and host:
 * `https://packages.typst.org/preview/physica-0.9.8.tar.gz`
 *   -> `preview/physica-0.9.8.tar.gz`
 *
 * Every segment is checked against {@link SAFE_SEGMENT}, so a hostile package
 * name can't walk out of the cache directory (`..`, absolute paths, and so on).
 */
export function cacheKeyForUrl(url: string): string {
  const afterScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const firstSlash = afterScheme.indexOf("/");
  const path = firstSlash === -1 ? "" : afterScheme.slice(firstSlash + 1);
  const segments = path.split("/").filter(segment => segment.length > 0);
  const unsafe = (segment: string): boolean =>
    segment === "." || segment === ".." || !SAFE_SEGMENT.test(segment);
  if (segments.length === 0 || segments.some(unsafe)) {
    throw new Error(`Refusing to cache a package from an unsafe URL: ${url}`);
  }
  return segments.join("/");
}

/**
 * Serves one package-registry request: a cache hit returns immediately, a miss
 * downloads once (and is cached for next time). Never throws -- a failure comes
 * back as a non-200 status, which `NodeFetchPackageRegistry` turns into a
 * "package not found", matching the browser registry's behaviour.
 */
export function packageRequest(
  store: PackageStore, method: string, url: string,
): PackageRequestResponse {
  const empty = new Uint8Array();
  if (method.toUpperCase() !== "GET") {
    return { statusCode: 405, getBody: () => empty };
  }
  try {
    const key = cacheKeyForUrl(url);
    const bytes = store.read(key) ?? store.download(url, key);
    return { statusCode: 200, getBody: () => bytes };
  } catch (error) {
    console.error(`[pptypst] package request to ${url} failed:`, error);
    return { statusCode: 0, getBody: () => empty };
  }
}
