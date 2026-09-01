/**
 * Cavalry scene adapter: turning a rendered SVG into a named, tagged group of
 * vector layers, and finding such a group again from the current selection.
 *
 * All `api.*` scene access lives here.
 */

import { flattenSvg } from "../core/svg-flatten.ts";
import {
  formulaLayerName,
  parseFormula,
  serializeFormula,
  type Formula,
} from "../core/formula.ts";
import { LAYER_NAME, SHAPE_LAYER_NAME, USER_DATA_KEY } from "../config.ts";
import { writeTempFile } from "./files.ts";

/** A formula found in the scene, together with the group carrying it. */
export interface SceneFormula {
  layerId: string;
  formula: Formula;
}

/** How far up the hierarchy `findSelectedFormula` looks for a tagged group. */
const MAX_ANCESTOR_DEPTH = 32;

/**
 * Imports `svg` and returns the id of the single group holding the result.
 *
 * `api.convertSVGToLayers` returns the wrapping group it makes *and* all of its
 * descendants. When there is exactly one such root it is reused as the formula
 * group (renamed in place), so the result is one folder -- not `name` wrapped
 * around Cavalry's own "SVG Layer N". The vector layers inside are then renamed
 * and flipped by {@link tidyShapeLayers}.
 */
function importSvgAsGroup(svg: string, name: string): string {
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

/**
 * Inserts `formula` into the scene as vector layers rendered from `svg`, tags
 * the resulting group with the formula source, selects it and returns its id.
 *
 * When `replaceLayerId` refers to a layer that still exists it is deleted, so
 * editing a formula replaces it rather than stacking a copy on top, and the new
 * group is nudged so its centre lands on the old one's centre (mirrors the
 * PowerPoint add-in's `calculateCenteredPosition`). Rotation and scale are not
 * carried over.
 */
export function insertFormula(formula: Formula, svg: string, replaceLayerId?: string): string {
  const name = formulaLayerName(formula.source, LAYER_NAME);

  const toReplace = replaceLayerId !== undefined && api.layerExists(replaceLayerId)
    ? replaceLayerId
    : null;
  // Capture the old formula's centre and expand/collapse state before it is
  // deleted. A fresh insert starts collapsed (its glyph paths are Scene-window
  // noise); an update keeps whatever state the user had the old group in.
  const oldCentre = toReplace
    ? api.getBoundingBox(toReplace, true).centre
    : null;
  const expanded = toReplace ? api.get(toReplace, "hierarchy") === true : false;

  const groupId = importSvgAsGroup(svg, name);

  if (toReplace) {
    api.deleteLayer(toReplace);
  }

  api.set(groupId, { hierarchy: expanded });
  api.setUserData(groupId, USER_DATA_KEY, serializeFormula(formula));
  api.select([groupId]);

  if (oldCentre) {
    // Both the bounding box and api.move work in scene units; move shifts the
    // freshly selected group by the delta between the two centres.
    const newCentre = api.getBoundingBox(groupId, true).centre;
    api.move(oldCentre.x - newCentre.x, oldCentre.y - newCentre.y);
  }

  return groupId;
}

/**
 * Searches the current selection, and each selected layer's ancestors, for a
 * group tagged with a PPTypst formula. Returns the first match.
 */
export function findSelectedFormula(): SceneFormula | null {
  for (const selected of api.getSelection()) {
    let current = selected;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && current; depth++) {
      if (api.hasUserDataKey(current, USER_DATA_KEY)) {
        const formula = parseFormula(api.getUserDataKey(current, USER_DATA_KEY));
        if (formula) {
          return { layerId: current, formula };
        }
      }
      current = api.getParent(current);
    }
  }
  return null;
}
