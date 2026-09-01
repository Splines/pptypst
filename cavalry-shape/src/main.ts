/**
 * PPTypst for Cavalry — the panel's entry point and composition root.
 *
 * Built to `dist/panel.js` and run from Cavalry's Scripts menu (or pasted into
 * the JavaScript Editor). This half owns everything the JS Shape plug-in
 * cannot do for itself: reading the wasm and fonts off disk, compiling Typst,
 * and writing the result onto a `pptypstFormula` layer. See README.md.
 *
 * This file is the only place the layers meet: it constructs the Cavalry
 * adapters (`platform/`), the Typst engine (`typst/`), and wires them to the
 * panel's actions. Everything below it depends inwards on `core/`, which is
 * pure and knows nothing about Cavalry.
 */

import { ASSET_FILES, DOCUMENT, FONT_SIZE_REFERENCE, GEOMETRY, LAYER_NAME } from "./config.ts";
import { defaultFontSizePt } from "./core/font-size.ts";
import { formulaLayerName } from "./core/formula.ts";
import { geometryFromFlattened, serializeGeometry } from "./core/geometry.ts";
import { flattenTypstSvg } from "./core/svg-flatten.ts";
import { createAssetReader } from "./platform/files.ts";
import {
  createFormula,
  findSelectedFormula,
  isFormulaLayer,
  writeFormula,
} from "./platform/layer.ts";
import { createPanel } from "./platform/panel.ts";
import { centreOf, centreOn, getActiveCompHeightPx, importSvgAsGroup } from "./platform/scene.ts";
import { createTypstEngine } from "./typst/engine.ts";

/** How long the editor must be idle before the preview re-renders. */
const PREVIEW_DEBOUNCE_MS = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const panel = createPanel({
  onInsert: () => {
    void insert();
  },
  onBreakApart: () => {
    void breakApart();
  },
  onSelectionChanged: () => {
    syncToSelection();
  },
  onSourceChanged: () => {
    schedulePreview();
  },
  onFontSizeChanged: () => {
    schedulePreview();
  },
});
panel.setFontSizePt(defaultFontSizePt(getActiveCompHeightPx(), FONT_SIZE_REFERENCE));

const engine = createTypstEngine({
  assets: createAssetReader(),
  files: ASSET_FILES,
  document: DOCUMENT,
  onProgress: panel.setStatus,
});

/** The formula layer currently loaded for editing, if it is still in the scene. */
let editingLayerId: string | null = null;
/**
 * Set when {@link editingLayerId} points at a pre-plug-in group. Updating one
 * cannot rewrite attributes it does not have, so it is replaced instead.
 */
let editingLegacy = false;

/**
 * True while an insert render is in flight. The preview yields to it (they share
 * the single engine) and selection sync is paused, so a click in the scene
 * can't swap the editor source out from under the insert.
 */
let busy = false;

/** Compiles the panel's current source and serializes it for the layer. */
async function compile(): Promise<{ svg: string; geometry: string }> {
  const svg = await engine.render(panel.getSource(), panel.getFontSizePt());
  const geometry = serializeGeometry(geometryFromFlattened(flattenTypstSvg(svg), GEOMETRY));
  return { svg, geometry };
}

/**
 * Inserts a new formula layer, or rewrites the one being edited.
 *
 * Rewriting is the whole point of the plug-in layer: the attributes change and
 * nothing else does, so the formula's position, rotation, scale, materials,
 * deformers and keyframes all survive an edit. A legacy group has no such
 * attributes, so it is replaced by a layer centred where it stood.
 */
async function insert(): Promise<void> {
  const source = panel.getSource();
  if (!source) {
    panel.setStatus("Enter some Typst first.");
    return;
  }

  const editing = editingLayerId !== null && api.layerExists(editingLayerId) ? editingLayerId : null;
  const formula = { source, fontSizePt: panel.getFontSizePt() };

  setBusy(true);
  try {
    const { svg, geometry } = await compile();

    if (editing && !editingLegacy && isFormulaLayer(editing)) {
      writeFormula(editing, formula, geometry);
      panel.setStatus("Updated formula.");
    } else {
      // A legacy group is replaced rather than edited; keep it where it was.
      const oldCentre = editing ? centreOf(editing) : null;
      const layerId = createFormula(formula, geometry);
      if (editing) {
        api.deleteLayer(editing);
      }
      if (oldCentre) {
        centreOn(layerId, oldCentre); // leaves the new layer selected
      }
      editingLayerId = layerId;
      editingLegacy = false;
      panel.setStatus(editing ? "Replaced formula with a plug-in layer." : "Inserted formula.");
    }

    panel.setEditing(true);
    panel.setCanBreakApart(true);
    panel.showPreview(svg);
  } catch (error) {
    console.error("[pptypst] insert failed:", error);
    panel.setStatus(`Failed: ${errorMessage(error)}`);
  } finally {
    setBusy(false);
    void refreshPreview(); // catch up if the text changed mid-insert
  }
}

/**
 * Re-renders the current source as one vector layer per glyph, next to (not
 * instead of) whatever is being edited. A one-way trip: the group carries no
 * Typst source, so the panel will not offer to update it.
 */
async function breakApart(): Promise<void> {
  const source = panel.getSource();
  if (!source) {
    panel.setStatus("Enter some Typst first.");
    return;
  }

  const anchor = editingLayerId !== null && api.layerExists(editingLayerId)
    ? centreOf(editingLayerId)
    : null;

  setBusy(true);
  try {
    const { svg } = await compile();
    const groupId = importSvgAsGroup(svg, `${formulaLayerName(source, LAYER_NAME)} (glyphs)`);
    api.set(groupId, { hierarchy: false }); // the glyph paths are Scene-window noise
    if (anchor) {
      centreOn(groupId, anchor);
    }
    api.select([groupId]);
    panel.setStatus("Broke the formula apart into vector layers.");
  } catch (error) {
    console.error("[pptypst] break apart failed:", error);
    panel.setStatus(`Failed: ${errorMessage(error)}`);
  } finally {
    setBusy(false);
  }
}

/**
 * Mirrors the scene selection into the panel: selecting a formula loads its
 * source and turns the action into "Update"; selecting anything else (or
 * nothing) leaves the editor as-is and puts the action back to "Insert", which
 * then creates a fresh layer.
 */
function syncToSelection(): void {
  if (busy) {
    return;
  }

  const found = findSelectedFormula();

  if (!found) {
    if (editingLayerId !== null) {
      editingLayerId = null;
      editingLegacy = false;
      panel.setEditing(false);
      panel.setCanBreakApart(false);
      panel.setStatus("No formula selected — Insert creates a new one.");
    }
    return;
  }

  if (found.layerId === editingLayerId) {
    // Already editing this one (e.g. the layer we just inserted and selected);
    // don't reload and clobber any edits in progress.
    panel.setEditing(true);
    return;
  }

  editingLayerId = found.layerId;
  editingLegacy = found.legacy;
  // Formulas written before font size was tracked fall back to the current
  // resolution-scaled default rather than leaving the field stale.
  const fontSizePt = found.formula.fontSizePt ?? defaultFontSizePt(getActiveCompHeightPx(), FONT_SIZE_REFERENCE);
  panel.setFontSizePt(fontSizePt);
  panel.setSource(found.formula.source); // fires onSourceChanged -> schedulePreview
  panel.setEditing(true);
  panel.setCanBreakApart(true);
  panel.setStatus(
    found.legacy
      ? "Loaded an older formula group — Insert replaces it with a plug-in layer."
      : "Loaded formula from selection — Insert now updates it.",
  );
}

/* -------------------------------------------------------------------------- */
/* Live preview                                                              */
/* -------------------------------------------------------------------------- */

const previewTimer = new api.Timer({
  onTimeout: () => {
    void refreshPreview();
  },
});
previewTimer.setRepeating(false);
previewTimer.setInterval(PREVIEW_DEBOUNCE_MS);

/** A render is running; keeps the single engine from being entered twice. */
let previewRendering = false;
/** The source changed again while a render was running -- re-run when it ends. */
let previewStale = false;

function schedulePreview(): void {
  previewTimer.stop();
  previewTimer.start();
}

async function refreshPreview(): Promise<void> {
  if (busy) {
    return; // an insert render is using the engine; its finally re-runs us
  }
  if (previewRendering) {
    previewStale = true;
    return;
  }

  const source = panel.getSource();
  if (!source) {
    panel.clearPreview();
    return;
  }

  previewRendering = true;
  try {
    const svg = await engine.render(source, panel.getFontSizePt());
    panel.showPreview(svg);
  } catch (error) {
    panel.clearPreview();
    console.debug("[pptypst] preview render failed:", errorMessage(error));
  } finally {
    previewRendering = false;
    if (previewStale) {
      previewStale = false;
      void refreshPreview();
    }
  }
}

function setBusy(value: boolean): void {
  busy = value;
  panel.setBusy(value);
}

// Reflect whatever happens to be selected, then preview the initial source.
syncToSelection();
schedulePreview();
