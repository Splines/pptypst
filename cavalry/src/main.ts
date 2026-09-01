/**
 * PPTypst for Cavalry — entry point and composition root.
 *
 * Build with `npm run build`, then paste `dist/pptypst-cavalry.js` into
 * Cavalry's JavaScript Editor (or install it in the Scripts folder). See
 * README.md for the one-time asset setup.
 *
 * This file is the only place the layers meet: it constructs the Cavalry
 * adapters (`platform/`), the Typst engine (`typst/`), and wires them to the
 * panel's actions. Everything below it depends inwards on `core/`, which is
 * pure and knows nothing about Cavalry.
 */

import { ASSET_FILES, DOCUMENT, FONT_SIZE_REFERENCE } from "./config.ts";
import { defaultFontSizePt } from "./core/font-size.ts";
import { createAssetReader } from "./platform/files.ts";
import { createPanel } from "./platform/panel.ts";
import { findSelectedFormula, getActiveCompHeightPx, insertFormula } from "./platform/scene.ts";
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
});

/** The formula currently loaded for editing, if it is still in the scene. */
let editingLayerId: string | null = null;

/**
 * True while an insert render is in flight. The preview yields to it (they share
 * the single engine) and selection sync is paused, so a click in the scene
 * can't swap the editor source out from under the insert.
 */
let busy = false;

async function insert(): Promise<void> {
  const source = panel.getSource();
  if (!source) {
    panel.setStatus("Enter some Typst first.");
    return;
  }

  // Only replace a formula that is still in the scene; otherwise insert fresh.
  const replaces = editingLayerId !== null && api.layerExists(editingLayerId)
    ? editingLayerId
    : undefined;

  const fontSizePt = panel.getFontSizePt();

  setBusy(true);
  try {
    const svg = await engine.render(source, fontSizePt);
    editingLayerId = insertFormula({ source, fontSizePt }, svg, replaces);
    panel.setEditing(true);
    panel.showPreview(svg);
    panel.setStatus(replaces ? "Updated formula." : "Inserted formula.");
  } catch (error) {
    console.error("[pptypst] insert failed:", error);
    panel.setStatus(errorMessage(error));
  } finally {
    setBusy(false);
    void refreshPreview(); // catch up if the text changed mid-insert
  }
}

/**
 * Mirrors the scene selection into the panel: selecting a PPTypst group loads
 * its source and turns the action into "Update"; selecting anything else (or
 * nothing) leaves the editor as-is and puts the action back to "Insert", which
 * then creates a fresh group.
 */
function syncToSelection(): void {
  if (busy) {
    return;
  }

  const found = findSelectedFormula();

  if (!found) {
    if (editingLayerId !== null) {
      editingLayerId = null;
      panel.setEditing(false);
    }
    return;
  }

  if (found.layerId === editingLayerId) {
    // Already editing this one (e.g. the group we just inserted and selected);
    // don't reload and clobber any edits in progress.
    panel.setEditing(true);
    return;
  }

  editingLayerId = found.layerId;
  // Older (v1) formulas didn't record a font size; fall back to the current
  // resolution-scaled default rather than leaving the field stale.
  const fontSizePt = found.formula.fontSizePt ?? defaultFontSizePt(getActiveCompHeightPx(), FONT_SIZE_REFERENCE);
  panel.setFontSizePt(fontSizePt);
  panel.setSource(found.formula.source); // fires onSourceChanged -> schedulePreview
  panel.setEditing(true);
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
/**
 * True while the status line under the button is showing a Typst compile error
 * from the live preview, so a later successful render knows to wipe it.
 */
let previewErrorShown = false;

/** Puts a Typst compile error under the button; `null` clears one if shown. */
function showCompileError(message: string | null): void {
  if (message !== null) {
    previewErrorShown = true;
    panel.setStatus(message);
  } else if (previewErrorShown) {
    previewErrorShown = false;
    panel.setStatus("");
  }
}

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
    showCompileError(null);
    return;
  }

  previewRendering = true;
  try {
    const svg = await engine.render(source, panel.getFontSizePt());
    panel.showPreview(svg);
    showCompileError(null);
  } catch (error) {
    panel.clearPreview();
    // Surface Typst's own message under the button, e.g. "unknown variable: x".
    showCompileError(errorMessage(error));
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
