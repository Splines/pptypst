/**
 * Everything a user may want to tweak, in one place. Pure data only — no
 * Cavalry API calls (see `platform/files.ts` for how the asset directory is
 * actually resolved).
 */

import type { DocumentOptions } from "./core/typst-document.ts";
import type { LayerNameOptions } from "./core/formula.ts";
import type { FontSizeReference } from "./core/font-size.ts";

/**
 * Where the vendored wasm modules and fonts live.
 *
 * Baked in at build time from the `PPTYPST_ASSET_DIR` env var (see
 * `vite.config.ts`). Empty in a shipped build, which makes the script fall back
 * to the Cavalry convention: a `pptypst_assets/vendor` folder next to the
 * installed script (`<Cavalry Scripts>/pptypst_assets/vendor`). That convention
 * only works when the script is run from the Scripts menu — `ui.scriptLocation`
 * is blank when pasting into the JavaScript Editor — so for editor testing
 * build with `PPTYPST_ASSET_DIR=/abs/path/to/vendor npm run build`.
 */
declare const __ASSET_DIR_OVERRIDE__: string | undefined;
export const ASSET_DIR_OVERRIDE: string
  = typeof __ASSET_DIR_OVERRIDE__ === "string" ? __ASSET_DIR_OVERRIDE__ : "";

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

/**
 * How the user's source is wrapped into a compilable Typst document. Font
 * size, "Only Math" and the fill color are not fixed here -- they all come
 * from the panel (the Size input seeded per {@link FONT_SIZE_REFERENCE}, the
 * "Only Math" checkbox and the Color chip, both seeded from saved preferences
 * or the active composition).
 */
export const DOCUMENT: Omit<DocumentOptions, "fontSizePt" | "mathMode" | "color"> = {};

/**
 * Point size that looks right in a 2160-tall (4K) composition; the panel
 * scales it for the active composition's actual resolution (see
 * `core/font-size.ts`). Unlike the PowerPoint add-in's fixed 28pt, Cavalry
 * scenes commonly run at 4K+, where 28pt reads as illegibly small.
 */
export const FONT_SIZE_REFERENCE: FontSizeReference = { pt: 150, heightPx: 2160 };

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
