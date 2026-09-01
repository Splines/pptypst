/**
 * Bundles `src/main.ts` into a single-file IIFE: `dist/pptypst-cavalry.js`.
 *
 * That file is pasted into Cavalry's JavaScript Editor, or shipped inside the
 * plug-in folder assembled by `scripts/pack-plugin.mjs` and copied into the
 * Scripts folder on install.
 *
 *   npm run build                          -> production bundle, no asset override
 *   PPTYPST_ASSET_DIR=/abs/vendor npm run build
 *                                          -> bundle that reads the vendored wasm
 *                                             + fonts from that absolute path,
 *                                             for JavaScript-Editor testing where
 *                                             `ui.scriptLocation` is blank.
 */

import { defineConfig, type Plugin } from "vite";

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

/**
 * `src/main.ts` exports nothing, so Rollup's IIFE build has no `var x = (...)()`
 * wrapper and hoists its minifier helper `var`s (`__publicField` etc.) to the
 * file's top level -- which would leak into Cavalry's shared engine scope when
 * the script is pasted. Wrap the finished chunk in one more IIFE.
 */
function wrapInIife(): Plugin {
  return {
    name: "pptypst:wrap-in-iife",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          chunk.code = `(function(){\n${chunk.code}})();\n`;
        }
      }
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [inlineImportMetaUrl("file:///pptypst"), wrapInIife()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    // Read by `src/config.ts`. Empty in a shipped build -> the script falls back
    // to the `<script folder>/pptypst_assets/vendor` convention.
    "__ASSET_DIR_OVERRIDE__": JSON.stringify(process.env.PPTYPST_ASSET_DIR ?? ""),
  },
  build: {
    emptyOutDir: true,
    target: "es2021",
    sourcemap: false,
    // The bundle carries the whole typst.ts glue; it is meant to be big.
    chunkSizeWarningLimit: 4096,
    minify: "terser",
    terserOptions: {
      compress: { passes: 3 },
      mangle: true,
      // `console.*` stays: the engine reports init progress through it.
      format: { comments: false },
    },
    lib: {
      entry: "src/main.ts",
      formats: ["iife"],
      name: "pptypst",
      fileName: () => "pptypst-cavalry.js",
    },
  },
});
