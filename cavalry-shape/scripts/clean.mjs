/**
 * Clears the build outputs before a two-pass build writes both bundles into
 * `dist/`. Named explicitly rather than emptying the folder, so diagnostic
 * artefacts alongside them (`dist/probe/`) survive a rebuild.
 */

import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist");

for (const name of ["panel.js", "formula.js", "PPTypst"]) {
  await rm(join(dist, name), { recursive: true, force: true });
}
