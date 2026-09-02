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
import { createAssetReader, createPackageStore } from "./platform/files.ts";
import { createPanel } from "./platform/panel.ts";
import {
  DEFAULT_ONLY_MATH,
  loadFillColorPreference,
  loadFontSizePreference,
  loadOnlyMathPreference,
  loadPreambleOpenPreference,
  loadPreamblePreference,
  saveFillColorPreference,
  saveFontSizePreference,
  saveOnlyMathPreference,
  savePreambleOpenPreference,
  savePreamblePreference,
} from "./platform/preferences.ts";
import {
  findSelectedFormulas,
  getActiveCompBackgroundHex,
  getActiveCompHeightPx,
  insertFormula,
  type SceneFormula,
} from "./platform/scene.ts";
import { createTypstEngine } from "./typst/engine.ts";

/** How long the editor must be idle before the preview re-renders. */
const PREVIEW_DEBOUNCE_MS = 0;

/** Shown under the action button when the Size field is left blank. */
const NO_FONT_SIZE_MESSAGE = "Enter a font size first.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Status line after an insert. When the figure was too big to import as one
 * layer per shape, `insertFormula` combined same-style paths -- say so, with
 * the original shape count, so the user knows why the layers look merged.
 */
function insertedMessage(replaced: boolean, combinedFromShapes: number | null): string {
  const base = replaced ? "Updated formula." : "Inserted formula.";
  return combinedFromShapes === null
    ? base
    : `${base} It is made up of ${String(combinedFromShapes)} shapes, which would be too much for a speedy insert, so instead we combined paths with the same style into shared layers.`;
}

/** Point size a fresh formula defaults to, scaled to the active composition. */
function derivedFontSizePt(): number {
  return defaultFontSizePt(getActiveCompHeightPx(), FONT_SIZE_REFERENCE);
}

/** Fill color a fresh formula defaults to: contrast against the comp background. */
function derivedFillColor(): string {
  return contrastInk(getActiveCompBackgroundHex());
}

const panel = createPanel({
  onInsert: () => {
    void insert();
  },
  onBulkUpdate: () => {
    void bulkUpdate();
  },
  onSelectionChanged: () => {
    syncToSelection();
  },
  onSourceChanged: () => {
    schedulePreview();
  },
  onPreambleChanged: () => {
    // Global scope (nothing being edited): the field IS the default for new
    // formulas, so keep the saved copy in step as the user types. In shape
    // scope the preamble rides along on the formula and is saved by `insert`.
    if (editingLayerId === null) {
      savePreamblePreference(panel.getPreamble());
    }
    schedulePreview();
  },
  onPreambleToggled: (open: boolean) => {
    savePreambleOpenPreference(open);
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
  packages: createPackageStore(),
  files: ASSET_FILES,
  document: DOCUMENT,
});

/** The formula currently loaded for editing, if it is still in the scene. */
let editingLayerId: string | null = null;

/**
 * The formulas the panel is in bulk font-size mode for, or `null` when it is
 * not (fewer than two selected). Captured on selection so the "Update font
 * size" button knows what to re-render.
 */
let bulkFormulas: SceneFormula[] | null = null;

/**
 * True while the status line is showing the transient "N formulas selected."
 * hint, so leaving multi-select can wipe it (but a real message put there since
 * -- e.g. "Updated N of M ..." -- is left alone).
 */
let bulkHintShown = false;

/**
 * True while an insert render is in flight. The preview yields to it (they share
 * the single engine) and selection sync is paused, so a click in the scene
 * can't swap the editor source out from under the insert.
 */
let busy = false;

async function insert(): Promise<void> {
  if (bulkFormulas) {
    // The Insert button is hidden in multi-select, but guard anyway.
    return;
  }
  const source = panel.getSource();
  if (!source) {
    panel.showError("Enter some Typst first.");
    return;
  }

  // Only replace a formula that is still in the scene; otherwise insert fresh.
  const replaces = editingLayerId !== null && api.layerExists(editingLayerId)
    ? editingLayerId
    : undefined;

  const preamble = panel.getPreamble();
  const fontSizePt = panel.getFontSizePt();
  const mathMode = panel.getMathMode();
  const color = panel.getFillColor();

  // Catch a blank Size field here rather than letting a 0pt document reach the
  // Typst compiler, whose error would be far less obvious.
  if (!(fontSizePt > 0)) {
    panel.showError(NO_FONT_SIZE_MESSAGE);
    return;
  }

  setBusy(true);
  try {
    const svg = await engine.render(source, preamble, fontSizePt, mathMode, color);
    const inserted = insertFormula({ source, preamble, fontSizePt, mathMode, color }, svg, replaces);
    editingLayerId = inserted.layerId;
    if (replaces === undefined) {
      // A fresh insert: the preamble it used becomes the default for the next
      // one. An update leaves the global default alone -- the preamble is now
      // stored on that formula.
      savePreamblePreference(preamble);
    }
    panel.setEditing(true);
    panel.showPreview(svg);
    panel.showInfo(insertedMessage(replaces !== undefined, inserted.combinedFromShapes));
  } catch (error) {
    console.error("[pptypst] insert failed:", error);
    panel.showError(errorMessage(error));
  } finally {
    setBusy(false);
    void refreshPreview(); // catch up if the text changed mid-insert
  }
}

/**
 * Re-renders every formula captured in {@link bulkFormulas} at the font size in
 * the panel's bulk input, each keeping its own source, preamble, color and math
 * mode. Each is replaced in place (centre and rotation preserved) by
 * `insertFormula`.
 */
async function bulkUpdate(): Promise<void> {
  const targets = bulkFormulas;
  if (!targets || targets.length === 0) {
    return;
  }

  const fontSizePt = panel.getBulkFontSizePt();
  if (!(fontSizePt > 0)) {
    panel.showError(NO_FONT_SIZE_MESSAGE);
    return;
  }

  setBusy(true);
  let updated = 0;
  try {
    for (const { layerId, formula } of targets) {
      if (!api.layerExists(layerId)) {
        continue; // deleted since selection
      }
      try {
        const svg = await engine.render(
          formula.source, formula.preamble, fontSizePt, formula.mathMode, formula.color,
        );
        insertFormula({ ...formula, fontSizePt }, svg, layerId);
        updated++;
      } catch (error) {
        console.error("[pptypst] bulk font-size update failed for a formula:", error);
      }
    }
    saveFontSizePreference(fontSizePt);
    // A real result now, not the transient selection hint -- so the re-sync
    // below leaves it on screen.
    bulkHintShown = false;
    panel.showInfo(
      `Updated ${String(updated)} of ${String(targets.length)} formulas to ${String(fontSizePt)}pt.`,
    );
  } finally {
    setBusy(false);
  }

  if (updated > 0) {
    // `insertFormula` left the last new group selected; reflect that so the
    // panel drops out of multi-select. An all-failed run keeps its message and
    // its selection instead.
    syncToSelection();
  }
}

/**
 * Mirrors the scene selection into the panel. Two or more formulas selected
 * switches to bulk font-size mode. Selecting an intact PPTypst group loads its
 * source and turns the action into "Update". Selecting a loose "Typst Shape"
 * left behind by ungrouping also loads its settings, but keeps the action as
 * "Insert": rebuilding a whole formula from one glyph (and undoing the user's
 * ungrouping) is not what they want. Selecting anything else leaves the editor
 * as-is and puts the action back to "Insert".
 */
function syncToSelection(): void {
  if (busy) {
    return;
  }

  const formulas = findSelectedFormulas();
  // Bulk mode acts on whole formula groups only; loose "Typst Shape" glyphs
  // left by ungrouping are for fine animation work, not a size sweep.
  const groups = formulas.filter(f => f.grouped);

  if (groups.length >= 2) {
    // Bulk font-size mode: the "Update font size" row replaces the action
    // button, its input seeded with the first selected formula's size.
    editingLayerId = null;
    bulkFormulas = groups;
    panel.setMultiSelect(true);
    panel.setBulkFontSizePt(groups[0].formula.fontSizePt);
    panel.showInfo(`${String(groups.length)} formulas selected.`);
    bulkHintShown = true;
    return;
  }

  bulkFormulas = null;
  panel.setMultiSelect(false);
  if (bulkHintShown) {
    // Leaving multi-select: drop the "N formulas selected." hint (a real
    // message set since then survives -- see `bulkUpdate`).
    panel.showInfo("");
    bulkHintShown = false;
  }

  if (formulas.length === 0) {
    if (editingLayerId !== null) {
      editingLayerId = null;
      panel.setEditing(false);
      // Leaving a formula: the preamble field goes back to the global default
      // so a shape-specific preamble does not linger as if it were global.
      panel.setPreamble(loadPreamblePreference());
    }
    return;
  }

  const found = formulas[0];

  if (found.grouped && found.layerId === editingLayerId) {
    // Already editing this one (e.g. the group we just inserted and selected);
    // don't reload and clobber any edits in progress.
    panel.setEditing(true);
    return;
  }

  // Only an intact group can be updated in place; a loose glyph loads read-only
  // and a button press inserts a fresh formula. Set this first so the preamble
  // section shows the right scope before its text is loaded below (and so
  // `onPreambleChanged` sees the correct scope if `setPreamble` fires it).
  editingLayerId = found.grouped ? found.layerId : null;
  panel.setEditing(found.grouped);

  panel.setFontSizePt(found.formula.fontSizePt);
  panel.setMathMode(found.formula.mathMode);
  panel.setFillColor(found.formula.color);
  panel.setPreamble(found.formula.preamble);
  panel.setSource(found.formula.source); // fires onSourceChanged -> schedulePreview
  // The Size / Math / Color setters above fire no handlers, so persist here:
  // the last object the user touched becomes what the next launch opens with.
  rememberSettings();
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
    panel.showError(message);
  } else if (previewErrorShown) {
    previewErrorShown = false;
    panel.showInfo("");
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
      source, panel.getPreamble(), panel.getFontSizePt(), panel.getMathMode(), panel.getFillColor(),
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
panel.setPreambleOpen(loadPreambleOpenPreference());
panel.setPreamble(loadPreamblePreference()); // global default; a selection below may override
syncToSelection();
schedulePreview();

// Load the wasm compiler and fonts now rather than on the first keystroke. The
// status line opens on "Loading..." (see panel.ts); flip it to "Ready." once the
// engine is up, or show why it failed.
void engine.init().then(
  () => {
    panel.showInfo("Ready.");
  },
  (error: unknown) => {
    console.error("[pptypst] engine init failed:", error);
    panel.showError(errorMessage(error));
  },
);
