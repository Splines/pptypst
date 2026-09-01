/**
 * The formula layer: creating one, writing a compiled formula onto it, and
 * finding it again from the scene selection.
 *
 * A formula is a single `pptypstFormula` layer — the JS Shape plug-in declared
 * in `plugin/definitions.json`. Its Typst source, size and compiled outlines
 * live in ordinary Cavalry attributes, so they are saved with the scene, shown
 * in the Attribute Editor, and (unlike the group of vector layers this
 * replaces) survive an update: rewriting the attributes leaves the layer's
 * transform, materials, deformers and keyframes exactly where they were.
 */

import { LAYER_NAME, LEGACY_USER_DATA_KEY, PLUGIN } from "../config.ts";
import { formulaLayerName, parseFormula, type Formula } from "../core/formula.ts";

/** A formula found in the scene, together with the layer carrying it. */
export interface SceneFormula {
  layerId: string;
  formula: Formula;
  /**
   * True for a group written before the plug-in existed (v2, tagged with
   * `api.setUserData`). Those can be read and re-rendered, but updating one
   * replaces it with a plug-in layer.
   */
  legacy: boolean;
}

/** How far up the hierarchy {@link findSelectedFormula} looks. */
const MAX_ANCESTOR_DEPTH = 32;

export function isFormulaLayer(layerId: string): boolean {
  if (!api.layerExists(layerId)) {
    return false;
  }
  // Namespaced (`pptypst::pptypstFormula`) is what Cavalry reports today; the
  // bare form is accepted too, so a change to that undocumented convention
  // orphans nobody's scenes.
  const type = api.getLayerType(layerId);
  return type === PLUGIN.layerType || type === PLUGIN.bareLayerType;
}

/**
 * Creates a formula layer, fills it in, selects it and returns its id.
 *
 * `geometry` is the serialized outline payload from `core/geometry.ts`; the
 * shape script turns it back into a mesh.
 */
export function createFormula(formula: Formula, geometry: string): string {
  const layerId = api.create(PLUGIN.layerType, formulaLayerName(formula.source, LAYER_NAME));
  writeFormula(layerId, formula, geometry);
  api.select([layerId]);
  return layerId;
}

/**
 * Replaces the formula on an existing layer, in place.
 *
 * Only the plug-in's attributes are touched — position, rotation, scale, fill,
 * stroke and anything attached to the layer stay as they are. The new mesh is
 * built around its own ink centre (see `cavalry/mesh.ts`), so a formula grows
 * and shrinks about the point it already sat on.
 */
export function writeFormula(layerId: string, formula: Formula, geometry: string): void {
  const { attributes } = PLUGIN;

  renameIfUntouched(layerId, formula.source);
  api.set(layerId, {
    [attributes.source]: formula.source,
    [attributes.fontSize]: formula.fontSizePt ?? 0,
    [attributes.geometry]: geometry,
  });
}

/**
 * Retitles the layer after its new source, unless the user has named it
 * themselves — an updated formula should follow its text, but not at the cost
 * of a name someone chose deliberately.
 */
function renameIfUntouched(layerId: string, source: string): void {
  const previous = api.get(layerId, PLUGIN.attributes.source);
  const generated = typeof previous === "string"
    ? formulaLayerName(previous, LAYER_NAME)
    : null;

  if (generated === null || api.getNiceName(layerId) === generated) {
    api.rename(layerId, formulaLayerName(source, LAYER_NAME));
  }
}

/** Reads back what {@link writeFormula} stored, or `null` if the layer is not ours. */
export function readFormula(layerId: string): Formula | null {
  if (!isFormulaLayer(layerId)) {
    return null;
  }
  const source = api.get(layerId, PLUGIN.attributes.source);
  if (typeof source !== "string") {
    return null;
  }
  const fontSize = api.get(layerId, PLUGIN.attributes.fontSize);
  return {
    source,
    ...(typeof fontSize === "number" && fontSize > 0 ? { fontSizePt: fontSize } : {}),
  };
}

/**
 * Searches the current selection, and each selected layer's ancestors, for a
 * formula. Returns the first match — a plug-in layer, or an old tagged group.
 */
export function findSelectedFormula(): SceneFormula | null {
  for (const selected of api.getSelection()) {
    let current = selected;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && current; depth++) {
      const formula = readFormula(current);
      if (formula) {
        return { layerId: current, formula, legacy: false };
      }
      if (api.hasUserDataKey(current, LEGACY_USER_DATA_KEY)) {
        const legacy = parseFormula(api.getUserDataKey(current, LEGACY_USER_DATA_KEY));
        if (legacy) {
          return { layerId: current, formula: legacy, legacy: true };
        }
      }
      current = api.getParent(current);
    }
  }
  return null;
}
