/**
 * The JS Shape plugin script (`thirdPartyJavaScriptShape`), bundled to
 * `dist/formula.js` and loaded by `definitions.json`.
 *
 * Cavalry evaluates this whenever one of the layer's `polyMesh` triggers
 * changes. The sandbox holds `ctx` and `console` and nothing else — no `api`,
 * no `ui`, so no compiling, no file reading, no network (measured; see the
 * README). It only rebuilds the mesh from the outlines the panel already
 * compiled and parked on the layer, which costs no measurable time even for a
 * formula several times larger than anything realistic.
 *
 * Attributes declared in `definitions.json` arrive as bare globals of the same
 * name, which is what the `declare const` lines below stand in for.
 */

import { buildMesh, DEFAULT_MESH_OPTIONS } from "../cavalry/mesh.ts";
import { parseGeometry } from "../core/geometry.ts";
import { SCENE } from "../config.ts";

/** The serialized outlines. See `core/geometry.ts`. */
declare const typstGeometry: string;
/** Paint the outlines in the colours Typst rendered them. */
declare const typstColours: boolean;

export function buildFormulaMesh(): cavalry.Mesh {
  const geometry = parseGeometry(typstGeometry);
  if (!geometry) {
    // No formula yet (a layer straight out of the Create menu), or a payload
    // this version cannot read. Either way, draw nothing rather than throw:
    // an exception here fails the whole evaluation and empties the layer.
    return new cavalry.Mesh();
  }

  return buildMesh(geometry, {
    ...DEFAULT_MESH_OPTIONS,
    colours: typstColours,
    flipY: SCENE.flipY,
  });
}
