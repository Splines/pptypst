/**
 * Everything a user may want to tweak, in one place. Pure data only — no
 * Cavalry API calls (see `platform/files.ts` for how the asset directory is
 * actually resolved).
 */

import type { DocumentOptions } from "./core/typst-document.ts";
import type { GeometryOptions } from "./core/geometry.ts";
import type { LayerNameOptions } from "./core/formula.ts";
import type { FontSizeReference } from "./core/font-size.ts";

/**
 * The plug-in, as Cavalry knows it. `layerType` and the attribute ids must
 * match `plugin/definitions.json` exactly — they are the contract between the
 * panel (which writes them with `api.set`) and the shape script (which reads
 * them as globals).
 */
export const PLUGIN = {
  /** Folder name under `<AppData>/Cavalry/Third-Party/Plugins`. */
  folder: "PPTypst",
  /** `author` in definitions.json and strings.json. */
  author: "pptypst",
  /**
   * The string `api.create` and `api.getLayerType` speak. Cavalry namespaces
   * third-party types as `<author>::<type>` — undocumented, and confirmed with
   * `api.getAllLayerTypes` (see `tools/probe.js`); a bare `pptypstFormula`
   * silently creates nothing.
   */
  layerType: "pptypst::pptypstFormula",
  /** `type` in definitions.json, i.e. {@link layerType} without the namespace. */
  bareLayerType: "pptypstFormula",
  /** Where the assets sit inside the installed plug-in folder. */
  assetSubdir: "assets/vendor",
  attributes: {
    source: "typstSource",
    fontSize: "typstFontSize",
    geometry: "typstGeometry",
    colours: "typstColours",
  },
} as const;

/**
 * Scene-space quirks.
 *
 * `flipY` negates y when outlines are turned into paths. Typst's SVG is
 * y-down; if formulas land in the scene upside down, this is the one switch to
 * flip. `platform/preview.ts` is unaffected — `ui.Draw` has its own, separately
 * handled, y-up space.
 */
export const SCENE = { flipY: false };

/** How outlines are trimmed on the way onto the layer. */
export const GEOMETRY: GeometryOptions = {
  // Typst emits three decimals in units of roughly a point; two keeps the
  // payload (and so the .cv file) about a tenth smaller with no visible change.
  precision: 2,
};

/**
 * Where the vendored wasm modules and fonts live.
 *
 * Leave empty to search, in order: the installed plug-in folder
 * (`<AppData>/Cavalry/Third-Party/Plugins/PPTypst/assets/vendor`), then the
 * `pptypst_assets/vendor` convention next to an installed script. Set an
 * absolute path here when running the panel straight from the JavaScript
 * Editor, where `ui.scriptLocation` is blank.
 */
export const ASSET_DIR_OVERRIDE: string = "";

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
 * size is not fixed here -- it comes from the panel's Size input, seeded per
 * {@link FONT_SIZE_REFERENCE}.
 */
export const DOCUMENT: Omit<DocumentOptions, "fontSizePt"> = {
  mathMode: false,
};

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

/** Name given to every vector layer produced by "Break Apart". */
export const SHAPE_LAYER_NAME = "Typst Shape";

/**
 * `api.setUserData` key a v2 formula group was tagged with. Only read now, so
 * scenes made before the plug-in existed can still be recognised.
 */
export const LEGACY_USER_DATA_KEY = "pptypst";

/** Subfolder of the system temp directory used for SVG hand-off files. */
export const TEMP_SUBDIR = "pptypst";
