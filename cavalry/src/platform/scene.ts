/**
 * Cavalry scene adapter: turning a rendered SVG into a named, tagged group of
 * vector layers, and finding such a group again from the current selection.
 *
 * All `api.*` scene access lives here.
 */

import { countVisiblePaths, flattenTypstSvg, serializeFlatSvg } from "../core/svg-flatten.ts";
import {
  formulaLayerName,
  parseFormula,
  serializeFormula,
  type Formula,
} from "../core/formula.ts";
import { LARGE_FIGURE_PATH_THRESHOLD, LAYER_NAME, SHAPE_LAYER_NAME, USER_DATA_KEY } from "../config.ts";
import { writeTempFile } from "./files.ts";

/** A formula found in the scene, together with the layer carrying it. */
export interface SceneFormula {
  layerId: string;
  formula: Formula;
  /**
   * `true` when {@link layerId} is the formula's own group -- selecting it means
   * an edit replaces the whole thing. `false` when it is a lone "Typst Shape"
   * left behind after the user ungrouped the formula for finer animation
   * control: the panel then loads its settings but a button press inserts a
   * fresh formula rather than trying to rebuild it from a single glyph.
   */
  grouped: boolean;
}

/** How far up the hierarchy `findSelectedFormulas` looks for a tagged layer. */
const MAX_ANCESTOR_DEPTH = 32;

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

/**
 * Attribute ids a composition might expose its background color under, tried
 * in order. Cavalry's Composition Settings labels it "Background"; the exact
 * scripting id has varied between builds, so a scan of every attribute (see
 * {@link looksLikeBackgroundColorAttr}) backs these up.
 */
const COMP_BACKGROUND_ATTRS = ["backgroundColor", "background", "worldColor", "bgColor"];
/** Matches the hex-string forms `api.get` returns a color as. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Whether `attrId` plausibly names a composition's background-color attribute. */
function looksLikeBackgroundColorAttr(attrId: string): boolean {
  const id = attrId.toLowerCase();
  if (id.includes("background")) {
    return true;
  }
  const looksColor = id.includes("color");
  return looksColor && (id.includes("world") || id.includes("bg"));
}

/** One 0..255 channel as a two-digit hex pair. */
function channelHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Builds `#rrggbb` from three channels. `[r, g, b]` are taken as 0..255 unless
 * every one is <= 1, in which case they are read as Cavalry's normalised 0..1.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const normalised = r <= 1 && g <= 1 && b <= 1;
  const scale = normalised ? 255 : 1;
  return `#${channelHex(r * scale)}${channelHex(g * scale)}${channelHex(b * scale)}`;
}

/**
 * `value` as a `#rrggbb` string, or `null` when it isn't a color. `api.get`
 * returns a color attribute in one of several shapes across Cavalry builds: a
 * hex string, an `rgb()/rgba()` string, an `[r, g, b, a]` array, or an
 * `{ r, g, b, a }` object -- the last two either 0..255 or normalised 0..1.
 */
function asHexColor(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (HEX_COLOR.test(trimmed)) {
      return trimmed.length >= 7 ? trimmed.slice(0, 7) : trimmed;
    }
    const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    return rgb ? rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])) : null;
  }
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(n => typeof n === "number")) {
    return rgbToHex(value[0], value[1], value[2]);
  }
  if (value !== null && typeof value === "object") {
    const c = value as Record<string, unknown>;
    if (typeof c.r === "number" && typeof c.g === "number" && typeof c.b === "number") {
      return rgbToHex(c.r, c.g, c.b);
    }
  }
  return null;
}

/**
 * The active composition's background color as a hex string, or `null` when
 * there is no active comp or the attribute can't be read. Used to seed a
 * default ink that contrasts with the scene (see `core/contrast.ts`).
 */
export function getActiveCompBackgroundHex(): string | null {
  const compId = api.getActiveComp();
  if (!compId) {
    return null;
  }

  // Known ids first, then any other attribute whose id looks like a background
  // color -- the scripting path has changed between Cavalry builds.
  // `api.hasAttribute` keeps `api.get` from logging an error for a missing one.
  const candidates = [
    ...COMP_BACKGROUND_ATTRS,
    ...api.getAttributes(compId).filter(looksLikeBackgroundColorAttr),
  ];
  for (const attr of candidates) {
    if (!api.hasAttribute(compId, attr)) {
      continue;
    }
    const hex = asHexColor(api.get(compId, attr));
    if (hex) {
      return hex;
    }
  }
  return null;
}

interface ImportedGroup {
  groupId: string;
  /**
   * The pre-merge shape count when the figure was large enough that same-style
   * paths were combined into shared layers for import (see
   * {@link LARGE_FIGURE_PATH_THRESHOLD}); `null` when every shape came in as its
   * own layer.
   */
  combinedFromShapes: number | null;
}

/**
 * Imports `svg` and returns the id of the single group holding the result.
 *
 * `api.convertSVGToLayers` returns the wrapping group it makes *and* all of its
 * descendants. When there is exactly one such root it is reused as the formula
 * group (renamed in place), so the result is one folder -- not `name` wrapped
 * around Cavalry's own "SVG Layer N". The vector layers inside are then renamed
 * and flipped by {@link tidyShapeLayers}.
 */
function importSvgAsGroup(svg: string, name: string): ImportedGroup {
  // typst.ts's SVG needs flattening first; Cavalry's importer cannot resolve
  // its <use>/<defs> glyph references. See core/svg-flatten.ts. On big figures
  // (past the threshold) same-style paths are merged into one layer -- the
  // dominant cost is `api.convertSVGToLayers`, which scales worse than linearly.
  const flat = flattenTypstSvg(svg);
  const shapeCount = countVisiblePaths(flat);
  const combinedFromShapes = shapeCount > LARGE_FIGURE_PATH_THRESHOLD ? shapeCount : null;
  const svgText = serializeFlatSvg(flat, { mergePathsAbove: LARGE_FIGURE_PATH_THRESHOLD });

  const svgPath = writeTempFile("svg", svgText);

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
  return { groupId, combinedFromShapes };
}

/** Every layer nested under `rootId`, at any depth (the root itself excluded). */
function descendantLayers(rootId: string): string[] {
  const out: string[] = [];
  const walk = (id: string): void => {
    for (const child of api.getChildren(id)) {
      out.push(child);
      walk(child);
    }
  };
  walk(rootId);
  return out;
}

/**
 * Renames every vector layer in the group to {@link SHAPE_LAYER_NAME} and
 * reverses their stacking, so the shape drawn first in the SVG (Cavalry drops it
 * at the bottom) ends up at the top of the group.
 *
 * The rename is skipped for big figures: `api.rename` costs ~1.7ms a call and
 * there is no bulk form, so on thousands of shapes it is seconds of pure
 * cosmetics (the layers keep Cavalry's default names; nothing keys off them --
 * {@link findSelectedFormula} uses user data). The reorder stays: it is ~100x
 * cheaper per call and fixes z-order for overlapping shapes.
 */
function tidyShapeLayers(groupId: string): void {
  // `sortLayerIdsByHierarchy` gives top-to-bottom order; the user's stated
  // "first-drawn at the bottom" makes the reverse the SVG paint order.
  const paintOrder = api.sortLayerIdsByHierarchy(api.getChildren(groupId)).reverse();

  if (paintOrder.length > LARGE_FIGURE_PATH_THRESHOLD) {
    console.log(
      `[pptypst] ${String(paintOrder.length)} shapes -- skipping per-shape rename `
      + `(over ${String(LARGE_FIGURE_PATH_THRESHOLD)})`,
    );
  } else {
    for (const id of paintOrder) {
      api.rename(id, SHAPE_LAYER_NAME);
    }
  }

  // Chain each layer directly below its predecessor so the final top-to-bottom
  // order is the paint order.
  for (let i = 1; i < paintOrder.length; i++) {
    api.reorder(paintOrder[i], paintOrder[i - 1]);
  }
}

export interface InsertResult {
  /** The formula group now in the scene (and selected). */
  layerId: string;
  /**
   * Set when the figure was over {@link LARGE_FIGURE_PATH_THRESHOLD} and
   * same-style paths had to be combined to keep the import feasible: the
   * pre-merge shape count, for a note in the status line. `null` otherwise.
   */
  combinedFromShapes: number | null;
}

/**
 * Inserts `formula` into the scene as vector layers rendered from `svg`, tags
 * the group *and every shape layer inside it* with the formula, selects the
 * group and returns it (with a flag for whether paths had to be combined).
 *
 * The per-shape copies are what let {@link findSelectedFormula} still recognise
 * a formula after the user ungroups it (a common move for finer animation
 * control): each loose "Typst Shape" then carries the source, color and size
 * on its own.
 *
 * When `replaceLayerId` refers to a layer that still exists it is deleted, so
 * editing a formula replaces it rather than stacking a copy on top, and the new
 * group is nudged so its centre lands on the old one's centre (mirrors the
 * PowerPoint add-in's `calculateCenteredPosition`). The old group's rotation is
 * carried over so a tilted formula stays tilted; scale is not.
 */
export function insertFormula(formula: Formula, svg: string, replaceLayerId?: string): InsertResult {
  const name = formulaLayerName(formula.source, LAYER_NAME);

  const toReplace = replaceLayerId !== undefined && api.layerExists(replaceLayerId)
    ? replaceLayerId
    : null;
  // Capture the old formula's centre, rotation and expand/collapse state before
  // it is deleted. A fresh insert starts collapsed (its glyph paths are
  // Scene-window noise); an update keeps whatever state the user had the old
  // group in, including any rotation they applied.
  const oldCentre = toReplace
    ? api.getBoundingBox(toReplace, true).centre
    : null;
  // `rotation` comes back as an `{ x, y, z }` object of degrees, not a bare
  // number; read it as-is and pass it straight back to `api.set` so it
  // round-trips whatever its shape.
  const oldRotation = toReplace && api.hasAttribute(toReplace, "rotation")
    ? api.get(toReplace, "rotation")
    : null;
  const expanded = toReplace ? api.get(toReplace, "hierarchy") === true : false;

  const { groupId, combinedFromShapes } = importSvgAsGroup(svg, name);

  if (toReplace) {
    api.deleteLayer(toReplace);
  }
  api.set(groupId, { hierarchy: expanded });

  // Tag the group and every shape inside it with the same payload, so the
  // formula survives being ungrouped (see the doc comment above).
  const payload = serializeFormula(formula);
  api.setUserData(groupId, USER_DATA_KEY, payload);
  for (const shape of descendantLayers(groupId)) {
    api.setUserData(shape, USER_DATA_KEY, payload);
  }
  api.select([groupId]);

  // Rotate before re-centring: the centre alignment below measures the new
  // group's bounding box, which only matches the old one once it is tilted too.
  if (oldRotation !== null && oldRotation !== undefined) {
    try {
      api.set(groupId, { rotation: oldRotation });
    } catch (error) {
      console.warn("[pptypst] could not carry rotation across update:", error);
    }
  }

  if (oldCentre) {
    // Both the bounding box and api.move work in scene units; move shifts the
    // freshly selected group by the delta between the two centres.
    const newCentre = api.getBoundingBox(groupId, true).centre;
    api.move(oldCentre.x - newCentre.x, oldCentre.y - newCentre.y);
  }

  return { layerId: groupId, combinedFromShapes };
}

/**
 * Every distinct PPTypst formula in the current selection, in selection order.
 *
 * Each selected layer is walked up its ancestors for a formula tag, resolved to
 * the *outermost* tagged one -- so clicking a glyph inside an intact formula
 * yields the whole group, while a glyph left loose by ungrouping yields itself
 * (see {@link SceneFormula.grouped}). A formula reached through several selected
 * layers is returned once.
 *
 * The panel loads a single result for editing; two or more switch it into
 * bulk font-size mode.
 */
export function findSelectedFormulas(): SceneFormula[] {
  const seen = new Set<string>();
  const found: SceneFormula[] = [];
  for (const selected of api.getSelection()) {
    let match: { layerId: string; formula: Formula } | null = null;
    let current = selected;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && current; depth++) {
      if (api.hasUserDataKey(current, USER_DATA_KEY)) {
        const formula = parseFormula(api.getUserDataKey(current, USER_DATA_KEY));
        if (formula) {
          match = { layerId: current, formula }; // keep climbing to the outermost
        }
      }
      current = api.getParent(current);
    }
    if (match && !seen.has(match.layerId)) {
      seen.add(match.layerId);
      // A live formula group still holds its shape layers; a lone "Typst Shape"
      // dropped by ungrouping has no children.
      found.push({ ...match, grouped: api.getChildren(match.layerId).length > 0 });
    }
  }
  return found;
}
