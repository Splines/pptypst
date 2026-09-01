/**
 * Two bundles come out of this one config, selected with `--mode`:
 *
 *   `--mode panel`  ->  dist/panel.js    the editor window + Typst engine.
 *                                        Runs in Cavalry's *script* context,
 *                                        where `api` and `ui` exist.
 *   `--mode shape`  ->  dist/formula.js  the JS Shape plugin script. Runs in
 *                                        the shape sandbox: `cavalry` and `ctx`
 *                                        only -- no `api`, no `ui`, no file or
 *                                        network access.
 *
 * Both are minified IIFEs. `scripts/pack-plugin.mjs` then assembles them, the
 * JSON definitions and the vendored assets into `dist/PPTypst/`.
 */

import { defineConfig, type Plugin } from "vite";

interface Target {
  entry: string;
  /** Output file name, without extension. */
  fileName: string;
  /** Global the IIFE assigns itself to. */
  name: string;
  /**
   * Appended after the bundle. Cavalry takes the value of a plugin script's
   * *last expression* as its result, and an IIFE assigned to a `var` is a
   * declaration, not an expression -- so the shape bundle needs a trailing call.
   */
  footer?: string;
}

const TARGETS: Record<string, Target> = {
  panel: {
    entry: "src/main.ts",
    fileName: "panel",
    name: "pptypstPanel",
  },
  shape: {
    entry: "src/plugin/shape.ts",
    fileName: "formula",
    name: "pptypstShape",
    footer: "pptypstShape.buildFormulaMesh();",
  },
};

/**
 * typst.ts's wasm-bindgen glue reads `import.meta.url` to locate its `.wasm`
 * next to itself. That path is never taken here (the engine calls `initSync`
 * with bytes read off disk), but it has to bundle: `import.meta` is invalid in
 * an IIFE, and Rollup's fallback shim reaches for `document`, which Cavalry
 * has no more than it has `import.meta`.
 */
function inlineImportMetaUrl(url: string): Plugin {
  return {
    name: "pptypst:inline-import-meta-url",
    enforce: "pre",
    transform(code) {
      if (!code.includes("import.meta.url")) {
        return null;
      }
      return { code: code.replaceAll("import.meta.url", JSON.stringify(url)), map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  const target = TARGETS[mode];
  if (!target) {
    throw new Error(`Unknown mode "${mode}"; expected one of: ${Object.keys(TARGETS).join(", ")}`);
  }

  return {
    publicDir: false,
    plugins: [inlineImportMetaUrl("file:///pptypst")],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      // Both modes write into the same folder; `scripts/clean.mjs` empties it
      // once up front instead.
      emptyOutDir: false,
      target: "es2021",
      minify: "esbuild",
      sourcemap: false,
      // The panel bundle carries the whole typst.ts glue; it is meant to be big.
      chunkSizeWarningLimit: 4096,
      lib: {
        entry: target.entry,
        formats: ["iife"],
        name: target.name,
        fileName: () => `${target.fileName}.js`,
      },
      rollupOptions: {
        output: { footer: target.footer },
      },
    },
  };
});
