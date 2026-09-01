/**
 * Runtime configuration for the pasted Cavalry script.
 *
 * The bundle is not fully self-contained: the Typst WASM binaries and font
 * files are far too large to embed in a pasted script, so they live on disk and
 * this points the script at them. Edit `ASSET_DIR` to the absolute path of the
 * `cavalry/assets/vendor/` folder produced by `npm run assets` (or wherever you
 * copied it), then rebuild.
 */

/** Absolute path to the folder holding the vendored wasm + font files. */
export const ASSET_DIR = "C:/Users/domin/AppData/Roaming/Cavalry/Scripts/pptypst_assets/vendor";

/** File names expected inside {@link ASSET_DIR}. */
export const ASSETS = {
  compilerWasm: "typst_ts_web_compiler_bg.wasm",
  rendererWasm: "typst_ts_renderer_bg.wasm",
  mathFont: "math-font.ttf",
  /** Typst's default text fonts (New Computer Modern, Libertinus, DejaVu). */
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
 * Point size passed to `#set text(size: ...)`. Kept as a constant for the
 * prototype; a UI control can set this later.
 */
export const FONT_SIZE_PT = 28;

/**
 * When true, the editor content is wrapped in `$ ... $` display-math delimiters
 * before compiling. Off by default so you can paste arbitrary Typst markup;
 * type your own `$ ... $` for equations.
 */
export const MATH_MODE = false;

/** Key used with `api.setUserData` to stash the raw Typst source on a layer. */
export const USER_DATA_KEY = "pptypst";

/**
 * Naming for the group created for each inserted formula, e.g. "PPTypst:
 * integral_0". See `scene.ts` `buildGroupName`.
 */
export const GROUP_NAME_PREFIX = "PPTypst";
export const GROUP_NAME_MAX_CHARS = 10;
