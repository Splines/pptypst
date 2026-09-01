/**
 * Cavalry filesystem adapter: locating the vendored assets, reading them as
 * bytes, and writing the temporary SVG that `api.convertSVGToLayers` consumes.
 *
 * All `api.*` filesystem access lives here.
 */

import type { AssetReader } from "../core/assets.ts";
import { base64ToBytes } from "../core/base64.ts";
import { ASSET_DIR_CONVENTION, ASSET_DIR_OVERRIDE, PLUGIN, TEMP_SUBDIR } from "../config.ts";

/**
 * Resolves the asset directory, trying in order:
 *
 *   1. `ASSET_DIR_OVERRIDE`, for running the panel straight out of the
 *      JavaScript Editor (where `ui.scriptLocation` is blank);
 *   2. the installed plug-in's own `assets/vendor`, which is where
 *      `npm run build` puts them and how a drag-and-drop install lands;
 *   3. the `pptypst_assets/vendor` convention next to an installed script.
 */
export function resolveAssetDir(): string {
  const candidates: string[] = [];

  if (ASSET_DIR_OVERRIDE) {
    candidates.push(ASSET_DIR_OVERRIDE);
  }
  candidates.push(`${pluginDir()}/${PLUGIN.assetSubdir}`);

  // Mis-typed as `void` by @scenery/cavalry-types; it is a string at runtime.
  const scriptLocation = ui.scriptLocation as unknown as string | undefined;
  if (scriptLocation) {
    candidates.push(`${scriptLocation}/${ASSET_DIR_CONVENTION}`);
  }

  for (const candidate of candidates) {
    if (api.isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Cannot locate the PPTypst assets. Install the plug-in (see README) or set "
    + `ASSET_DIR_OVERRIDE in src/config.ts. Looked in: ${candidates.join(", ")}`,
  );
}

/** Where a drag-and-drop install puts the plug-in folder. */
export function pluginDir(): string {
  return `${api.getAppDataFolder()}/Third-Party/Plugins/${PLUGIN.folder}`;
}

/** An {@link AssetReader} backed by Cavalry's `api.encodeBinary`. */
export function createAssetReader(assetDir = resolveAssetDir()): AssetReader {
  return {
    read(fileName: string): Uint8Array {
      const path = `${assetDir}/${fileName}`;
      const base64 = api.encodeBinary(path);
      if (!base64) {
        throw new Error(`Asset not found or empty: ${path}`);
      }
      return base64ToBytes(base64);
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
