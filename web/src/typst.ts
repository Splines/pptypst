/**
 * Typst.ts integration for compiling and rendering Typst code to SVG.
 *
 * This makes use of the typst.ts library by Myriad Dreamin:
 * https://myriad-dreamin.github.io/typst.ts/
 */

import type * as typstWeb from "@myriaddreamin/typst.ts";
import { createTypstCompiler, createTypstRenderer } from "@myriaddreamin/typst.ts";
import {
  disableDefaultFontAssets,
  loadFonts,
  withPackageRegistry,
  withAccessModel,
} from "@myriaddreamin/typst.ts/dist/esm/options.init.mjs";
import { NodeFetchPackageRegistry } from "@myriaddreamin/typst.ts/dist/esm/fs/package.node.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/dist/esm/fs/memory.mjs";
import { cachedFontInitOptions } from "./registry/font-cache";

// @ts-expect-error ?url import
import mathFontUrl from "/math-font.ttf?url";

// @ts-expect-error WASM module import
import typstCompilerWasm from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url";
// @ts-expect-error WASM module import
import typstRendererWasm from "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url";
import { registryRequest } from "./registry/registry";
import { TypstSource } from "./payload.js";

let compiler: typstWeb.TypstCompiler;
let renderer: typstWeb.TypstRenderer;

/**
 * Initializes both the Typst compiler and renderer.
 */
export async function initTypst() {
  await initCompiler();
  await initRenderer();
}

/**
 * Initializes the Typst compiler.
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      loadFonts([mathFontUrl]),
      ...cachedFontInitOptions().beforeBuild,
      withAccessModel(accessModel),
      withPackageRegistry(
        new NodeFetchPackageRegistry(accessModel, registryRequest),
      ),
    ],
  });
  console.log("Typst compiler initialized");
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
