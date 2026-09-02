/**
 * Cavalry filesystem adapter: locating the vendored assets, reading them as
 * bytes, and writing the temporary SVG that `api.convertSVGToLayers` consumes.
 *
 * All `api.*` filesystem access lives here.
 */

import type { AssetReader } from "../core/assets.ts";
import { base64ToBytes } from "../core/base64.ts";
import { ASSET_DIR_CONVENTION, ASSET_DIR_OVERRIDE, TEMP_SUBDIR } from "../config.ts";

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
              + `"pptypst_assets" folder next to the installed script (see README).`,
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
