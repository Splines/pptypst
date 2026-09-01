/**
 * Everything a user may want to tweak, in one place. Pure data only — no
 * Cavalry API calls (see `platform/files.ts` for how the asset directory is
 * actually resolved).
 */

import type { DocumentOptions } from "./core/typst-document.ts";
import type { LayerNameOptions } from "./core/formula.ts";

/**
 * Where the vendored wasm modules and fonts live.
 *
 * Leave empty to use the Cavalry convention: a `pptypst_assets/vendor` folder
 * next to the installed script (`<Cavalry Scripts>/pptypst_assets/vendor`).
 * That only works when the script is run from the Scripts menu — `ui.scriptLocation`
 * is blank when pasting into the JavaScript Editor — so set an absolute path
 * here for editor-based testing.
 */
export const ASSET_DIR_OVERRIDE: string = "C:/Users/domin/AppData/Roaming/Cavalry/Scripts/pptypst_assets/vendor";

/** Folder name looked for next to an installed script when no override is set. */
export const ASSET_DIR_CONVENTION = "pptypst_assets/vendor";

/** Files expected inside the resolved asset directory (see `npm run assets`). */
export const ASSET_FILES = {
  compilerWasm: "typst_ts_web_compiler_bg.wasm",
  rendererWasm: "typst_ts_renderer_bg.wasm",
  /** Always loaded; PPTypst's bundled math font. */
  mathFont: "math-font.ttf",
  /** Typst's default text fonts. Individually optional — a missing one is skipped. */
  textFonts: [
    "LibertinusSerif-Regular.otf",
    "LibertinusSerif-Bold.otf",
    "LibertinusSerif-Italic.otf",
    "LibertinusSerif-BoldItalic.otf",
    "NewCM10-Regular.otf",
    "NewCM10-Bold.otf",
    "NewCM10-Italic.otf",
    "NewCM10-BoldItalic.otf",
    "NewCMMath-Regular.otf",
    "NewCMMath-Bold.otf",
    "DejaVuSansMono.ttf",
  ],
} as const;

/** How the user's source is wrapped into a compilable Typst document. */
export const DOCUMENT: DocumentOptions = {
  fontSizePt: 28,
  mathMode: false,
};

/** How the group created for each formula is named. */
export const LAYER_NAME: LayerNameOptions = {
  maxSourceChars: 20,
};

/** Name given to every vector layer inside a formula group. */
export const SHAPE_LAYER_NAME = "Typst Shape";

/** `api.setUserData` key under which a formula's source is stored on its group. */
export const USER_DATA_KEY = "pptypst";

/** Subfolder of the system temp directory used for SVG hand-off files. */
export const TEMP_SUBDIR = "pptypst";
