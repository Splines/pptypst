/**
 * Assembles the installable plug-in from the Vite bundle, the JSON stub and the
 * vendored assets, then zips it:
 *
 *   dist/PPTypst/
 *     definitions.json  strings.json  node.js  setup.js  welcome.js  (from plugin/)
 *     PPTypst.js          (dist/pptypst-cavalry.js, from `npm run build`)
 *     pptypst_assets/vendor/   (assets/vendor/, from `npm run assets`)
 *   dist/PPTypst.zip
 *
 * Drag `dist/PPTypst.zip` (or the folder) onto an open Cavalry window to install.
 * `welcome.js` then copies PPTypst.js + pptypst_assets/ into the Scripts folder.
 *
 * Run with: npm run pack   (or `npm run setup` for assets + build + pack)
 */

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { crc32, deflateRawSync } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const out = join(dist, "PPTypst");
const zipPath = join(dist, "PPTypst.zip");

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

/** Every file under `dir`, as paths relative to it, POSIX-separated, sorted. */
async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const abs = join(entry.parentPath ?? entry.path, entry.name);
      found.push(relative(dir, abs).split(sep).join("/"));
    }
  }
  return found.sort();
}

/**
 * Minimal ZIP writer (deflate, no deps): enough for Cavalry's `api.unzip`.
 * `entries` is `[{ name, data }]`; names are POSIX paths inside the archive.
 */
function makeZip(entries) {
  const now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, eocd]);
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
await rm(zipPath, { force: true });
await mkdir(out, { recursive: true });

for (const name of ["definitions.json", "strings.json", "node.js", "setup.js", "welcome.js"]) {
  await cp(join(root, "plugin", name), join(out, name));
}

await cp(bundle, join(out, "PPTypst.js"));
console.log(`  PPTypst.js          ${human(await sizeOf(bundle))}`);

await cp(vendor, join(out, "pptypst_assets", "vendor"), { recursive: true });
const vendorFiles = await readdir(join(out, "pptypst_assets", "vendor"));
let vendorBytes = 0;
for (const f of vendorFiles) {
  vendorBytes += await sizeOf(join(out, "pptypst_assets", "vendor", f));
}
console.log(`  pptypst_assets      ${vendorFiles.length} files, ${human(vendorBytes)}`);

// Cavalry accepts a folder or a .zip of it; ship the zip so it is one file.
const names = await walk(out);
const entries = await Promise.all(
  names.map(async (name) => ({ name: `PPTypst/${name}`, data: await readFile(join(out, name)) })),
);
await writeFile(zipPath, makeZip(entries));

console.log(`\nplug-in folder   ${out}`);
console.log(`plug-in zip      ${zipPath}   (${human(await sizeOf(zipPath))})`);
console.log("Drag either onto an open Cavalry window to install.");
