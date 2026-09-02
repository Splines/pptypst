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
import { contrastInk } from "./core/contrast.ts";
import { defaultFontSizePt } from "./core/font-size.ts";
import { createAssetReader } from "./platform/files.ts";
import { createPanel } from "./platform/panel.ts";
import {
  DEFAULT_ONLY_MATH,
  loadFillColorPreference,
  loadFontSizePreference,
  loadOnlyMathPreference,
  saveFillColorPreference,
  saveFontSizePreference,
  saveOnlyMathPreference,
} from "./platform/preferences.ts";
import {
  findSelectedFormula,
  getActiveCompBackgroundHex,
  getActiveCompHeightPx,
  insertFormula,
} from "./platform/scene.ts";
import { createTypstEngine } from "./typst/engine.ts";

/** How long the editor must be idle before the preview re-renders. */
const PREVIEW_DEBOUNCE_MS = 0;

/** Shown under the action button when the Size field is left blank. */
const NO_FONT_SIZE_MESSAGE = "Enter a font size first.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Point size a fresh formula defaults to, scaled to the active composition. */
function derivedFontSizePt(): number {
  return defaultFontSizePt(getActiveCompHeightPx(), FONT_SIZE_REFERENCE);
}

/** Fill colour a fresh formula defaults to: contrast against the comp background. */
function derivedFillColor(): string {
  return contrastInk(getActiveCompBackgroundHex());
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
    rememberSettings();
    schedulePreview();
  },
  onMathModeChanged: () => {
    rememberSettings();
    schedulePreview();
  },
  onFillColorChanged: () => {
    rememberSettings();
    schedulePreview();
  },
  onReset: () => {
    panel.setFontSizePt(derivedFontSizePt());
    panel.setMathMode(DEFAULT_ONLY_MATH);
    panel.setFillColor(derivedFillColor());
    rememberSettings();
    schedulePreview();
  },
});

/**
 * Persists the panel's current Size, Color and "Only Math" so the next launch
 * opens with the last-used values -- whether the user set them by hand or by
 * selecting a formula whose settings loaded into the panel. The Reset button is
 * what returns these to composition-derived defaults.
 */
function rememberSettings(): void {
  const fontSizePt = panel.getFontSizePt();
  if (fontSizePt > 0) {
    saveFontSizePreference(fontSizePt); // don't persist a transiently blank field
  }
  saveFillColorPreference(panel.getFillColor());
  saveOnlyMathPreference(panel.getMathMode());
}

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
  const mathMode = panel.getMathMode();
  const color = panel.getFillColor();

  // Catch a blank Size field here rather than letting a 0pt document reach the
  // Typst compiler, whose error would be far less obvious.
  if (!(fontSizePt > 0)) {
    panel.setStatus(NO_FONT_SIZE_MESSAGE);
    return;
  }

  setBusy(true);
  try {
    const svg = await engine.render(source, fontSizePt, mathMode, color);
    editingLayerId = insertFormula({ source, fontSizePt, mathMode, color }, svg, replaces);
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
 * Mirrors the scene selection into the panel. Selecting an intact PPTypst group
 * loads its source and turns the action into "Update". Selecting a loose "Typst
 * Shape" left behind by ungrouping also loads its settings, but keeps the action
 * as "Insert": rebuilding a whole formula from one glyph (and undoing the user's
 * ungrouping) is not what they want. Selecting anything else leaves the editor
 * as-is and puts the action back to "Insert".
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

  if (found.grouped && found.layerId === editingLayerId) {
    // Already editing this one (e.g. the group we just inserted and selected);
    // don't reload and clobber any edits in progress.
    panel.setEditing(true);
    return;
  }

  panel.setFontSizePt(found.formula.fontSizePt);
  panel.setMathMode(found.formula.mathMode);
  panel.setFillColor(found.formula.color);
  panel.setSource(found.formula.source); // fires onSourceChanged -> schedulePreview
  // The panel setters above fire no handlers, so persist here: the last object
  // the user touched becomes what the next launch opens with.
  rememberSettings();

  // Only an intact group can be updated in place; a loose glyph loads read-only
  // and a button press inserts a fresh formula.
  editingLayerId = found.grouped ? found.layerId : null;
  panel.setEditing(found.grouped);
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

  if (!(panel.getFontSizePt() > 0)) {
    panel.clearPreview();
    showCompileError(NO_FONT_SIZE_MESSAGE);
    return;
  }

  previewRendering = true;
  try {
    const svg = await engine.render(
      source, panel.getFontSizePt(), panel.getMathMode(), panel.getFillColor(),
    );
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

// Open with the last-used Size, Color and "Only Math" (see `rememberSettings`);
// until the user has set one, fall back to a value derived from the active
// composition -- a resolution-scaled font size, and an ink that contrasts with
// the background. Then let any current selection override them and preview the
// initial (empty) source. The seeding waits until here so the callbacks it may
// trigger see a fully initialised module.
panel.setFontSizePt(loadFontSizePreference() ?? derivedFontSizePt());
panel.setMathMode(loadOnlyMathPreference());
panel.setFillColor(loadFillColorPreference() ?? derivedFillColor());
syncToSelection();
schedulePreview();
