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
 * Attribute ids a composition might expose its background colour under, tried
 * in order. Cavalry's Composition Settings labels it "Background"; the exact
 * scripting id has varied between builds, so a scan of every attribute (see
 * {@link looksLikeBackgroundColorAttr}) backs these up.
 */
const COMP_BACKGROUND_ATTRS = ["backgroundColor", "background", "worldColor", "bgColor"];
/** Matches the hex-string forms `api.get` returns a colour as. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Whether `attrId` plausibly names a composition's background-colour attribute. */
function looksLikeBackgroundColorAttr(attrId: string): boolean {
  const id = attrId.toLowerCase();
  if (id.includes("background")) {
    return true;
  }
  const looksColour = id.includes("color") || id.includes("colour");
  return looksColour && (id.includes("world") || id.includes("bg"));
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
 * `value` as a `#rrggbb` string, or `null` when it isn't a colour. `api.get`
 * returns a colour attribute in one of several shapes across Cavalry builds: a
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
 * The active composition's background colour as a hex string, or `null` when
 * there is no active comp or the attribute can't be read. Used to seed a
 * default ink that contrasts with the scene (see `core/contrast.ts`).
 */
export function getActiveCompBackgroundHex(): string | null {
  const compId = api.getActiveComp();
  if (!compId) {
    return null;
  }

  // Known ids first, then any other attribute whose id looks like a background
  // colour -- the scripting path has changed between Cavalry builds.
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
