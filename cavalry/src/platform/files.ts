/**
 * Cavalry filesystem adapter: locating the vendored assets, reading them as
 * bytes, and writing the temporary SVG that `api.convertSVGToLayers` consumes.
 *
 * All `api.*` filesystem access lives here.
 */

import type { AssetReader } from "../core/assets.ts";
import type { PackageStore } from "../core/packages.ts";
import { base64ToBytes } from "../core/base64.ts";
import {
  ASSET_DIR_CONVENTION,
  ASSET_DIR_OVERRIDE,
  PACKAGE_CACHE_DIR_NAME,
  TEMP_SUBDIR,
} from "../config.ts";

/**
 * Resolves the asset directory: the configured override if set, otherwise the
 * `<script folder>/pptypst_assets/vendor` convention.
 *
 * `ui.scriptLocation` is blank when a script is run from the JavaScript Editor
 * rather than the Scripts menu, which is why the override exists.
 */
export function resolveAssetDir(): string {
  if (ASSET_DIR_OVERRIDE) {
    return ASSET_DIR_OVERRIDE;
  }
  // Mis-typed as `void` by @scenery/cavalry-types; it is a string at runtime.
  const scriptLocation = ui.scriptLocation as unknown as string | undefined;
  if (!scriptLocation) {
    throw new Error(
      "Cannot locate the PPTypst assets: this script is not running from the "
      + "Scripts folder, so set ASSET_DIR_OVERRIDE in src/config.ts.",
    );
  }
  return `${scriptLocation}/${ASSET_DIR_CONVENTION}`;
}

/** An {@link AssetReader} backed by Cavalry's `api.encodeBinary`. */
export function createAssetReader(assetDir = resolveAssetDir()): AssetReader {
  return {
    read(fileName: string): Uint8Array {
      const path = `${assetDir}/${fileName}`;
      if (!api.isFile(path)) {
        // The vendored assets are not bundled with the script -- the user copies
        // the `pptypst_assets` folder in by hand (see README). A missing folder
        // is the common cause; call it out so the error isn't a cryptic wasm
        // "expected magic word" further down the line.
        throw new Error(
          api.isDirectory(assetDir)
            ? `PPTypst asset file is missing: ${path}`
            : `PPTypst assets folder not found at "${assetDir}". Copy the `
              + `"pptypst_assets" folder next to the installed script.`,
        );
      }
      const base64 = api.encodeBinary(path);
      if (!base64) {
        throw new Error(`PPTypst asset could not be read (empty): ${path}`);
      }
      return base64ToBytes(base64);
    },
  };
}

/**
 * Resolves the Typst package cache directory: a `packages/` folder sitting next
 * to the vendored-asset `vendor/` folder, i.e. `.../pptypst_assets/packages`.
 * Built off {@link resolveAssetDir} so the `ASSET_DIR_OVERRIDE` /
 * `ui.scriptLocation` handling is shared -- `api.getFolderFromPath` strips the
 * trailing `vendor` component (it works on folder paths, not just files).
 */
export function resolvePackageCacheDir(): string {
  return `${api.getFolderFromPath(resolveAssetDir())}/${PACKAGE_CACHE_DIR_NAME}`;
}

/** Splits `https://host/a/b` into `{ origin: "https://host", path: "/a/b" }`. */
function splitUrl(url: string): { origin: string; path: string } {
  const schemeEnd = url.indexOf("://");
  if (schemeEnd === -1) {
    throw new Error(`Malformed package URL: ${url}`);
  }
  const pathStart = url.indexOf("/", schemeEnd + 3);
  return pathStart === -1
    ? { origin: url, path: "/" }
    : { origin: url.slice(0, pathStart), path: url.slice(pathStart) };
}

/**
 * `api.WebClient` as it behaves at runtime: @scenery/cavalry-types declares
 * `get`, `status` and `body` as returning `void`, but they return values.
 */
interface WebClientRuntime {
  get(path: string): void;
  status(): number;
  writeBodyToBinaryFile(path: string): void;
}

/** Creates `cacheDir` and every intermediate folder of `key`'s directory. */
function ensureKeyDir(cacheDir: string, key: string): void {
  const parts = key.split("/");
  parts.pop(); // drop the filename; only the directories need creating
  let dir = cacheDir;
  if (!api.isDirectory(dir)) {
    api.makeFolder(dir);
  }
  for (const part of parts) {
    dir = `${dir}/${part}`;
    if (!api.isDirectory(dir)) {
      api.makeFolder(dir);
    }
  }
}

/**
 * A {@link PackageStore} backed by `api.WebClient` for downloads and
 * `api.encodeBinary` for cache reads. Tarballs land at
 * `<cacheDir>/<namespace>/<name>-<version>.tar.gz`, created on demand.
 *
 * `api.WebClient` is synchronous (issue the request, then read `status()` /
 * write the body), which is what the registry's `pullPackageData` contract
 * needs. Using the network may prompt Cavalry for permission the first time.
 */
export function createPackageStore(cacheDir = resolvePackageCacheDir()): PackageStore {
  function readKey(key: string): Uint8Array | null {
    const path = `${cacheDir}/${key}`;
    if (!api.isFile(path)) {
      return null;
    }
    const base64 = api.encodeBinary(path);
    return base64 ? base64ToBytes(base64) : null;
  }

  return {
    read: readKey,
    download(url: string, key: string): Uint8Array {
      const dest = `${cacheDir}/${key}`;
      ensureKeyDir(cacheDir, key);

      const { origin, path } = splitUrl(url);
      const client = new api.WebClient(origin) as unknown as WebClientRuntime;
      client.get(path);
      const status = client.status();
      if (status !== 200) {
        throw new Error(`GET ${url} returned HTTP ${String(status)}`);
      }
      // A .tar.gz is binary, so it cannot go through `api.writeToFile`.
      client.writeBodyToBinaryFile(dest);

      const bytes = readKey(key);
      if (!bytes || bytes.length === 0) {
        throw new Error(`Downloaded package could not be cached at "${dest}"`);
      }
      return bytes;
    },
  };
}

/**
 * Returns PPTypst's folder under the system temp directory, creating it if
 * needed. `api.writeToFile` does not create missing parent directories — it
 * fails silently and logs "Saving File [Failed]" in Cavalry.
 */
export function ensureTempDir(): string {
  const dir = `${api.getTempFolder()}/${TEMP_SUBDIR}`;
  if (!api.isDirectory(dir)) {
    api.makeFolder(dir);
  }
  return dir;
}

/** Writes `contents` to a uniquely named file in the temp folder and returns its path. */
export function writeTempFile(extension: string, contents: string): string {
  const path = `${ensureTempDir()}/${String(Date.now())}.${extension}`;
  if (!api.writeToFile(path, contents, true)) {
    throw new Error(`Could not write ${path}`);
  }
  return path;
}
