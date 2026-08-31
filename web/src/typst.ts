/**
 * Typst.ts integration for compiling and rendering Typst code to SVG.
 *
 * This makes use of the typst.ts library by Myriad Dreamin:
 * https://myriad-dreamin.github.io/typst.ts/
 */

import type * as typstWeb from "@myriaddreamin/typst.ts";
import {
  createTypstCompiler,
  createTypstFontBuilder,
  createTypstRenderer,
} from "@myriaddreamin/typst.ts";
import {
  disableDefaultFontAssets,
  _resolveAssets,
  withPackageRegistry,
  withAccessModel,
} from "@myriaddreamin/typst.ts/dist/esm/options.init.mjs";
import { NodeFetchPackageRegistry } from "@myriaddreamin/typst.ts/dist/esm/fs/package.node.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/dist/esm/fs/memory.mjs";
import { cachedFetch } from "./registry/font-cache";

// @ts-expect-error ?url import
import mathFontUrl from "/math-font.ttf?url";

// @ts-expect-error WASM module import
import typstCompilerWasm from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
// @ts-expect-error WASM module import
import typstRendererWasm from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";
import { registryRequest } from "./registry/registry";
import { getUserFontData } from "./registry/user-fonts.js";
import { TypstSource } from "./payload.js";

let compiler: typstWeb.TypstCompiler;
let renderer: typstWeb.TypstRenderer;

// Base font bytes, fetched once and reused to rebuild the font set whenever the
// user adds or removes a custom font: the bundled math font plus Typst's
// default text/cjk/emoji assets.
let mathFontData: Uint8Array | null = null;
let assetFontData: Uint8Array[] = [];

/**
 * Initializes both the Typst compiler and renderer.
 */
export async function initTypst() {
  await initCompiler();
  await loadBaseFontData();
  await applyFonts();
  await initRenderer();
}

/**
 * Rebuilds the compiler's font set from the base fonts plus the current user
 * fonts (see {@link getUserFontData}) and hands it over via
 * `compiler.setFonts(...)`. Call this after adding or removing a custom font.
 *
 * Unlike a full re-init, this neither reloads the WASM module nor re-downloads
 * any fonts; it only rebuilds the font resolver from in-memory bytes.
 */
export async function reloadCompilerFonts() {
  await applyFonts();
}

/**
 * Initializes the Typst compiler. No fonts are loaded here; they are supplied
 * via {@link applyFonts} using `setFonts`. `disableDefaultFontAssets()` is kept
 * only to satisfy typst.ts's requirement that at least one font loader is
 * present in `beforeBuild`.
 *
 * See also https://myriad-dreamin.github.io/typst.ts/cookery/guide/all-in-one.html#label-Initializing%20using%20the%20low-level%20API
 * And https://github.com/Myriad-Dreamin/typst.ts/blob/2a8b32d8cca70cc4d105fef074d2f35fc7546450/templates/compiler-wasm-cjs/src/main.package.cts#L20-L39
 */
async function initCompiler() {
  compiler = createTypstCompiler();
  const accessModel = new MemoryAccessModel();
  await compiler.init({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    getModule: () => typstCompilerWasm,
    beforeBuild: [
      disableDefaultFontAssets(),
      withAccessModel(accessModel),
      withPackageRegistry(
        new NodeFetchPackageRegistry(accessModel, registryRequest),
      ),
    ],
  });
  console.log("Typst compiler initialized");
}

/**
 * Fetches the base font bytes once (bundled math font + Typst's default
 * text/cjk/emoji assets), via the cached fetcher so assets are downloaded at
 * most once and then served from the browser cache.
 */
async function loadBaseFontData() {
  if (mathFontData) {
    return;
  }
  const fetchBytes = async (url: string) =>
    new Uint8Array(await (await cachedFetch(url)).arrayBuffer());

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  mathFontData = await fetchBytes(mathFontUrl);
  const assetUrls = _resolveAssets({ assets: ["text", "cjk", "emoji"] });
  assetFontData = await Promise.all(assetUrls.map(fetchBytes));
}

/**
 * Builds a font resolver containing the base fonts plus the user fonts and sets
 * it on the compiler. User fonts are inserted before the CJK/emoji assets so
 * they win font fallback (matching the previous `loadFonts()` ordering).
 */
async function applyFonts() {
  const builder = createTypstFontBuilder();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  await builder.init({ getModule: () => typstCompilerWasm });

  if (mathFontData) {
    await builder.addFontData(mathFontData);
  }
  for (const data of getUserFontData()) {
    await builder.addFontData(data);
  }
  for (const data of assetFontData) {
    await builder.addFontData(data);
  }

  await builder.build((resolver) => {
    compiler.setFonts(resolver);
    return Promise.resolve();
  });
}

/**
 * Initializes the Typst renderer.
 *
 * See also https://myriad-dreamin.github.io/typst.ts/cookery/guide/all-in-one.html#label-Initializing%20using%20the%20low-level%20API
 */
async function initRenderer() {
  renderer = createTypstRenderer();
  await renderer.init({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    getModule: () => typstRendererWasm,
  });
  console.log("Typst renderer initialized");
}

/**
 * Builds the complete Typst code with page setup and font size.
 *
 * @param source The user's Typst source
 * @param fontSize Font size in points
 * @param mathMode Whether to wrap the code in display math delimiters
 * @returns Complete Typst code ready for compilation
 */
function buildRawTypstString(source: TypstSource, fontSize: string, mathMode: boolean): string {
  let body = source.body;
  if (mathMode) {
    body = `$\n${source.body}\n$`;
  }

  const separator = source.preamble && body && !source.preamble.endsWith("\n") ? "\n" : "";
  const compiledUserSource = `${source.preamble}${separator}${body}`;
  return "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)"
    + `\n#set text(size: ${fontSize}pt)\n${compiledUserSource}`;
}

export interface CompilationResult {
  svg: string | null;
  diagnostics: Diagnostics;
}

/**
 * Diagnostic message structure returned by the Typst compiler.
 *
 * See https://github.com/Myriad-Dreamin/typst.ts/blob/3fe6e3caefaab9947689f162c8ea8b193944eef3/packages/typst.ts/src/compiler.mts#L24-L43
 * Unfortunately the interface is not exported directly from the package,
 * so we redefine it here.
 */
export interface DiagnosticMessage {
  package: string;
  path: string;
  severity: string;
  range: string;
  message: string;
}

export type Diagnostics = (string | DiagnosticMessage)[] | undefined;

/**
 * Compiles the given Typst source to SVG.
 */
export async function typst(
  source: TypstSource, fontSize: string, mathMode: boolean,
): Promise<CompilationResult> {
  const mainFilePath = "/main.typ";
  const builtSource = buildRawTypstString(source, fontSize, mathMode);
  compiler.addSource(mainFilePath, builtSource);
  const response = await compiler.compile({ mainFilePath });
  const diagnostics: Diagnostics = response.diagnostics;

  if (diagnostics && diagnostics.length > 0) {
    console.warn("Typst compilation diagnostics:", diagnostics);
    return { svg: null, diagnostics };
  }

  const artifactContent = response["result"] as Uint8Array<ArrayBuffer>;
  const svg = await renderer.renderSvg({
    format: "vector",
    artifactContent: artifactContent,
    data_selection: {
      body: true,
      defs: true,
      css: true,
      js: false,
    },
  });

  return { svg, diagnostics };
}
