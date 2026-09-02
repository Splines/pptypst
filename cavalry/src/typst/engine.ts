// Must be first: installs the globals the typst.ts wasm glue references while
// its modules are evaluating, which happens on the imports below.
import "./polyfills.ts";

import {
  createTypstCompiler,
  createTypstRenderer,
} from "@myriaddreamin/typst.ts";
import {
  loadFonts,
  withAccessModel,
  withPackageRegistry,
} from "@myriaddreamin/typst.ts/dist/esm/options.init.mjs";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/dist/esm/fs/memory.mjs";
import { NodeFetchPackageRegistry } from "@myriaddreamin/typst.ts/dist/esm/fs/package.node.mjs";

import * as compilerWrapper from "@myriaddreamin/typst-ts-web-compiler";
import * as rendererWrapper from "@myriaddreamin/typst-ts-renderer";

import type { AssetReader } from "../core/assets.ts";
import { type PackageStore, packageRequest } from "../core/packages.ts";
import { buildTypstDocument, type DocumentOptions } from "../core/typst-document.ts";

/**
 * Runs the typst.ts WASM compiler and renderer inside Cavalry's JavaScript
 * engine, mirroring the wiring of the PowerPoint add-in's `web/src/typst.ts`
 * with two Cavalry-specific changes:
 *
 *   - wasm modules and fonts come from disk as bytes (via {@link AssetReader})
 *     rather than being fetched, handed to typst.ts through `getModule`;
 *   - the wasm-bindgen wrappers are supplied through `getWrapper`, so typst.ts
 *     never reaches its dynamic `import()` path;
 *   - `@preview/...` packages are downloaded with `api.WebClient` and cached on
 *     disk (via {@link PackageStore}), since Cavalry has no `XMLHttpRequest`
 *     for the browser registry's synchronous fetch.
 *
 * Cavalry's engine runs JS microtasks but never settles the host promise from
 * async `WebAssembly.instantiate` / `.compile`, so both modules are
 * instantiated synchronously via wasm-bindgen's `initSync` (`new
 * WebAssembly.Module` + `new WebAssembly.Instance`) before typst.ts's own async
 * `init()` runs. It then sees the module is already loaded and returns without
 * ever creating a host promise.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

/** Names of the files the engine loads through its {@link AssetReader}. */
export interface TypstAssetFiles {
  compilerWasm: string;
  rendererWasm: string;
  mathFont: string;
  textFonts: readonly string[];
}

export interface TypstEngineOptions {
  assets: AssetReader;
  /** On-disk cache + downloader for `@preview/...` Typst Universe packages. */
  packages: PackageStore;
  files: TypstAssetFiles;
  /** Preamble, font size, math mode and color are per-render (panel controls); see {@link TypstEngine.render}. */
  document: Omit<DocumentOptions, "preamble" | "fontSizePt" | "mathMode" | "color">;
}

export interface TypstEngine {
  /**
   * Loads the wasm modules and fonts. Called for you by {@link TypstEngine.render}
   * on first use; call it directly to warm up (e.g. on window open) so the wait
   * happens before the user types. Idempotent; a failed load is retried on the
   * next call.
   */
  init(): Promise<void>;
  /**
   * Compiles Typst to an SVG string, initialising on first use. `preamble` is
   * prepended to `source` (see {@link buildTypstDocument}); pass `""` for none.
   */
  render(
    source: string, preamble: string, fontSizePt: number, mathMode: boolean, color: string,
  ): Promise<string>;
}

const MAIN_FILE = "/main.typ";

function formatDiagnostics(diagnostics: readonly unknown[]): string {
  return diagnostics
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const d = entry as { message?: string };
      return d.message ?? JSON.stringify(entry);
    })
    .join("\n");
}

export function createTypstEngine(options: TypstEngineOptions): TypstEngine {
  const { assets, packages, files, document } = options;

  let compiler: any = null;
  let renderer: any = null;
  let ready: Promise<void> | null = null;

  /** First four bytes of every WebAssembly module: "\0asm". */
  const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

  /** See the file header: synchronous instantiation is required in Cavalry. */
  function instantiateWasm(wrapper: any, bytes: Uint8Array, fileName: string): void {
    if (bytes.length < 4 || WASM_MAGIC.some((byte, i) => bytes[i] !== byte)) {
      throw new Error(
        `"${fileName}" is not a valid WebAssembly module -- the PPTypst assets `
        + `are missing or corrupt. Re-copy the "pptypst_assets" folder.`,
      );
    }
    wrapper.initSync({ module: bytes });
  }

  function loadFontBytes(): Uint8Array[] {
    const fonts = [assets.read(files.mathFont)];
    for (const name of files.textFonts) {
      try {
        fonts.push(assets.read(name));
      } catch {
        console.warn(`[pptypst] optional font missing, skipping: ${name}`);
      }
    }
    return fonts;
  }

  function initOnce(): Promise<void> {
    ready ??= (async () => {
      const compilerWasm = assets.read(files.compilerWasm);
      const rendererWasm = assets.read(files.rendererWasm);
      const fonts = loadFontBytes();

      instantiateWasm(compilerWrapper, compilerWasm, files.compilerWasm);
      instantiateWasm(rendererWrapper, rendererWasm, files.rendererWasm);

      compiler = createTypstCompiler();
      const accessModel = new MemoryAccessModel();
      await compiler.init({
        getWrapper: () => Promise.resolve(compilerWrapper),
        getModule: () => compilerWasm,
        beforeBuild: [
          // Fonts are loaded here, as raw bytes, so there is a single compiler
          // wasm instance -- a separate font builder would instantiate the
          // 28 MiB module a second time.
          loadFonts(fonts, { assets: false }),
          withAccessModel(accessModel),
          // Resolves `#import "@preview/..."`: NodeFetchPackageRegistry does the
          // untar + access-model plumbing; `packageRequest` is the synchronous
          // "fetch" it calls, served from the on-disk package cache.
          withPackageRegistry(
            new NodeFetchPackageRegistry(
              accessModel,
              (method: string, url: string) => packageRequest(packages, method, url),
            ),
          ),
        ],
      });

      renderer = createTypstRenderer();
      await renderer.init({
        getWrapper: () => Promise.resolve(rendererWrapper),
        getModule: () => rendererWasm,
      });
    })().catch((error: unknown) => {
      // Drop the cached promise so a later render retries -- e.g. once the user
      // has copied in the missing `pptypst_assets` folder, without reloading.
      ready = null;
      throw error;
    });
    return ready;
  }

  return {
    init: initOnce,
    async render(
      source: string, preamble: string, fontSizePt: number, mathMode: boolean, color: string,
    ): Promise<string> {
      await initOnce();

      // Typst compiles + renders in well under a second, so there is no
      // progress to report here -- only failures surface, as thrown errors.
      compiler.addSource(
        MAIN_FILE,
        buildTypstDocument(source, { ...document, preamble, fontSizePt, mathMode, color }),
      );
      const response = await compiler.compile({ mainFilePath: MAIN_FILE });
      const diagnostics: unknown = response.diagnostics;
      if (Array.isArray(diagnostics) && diagnostics.length > 0) {
        throw new Error(formatDiagnostics(diagnostics));
      }

      const svg: string = await renderer.renderSvg({
        format: "vector",
        artifactContent: response.result as Uint8Array,
        data_selection: { body: true, defs: true, css: true, js: false },
      });
      return svg;
    },
  };
}
