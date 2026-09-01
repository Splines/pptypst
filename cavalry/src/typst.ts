/**
 * Runs the typst.ts WASM compiler + renderer directly inside Cavalry's
 * JavaScript engine, mirroring the low-level wiring of the PowerPoint add-in's
 * `web/src/typst.ts` (`initCompiler` / `applyFonts` / `initRenderer` / `typst`),
 * with two changes for Cavalry:
 *   - the WASM binaries and fonts are read from disk (`api.encodeBinary` ->
 *     base64 -> bytes) instead of fetched, and handed to typst.ts via `getModule`;
 *   - the `@myriaddreamin/typst-ts-*` wasm-bindgen wrappers are supplied through
 *     `getWrapper` so typst.ts never hits its dynamic `import()` path.
 *
 * Cavalry's engine runs JS microtasks but does not pump the host promise
 * returned by async `WebAssembly.instantiate` / `.compile`, so both wasm
 * modules are instantiated synchronously via wasm-bindgen's `initSync`
 * (`new WebAssembly.Module` + `new WebAssembly.Instance`) before typst.ts's own
 * async `init()` runs; it then sees the module is already loaded and returns
 * immediately without ever creating a host promise.
 */

import "./polyfills";
import { base64ToBytes } from "./polyfills";

import {
  createTypstCompiler,
  createTypstRenderer,
} from "@myriaddreamin/typst.ts";
import {
  loadFonts,
  withAccessModel,
} from "@myriaddreamin/typst.ts/dist/esm/options.init.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/dist/esm/fs/memory.mjs";

import * as compilerWrapper from "@myriaddreamin/typst-ts-web-compiler";
import * as rendererWrapper from "@myriaddreamin/typst-ts-renderer";

import { ASSET_DIR, ASSETS } from "./config";
import { buildTypstDocument } from "./wrap";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

const MAIN_FILE = "/main.typ";

let compiler: any = null;
let renderer: any = null;
let initPromise: Promise<void> | null = null;

export type ProgressReporter = (_message: string) => void;

let reportProgress: ProgressReporter = (m) => {
  console.log(`[pptypst] ${m}`);
};

/** Lets the UI show live progress (compiling/rendering can take a few seconds). */
export function onProgress(fn: ProgressReporter): void {
  reportProgress = (m) => {
    console.log(`[pptypst] ${m}`);
    fn(m);
  };
}

/** Synchronously instantiates a wasm-bindgen module (see file header). */
function syncInit(wrapper: any, bytes: Uint8Array, label: string): void {
  reportProgress(`compiling ${label} wasm (synchronous) ...`);
  wrapper.initSync({ module: bytes });
  reportProgress(`${label} wasm instantiated`);
}

/** Reads a vendored asset from disk and returns its raw bytes. */
function readAssetBytes(fileName: string): Uint8Array {
  const path = `${ASSET_DIR}/${fileName}`;
  reportProgress(`reading ${fileName} ...`);
  const b64 = api.encodeBinary(path);
  if (!b64) {
    throw new Error(`asset not found or empty: ${path}`);
  }
  const bytes = base64ToBytes(b64);
  reportProgress(`read ${fileName} (${String(Math.round(bytes.length / 1024))} KiB)`);
  return bytes;
}

function initOnce(): Promise<void> {
  initPromise ??= (async () => {
    const compilerWasm = readAssetBytes(ASSETS.compilerWasm);
    const rendererWasm = readAssetBytes(ASSETS.rendererWasm);

    const fontData: Uint8Array[] = [readAssetBytes(ASSETS.mathFont)];
    for (const name of ASSETS.textFonts) {
      try {
        fontData.push(readAssetBytes(name));
      } catch {
        console.warn(`[pptypst] optional font missing, skipping: ${name}`);
      }
    }

    syncInit(compilerWrapper, compilerWasm, "compiler");
    syncInit(rendererWrapper, rendererWasm, "renderer");

    compiler = createTypstCompiler();
    reportProgress(`loading compiler + ${String(fontData.length)} fonts ...`);
    await compiler.init({
      getWrapper: () => Promise.resolve(compilerWrapper),
      getModule: () => compilerWasm,
      beforeBuild: [
        // Load fonts here (as raw bytes) so there is a single compiler wasm
        // instance -- a separate font builder would instantiate the 28 MiB
        // module a second time.
        loadFonts(fontData, { assets: false }),
        withAccessModel(new MemoryAccessModel()),
      ],
    });
    reportProgress("compiler + fonts ready");

    renderer = createTypstRenderer();
    reportProgress("loading renderer ...");
    await renderer.init({
      getWrapper: () => Promise.resolve(rendererWrapper),
      getModule: () => rendererWasm,
    });

    reportProgress("typst.ts WASM initialised");
  })();
  return initPromise;
}

/** Formats typst.ts diagnostics into a single readable string. */
function formatDiagnostics(diagnostics: unknown): string {
  if (!Array.isArray(diagnostics)) {
    return String(diagnostics);
  }
  return diagnostics
    .map((d) => {
      if (typeof d === "string") return d;
      const m = d as { severity?: string; message?: string; range?: string };
      return `${m.severity ?? "error"}${m.range ? ` [${m.range}]` : ""}: ${m.message ?? JSON.stringify(d)}`;
    })
    .join("\n");
}

/**
 * Compiles `editorText` (the raw Typst the user typed) to an SVG string.
 * Throws with a readable message on compile failure.
 */
export async function renderTypstToSvg(editorText: string): Promise<string> {
  await initOnce();

  reportProgress("compiling Typst ...");
  compiler.addSource(MAIN_FILE, buildTypstDocument(editorText));
  const response = await compiler.compile({ mainFilePath: MAIN_FILE });
  const diagnostics: unknown = response.diagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    throw new Error(formatDiagnostics(diagnostics));
  }

  reportProgress("rendering SVG ...");
  const artifactContent = response.result as Uint8Array;
  const svg: string = await renderer.renderSvg({
    format: "vector",
    artifactContent,
    data_selection: { body: true, defs: true, css: true, js: false },
  });
  return svg;
}
