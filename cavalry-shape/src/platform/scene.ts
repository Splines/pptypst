/**
 * Cavalry scene helpers that are not about the formula layer itself:
 * reading the composition, moving layers around, and the "Break Apart" import
 * that turns a rendered formula into one editable vector layer per glyph.
 *
 * Break Apart is the old (pre-plug-in) insert path, kept because it is the one
 * thing a single shape layer cannot do: give each glyph its own layer, so
 * glyphs can be staggered, coloured or animated independently. It is a one-way
 * trip — the result is plain Cavalry geometry with no Typst source attached.
 */

import { flattenSvg } from "../core/svg-flatten.ts";
import { SHAPE_LAYER_NAME } from "../config.ts";
import { writeTempFile } from "./files.ts";

/** A point in scene space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The active composition's vertical resolution in pixels, or `0` if there is
 * no active composition / the attribute can't be read. Used to scale the
 * default formula font size to the scene (see `core/font-size.ts`).
 */
export function getActiveCompHeightPx(): number {
  const compId = api.getActiveComp();
  if (!compId) {
    return 0;
  }
  const height = api.get(compId, "resolution.y");
  return typeof height === "number" ? height : 0;
}

/** World-space centre of a layer's bounding box. */
export function centreOf(layerId: string): Point {
  return api.getBoundingBox(layerId, true).centre;
}

/** Shifts `layerId` so its bounding box centre lands on `target`. */
export function centreOn(layerId: string, target: Point): void {
  const current = centreOf(layerId);
  api.select([layerId]);
  api.move(target.x - current.x, target.y - current.y);
}

/**
 * Imports `svg` and returns the id of the single group holding the result.
 *
 * `api.convertSVGToLayers` returns the wrapping group it makes *and* all of its
 * descendants. When there is exactly one such root it is reused as the group
 * (renamed in place), so the result is one folder — not `name` wrapped around
 * Cavalry's own "SVG Layer N".
 */
export function importSvgAsGroup(svg: string, name: string): string {
  // typst.ts's SVG needs flattening first; Cavalry's importer cannot resolve
  // its <use>/<defs> glyph references. See core/svg-flatten.ts.
  const svgPath = writeTempFile("svg", flattenSvg(svg));

  const layerIds = api.convertSVGToLayers(svgPath);
  if (layerIds.length === 0) {
    throw new Error("SVG import produced no layers (file written, but convertSVGToLayers found nothing)");
  }

  const imported = new Set(layerIds);
  const roots = layerIds.filter((id) => {
    const parent = api.getParent(id);
    return !parent || !imported.has(parent);
  });

  let groupId: string;
  if (roots.length === 1) {
    api.rename(roots[0], name);
    groupId = roots[0];
  } else {
    groupId = api.create("group", name);
    for (const id of roots) {
      if (api.layerExists(id)) {
        api.parent(id, groupId);
      }
    }
  }

  tidyShapeLayers(groupId);
  return groupId;
}

/**
 * Renames every vector layer in the group to {@link SHAPE_LAYER_NAME} and
 * reverses their stacking, so the shape drawn first in the SVG (Cavalry drops it
 * at the bottom) ends up at the top of the group.
 */
function tidyShapeLayers(groupId: string): void {
  // `sortLayerIdsByHierarchy` gives top-to-bottom order; the user's stated
  // "first-drawn at the bottom" makes the reverse the SVG paint order.
  const paintOrder = api.sortLayerIdsByHierarchy(api.getChildren(groupId)).reverse();

  for (const id of paintOrder) {
    api.rename(id, SHAPE_LAYER_NAME);
  }
  // Chain each layer directly below its predecessor so the final top-to-bottom
  // order is the paint order.
  for (let i = 1; i < paintOrder.length; i++) {
    api.reorder(paintOrder[i], paintOrder[i - 1]);
  }
}
