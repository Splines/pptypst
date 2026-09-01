/**
 * Bundles the Vite build and the vendored assets into one zip the user unpacks
 * straight into their Cavalry Scripts folder:
 *
 *   dist/PPTypst/                 (staging dir, also left on disk to browse)
 *     PPTypst.js                  (dist/pptypst-cavalry.js, from `npm run build`)
 *     pptypst_assets/vendor/      (assets/vendor/, from `npm run assets`)
 *   dist/PPTypst.zip              (the two entries above, at the archive root)
 *
 * Install: unpack `dist/PPTypst.zip` into the Cavalry Scripts folder
 *   macOS    ~/Library/Application Support/Cavalry/Scripts
 *   Windows  %APPDATA%/Cavalry/Scripts
 * so it holds `PPTypst.js` next to `pptypst_assets/`, then open it from
 * Window > Scripts > PPTypst. `src/config.ts` resolves the assets from
 * `ui.scriptLocation` (the Scripts folder); the `_assets` suffix keeps
 * `pptypst_assets` out of the Scripts menu.
 *
 * Needs the `zip` command on PATH. Run with: npm run pack
 * (or `npm run setup` for assets + build + pack).
 */

import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const out = join(dist, "PPTypst");
const archive = join(dist, "PPTypst.zip");

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sizeOf(path: string): Promise<number> {
  return (await stat(path)).size;
}

function human(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

const bundle = join(dist, "pptypst-cavalry.js");
if (!(await exists(bundle))) {
  throw new Error("Missing dist/pptypst-cavalry.js -- run `npm run build` first.");
}
const vendor = join(root, "assets", "vendor");
if (!(await exists(vendor))) {
  throw new Error("Missing assets/vendor/ -- run `npm run assets` first.");
}

await rm(out, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(out, { recursive: true });

await cp(bundle, join(out, "PPTypst.js"));
console.log(`  PPTypst.js       ${human(await sizeOf(bundle))}`);

await cp(vendor, join(out, "pptypst_assets", "vendor"), { recursive: true });
const vendorFiles = await readdir(join(out, "pptypst_assets", "vendor"));
let vendorBytes = 0;
for (const f of vendorFiles) {
  vendorBytes += await sizeOf(join(out, "pptypst_assets", "vendor", f));
}
console.log(`  pptypst_assets   ${String(vendorFiles.length)} files, ${human(vendorBytes)}`);

// Run from the staging dir with explicit members, so the archive has
// PPTypst.js and pptypst_assets/ at its root, no wrapping folder.
const zip = spawnSync(
  "zip",
  ["-r", "-q", "-X", archive, "PPTypst.js", "pptypst_assets"],
  { cwd: out, stdio: "inherit" },
);
if (zip.error) {
  throw new Error(`Could not run \`zip\`: ${zip.error.message}`);
}
if (zip.status !== 0) {
  throw new Error(`\`zip\` exited with status ${String(zip.status)}`);
}

console.log(`\nstaged folder   ${out}`);
console.log(`zip             ${archive}   (${human(await sizeOf(archive))})`);
console.log("Unpack it into your Cavalry Scripts folder.");
