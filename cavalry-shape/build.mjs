/**
 * Bundles `src/main.ts` into a single-file IIFE script that can be pasted
 * straight into Cavalry's JavaScript Editor: `dist/pptypst-cavalry.js`.
 *
 * Run with: npm run build
 */

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "dist");
await mkdir(outDir, { recursive: true });

const outfile = join(outDir, "pptypst-cavalry.js");

await build({
  entryPoints: [join(here, "src/main.ts")],
  outfile,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2021",
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
  // `api`, `ui`, `cavalry`, `console` are provided by Cavalry's runtime.
  // Kill the browser/node-only fallbacks in the typst.ts glue so nothing tries
  // to touch `import.meta`.
  define: {
    "import.meta.url": JSON.stringify("file:///pptypst"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

console.log(`built ${outfile}`);
