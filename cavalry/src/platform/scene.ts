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
import { LAYER_NAME, USER_DATA_KEY } from "../config.ts";
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
 * `api.convertSVGToLayers` already wraps a multi-layer SVG in its own top-level
 * group, so that group is reused rather than nested inside another one.
 */
function importSvgAsGroup(svg: string, name: string): string {
  // typst.ts's SVG needs flattening first; Cavalry's importer cannot resolve
  // its <use>/<defs> glyph references. See core/svg-flatten.ts.
  const svgPath = writeTempFile("svg", flattenSvg(svg));

  const layerIds = api.convertSVGToLayers(svgPath);
  if (layerIds.length === 0) {
    throw new Error("SVG import produced no layers (file written, but convertSVGToLayers found nothing)");
  }

  if (layerIds.length === 1) {
    const groupId = layerIds[0];
    api.rename(groupId, name);
    return groupId;
  }

  const groupId = api.create("group", name);
  const imported = new Set(layerIds);
  for (const id of layerIds) {
    if (!api.layerExists(id)) {
      continue;
    }
    // Only reparent the SVG's top-level layers; keep its internal hierarchy.
    const parent = api.getParent(id);
    if (!parent || !imported.has(parent)) {
      api.parent(id, groupId);
    }
  }
  return groupId;
}

/**
 * Inserts `formula` into the scene as vector layers rendered from `svg`, tags
 * the resulting group with the formula source, selects it and returns its id.
 *
 * When `replaceLayerId` refers to a layer that still exists it is deleted
 * first, so editing a formula replaces it rather than stacking a copy on top.
 * The replacement is not moved to the old group's transform yet.
 */
export function insertFormula(formula: Formula, svg: string, replaceLayerId?: string): string {
  const name = formulaLayerName(formula.source, LAYER_NAME);
  const groupId = importSvgAsGroup(svg, name);

  if (replaceLayerId && api.layerExists(replaceLayerId)) {
    api.deleteLayer(replaceLayerId);
  }

  api.setUserData(groupId, USER_DATA_KEY, serializeFormula(formula));
  api.select([groupId]);
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
