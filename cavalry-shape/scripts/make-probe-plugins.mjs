/**
 * Generates a set of one-attribute-different plug-ins under `dist/probe/`, so
 * a failure to register can be bisected by installing them and asking Cavalry
 * which types it knows (`tools/probe.js`).
 *
 * Each is a complete, installable folder drawing a fixed rectangle. They differ
 * only in what `definitions.json` declares:
 *
 *   A  one `double`                        — does any third-party JS shape register?
 *   B  A + a `string`                      — is `string` a legal attribute type?
 *   C  A + the `material` stanza           — the schema wants a `type` there; the
 *                                            official Trefoil example omits it
 *   D  A + `string` + a `string` trigger   — may a `string` drive `polyMesh`?
 *
 * Run with: node scripts/make-probe-plugins.mjs
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "dist", "probe");

const AUTHOR = "pptypst";

/** The double every variant has, so each one draws something visible. */
const SIZE = { type: "double", default: 100.0, min: 1.0 };
const BLOB = { type: "string", default: "" };

const VARIANTS = [
  { id: "A", attributes: { size: SIZE }, triggers: ["size"] },
  { id: "B", attributes: { size: SIZE, blob: BLOB }, triggers: ["size"] },
  { id: "C", attributes: { size: SIZE, material: { defaultSubnodeType: "colorMaterial" } }, triggers: ["size"] },
  { id: "D", attributes: { size: SIZE, blob: BLOB }, triggers: ["size", "blob"] },
];

function definitions({ id, attributes, triggers }) {
  return [{
    author: AUTHOR,
    type: `pptypstProbe${id}`,
    superType: "thirdPartyJavaScriptShape",
    jsFile: "probe.js",
    version: "1.0",
    attributes,
    triggers: { polyMesh: triggers },
    UI: { attributeOrder: Object.keys(attributes).filter(name => name !== "material") },
  }];
}

function strings({ id, attributes }) {
  return [{
    type: "layerStrings",
    value: {
      author: AUTHOR,
      layerType: `pptypstProbe${id}`,
      niceName: `PPTypst Probe ${id}`,
      layerInfo: "Throwaway plug-in for diagnosing third-party layer registration.",
      language: "en",
      attributes: Object.fromEntries(
        Object.keys(attributes)
          .filter(name => name !== "material")
          .map(name => [name, [name, `The ${name} attribute.`]]),
      ),
    },
  }];
}

/**
 * The probe's shape script.
 *
 * `console.log` from inside a JS Shape does not reach Cavalry's console (an
 * exception does), so the one question that matters — what is actually in this
 * sandbox — is answered through the only channel a shape has: its geometry.
 * The rectangle is `size` wide and `bits + 1` tall, where `bits` is a mask the
 * JavaScript Editor can read back off the bounding box.
 *
 * The claim that a JS Shape has no `api` is inferred from the main Cavalry
 * docs and the community type definitions; the Plug-in SDK never states it.
 * This settles it from inside the sandbox, which is the only place that can.
 */
const SANDBOX_BITS = [
  ["api", "typeof api !== 'undefined'"],
  ["ui", "typeof ui !== 'undefined'"],
  ["ctx", "typeof ctx !== 'undefined'"],
  ["def", "typeof def !== 'undefined'"],
  ["ctx.saveObject", "typeof ctx !== 'undefined' && typeof ctx.saveObject === 'function'"],
  ["console", "typeof console !== 'undefined'"],
];

const SCRIPT = `(function () {
    // Each bit reports one global; tools/probe.js reads them back off the
    // layer's bounding box height. See scripts/make-probe-plugins.mjs.
    var bits = 0;
${SANDBOX_BITS.map(([, test], i) => `    if (${test}) bits += ${1 << i};`).join("\n")}

    var path = new cavalry.Path();
    path.addRect(-size / 2, -(bits + 1) / 2, size / 2, (bits + 1) / 2);
    var mesh = new cavalry.Mesh();
    mesh.addPath(path);
    return mesh;
})();
`;

await rm(out, { recursive: true, force: true });

for (const variant of VARIANTS) {
  const dir = join(out, `PPTypstProbe${variant.id}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "definitions.json"), JSON.stringify(definitions(variant), null, 4));
  await writeFile(join(dir, "strings.json"), JSON.stringify(strings(variant), null, 4));
  await writeFile(join(dir, "probe.js"), SCRIPT);
  console.log(`  ${dir}`);
}

console.log(`\nInstall all ${VARIANTS.length} (drag each folder into Cavalry), restart it,`);
console.log("then run tools/probe.js and read the 'registered types' section.");
console.log(`\nVariant A also reports its sandbox as a bit mask: ${SANDBOX_BITS.map(([name]) => name).join(", ")}`);
