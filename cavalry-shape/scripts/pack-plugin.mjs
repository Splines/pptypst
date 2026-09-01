/**
 * Assembles the installable plug-in folder from the two Vite bundles, the JSON
 * definitions and the vendored assets:
 *
 *   dist/PPTypst/
 *     definitions.json   strings.json   setup.js   welcome.js   (from plugin/)
 *     formula.js                                   (Vite, --mode shape)
 *     panel.js                                     (Vite, --mode panel)
 *     assets/vendor/                               (npm run assets)
 *
 * Drag that folder into the Cavalry window to install it.
 */

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const out = join(dist, "PPTypst");

const PLUGIN_FILES = ["definitions.json", "strings.json", "setup.js", "welcome.js"];
const BUNDLES = ["formula.js", "panel.js"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sizeOf(path) {
  return (await stat(path)).size;
}

function human(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

await mkdir(out, { recursive: true });

for (const name of PLUGIN_FILES) {
  await cp(join(root, "plugin", name), join(out, name));
}

for (const name of BUNDLES) {
  const from = join(dist, name);
  if (!(await exists(from))) {
    throw new Error(`Missing ${name}; run \`npm run build\` rather than this script alone.`);
  }
  await cp(from, join(out, name));
  console.log(`  ${name.padEnd(12)} ${human(await sizeOf(from))}`);
}

const vendor = join(root, "assets", "vendor");
if (await exists(vendor)) {
  await cp(vendor, join(out, "assets", "vendor"), { recursive: true });
  const files = await readdir(join(out, "assets", "vendor"));
  console.log(`  assets/vendor  ${String(files.length)} files`);
} else {
  console.warn("  assets/vendor  MISSING -- run `npm run assets` before installing.");
}

console.log(`\nplug-in assembled at ${out}`);
console.log("Drag it into the Cavalry window to install.");
