/**
 * Scene-side operations: turn an SVG string into Cavalry layers, group them,
 * stash the raw Typst source on the group, and read it back from a selection so
 * a formula can be edited later.
 */

import { GROUP_NAME_MAX_CHARS, GROUP_NAME_PREFIX, USER_DATA_KEY } from "./config";
import { pptypstTempDir } from "./temp-dir";
import { flattenSvg } from "./svg-flatten";

interface StoredFormula {
  v: number;
  code: string;
}

export interface LoadedFormula {
  groupId: string;
  code: string;
}

/** e.g. `PPTypst: integral_0` for the code `integral_0^1 x^2 dif x`. */
function buildGroupName(code: string): string {
  const oneLine = code.replace(/\s+/g, " ").trim();
  const truncated = oneLine.length > GROUP_NAME_MAX_CHARS
    ? `${oneLine.slice(0, GROUP_NAME_MAX_CHARS)}…`
    : oneLine;
  return `${GROUP_NAME_PREFIX}: ${truncated}`;
}

/**
 * Writes `svg` to a temp file, imports it as layers, groups them under a single
 * group tagged with the raw Typst `code`, selects the group and returns its id.
 *
 * If `replaceGroupId` is given and still exists, it is deleted first (the new
 * group is created in its place — transform matching is left for later).
 */
export function insertFormula(svg: string, code: string, replaceGroupId?: string): string {
  const svgPath = `${pptypstTempDir()}/${String(Date.now())}.svg`;
  if (!api.writeToFile(svgPath, flattenSvg(svg), true)) {
    throw new Error(`could not write ${svgPath}`);
  }

  const layerIds = api.convertSVGToLayers(svgPath);
  if (layerIds.length === 0) {
    throw new Error("SVG import produced no layers (svg written, but convertSVGToLayers found nothing)");
  }

  if (replaceGroupId && api.layerExists(replaceGroupId)) {
    api.deleteLayer(replaceGroupId);
  }

  const name = buildGroupName(code);

  // `convertSVGToLayers` already wraps a multi-layer SVG in its own top-level
  // group, so use that directly instead of nesting another group around it.
  const groupId = layerIds.length === 1
    ? layerIds[0]
    : api.create("group", name);

  if (layerIds.length === 1) {
    api.rename(groupId, name);
  } else {
    const imported = new Set(layerIds);
    for (const id of layerIds) {
      if (!api.layerExists(id)) {
        continue;
      }
      const parent = api.getParent(id);
      // Only reparent the SVG's top-level layers; keep its internal hierarchy.
      if (!parent || !imported.has(parent)) {
        api.parent(id, groupId);
      }
    }
  }

  const payload: StoredFormula = { v: 1, code };
  api.setUserData(groupId, USER_DATA_KEY, payload);

  api.select([groupId]);
  return groupId;
}

/**
 * Looks through the current selection (and each selected layer's ancestors) for
 * a group carrying a stored Typst payload. Returns the first match.
 */
export function findSelectedFormula(): LoadedFormula | null {
  for (const selected of api.getSelection()) {
    let current: string = selected;
    // Walk up at most a few levels to the tagged group.
    for (let depth = 0; depth < 32 && current; depth++) {
      if (api.hasUserDataKey(current, USER_DATA_KEY)) {
        const raw = api.getUserDataKey(current, USER_DATA_KEY) as Partial<StoredFormula> | null;
        if (raw && typeof raw.code === "string") {
          return { groupId: current, code: raw.code };
        }
      }
      current = api.getParent(current);
    }
  }
  return null;
}
