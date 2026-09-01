/**
 * Populates `assets/vendor/` with the large binaries the pasted Cavalry script
 * reads at runtime: the two typst.ts WASM modules, PPTypst's bundled math font,
 * and Typst's default `text` fonts (downloaded once from jsDelivr).
 *
 * Run with: npm run assets
 */

import { createRequire } from "node:module";
import { mkdir, copyFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "..");
const vendorDir = join(pkgRoot, "assets", "vendor");

const require = createRequire(join(pkgRoot, "package.json"));

/** Text fonts Typst ships by default (New Computer Modern + friends). */
const TEXT_FONTS = [
  "LibertinusSerif-Regular.otf",
  "LibertinusSerif-Bold.otf",
  "LibertinusSerif-Italic.otf",
  "LibertinusSerif-BoldItalic.otf",
  "NewCM10-Regular.otf",
  "NewCM10-Bold.otf",
  "NewCM10-Italic.otf",
  "NewCM10-BoldItalic.otf",
  "NewCMMath-Regular.otf",
  "NewCMMath-Bold.otf",
  "DejaVuSansMono.ttf",
];
const TEXT_FONT_BASE = "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/files/fonts/";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolves a file inside an installed package, trying the package root then the repo root. */
function resolvePackageFile(relPath: string): string {
  try {
    return require.resolve(relPath);
  } catch {
    const rootRequire = createRequire(join(repoRoot, "package.json"));
    return rootRequire.resolve(relPath);
  }
}

async function copyInto(srcPath: string, name: string): Promise<void> {
  const dest = join(vendorDir, name);
  await copyFile(srcPath, dest);
  console.log(`  copied  ${name}`);
}

async function main(): Promise<void> {
  await mkdir(vendorDir, { recursive: true });

  await copyInto(
    resolvePackageFile("@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm"),
    "typst_ts_web_compiler_bg.wasm",
  );
  await copyInto(
    resolvePackageFile("@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm"),
    "typst_ts_renderer_bg.wasm",
  );

  const mathFont = join(repoRoot, "web", "public", "math-font.ttf");
  if (await exists(mathFont)) {
    await copyInto(mathFont, "math-font.ttf");
  } else {
    console.warn(`  WARN   math font not found at ${mathFont}`);
  }

  for (const font of TEXT_FONTS) {
    const dest = join(vendorDir, font);
    if (await exists(dest)) {
      console.log(`  have    ${font}`);
      continue;
    }
    try {
      const res = await fetch(TEXT_FONT_BASE + font);
      if (!res.ok) {
        console.warn(`  WARN   ${font}: HTTP ${String(res.status)}`);
        continue;
      }
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`  fetched ${font}`);
    } catch (err) {
      console.warn(`  WARN   ${font}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nAssets ready in ${vendorDir}`);
  console.log("Next: `npm run build && npm run pack` (or `npm run setup`).");
  console.log("For JS-Editor testing: `PPTYPST_ASSET_DIR=\"<abs path above>\" npm run build`.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
