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

import { ASSET_FILES, DOCUMENT } from "./config.ts";
import { createAssetReader } from "./platform/files.ts";
import { createPanel } from "./platform/panel.ts";
import { findSelectedFormula, insertFormula } from "./platform/scene.ts";
import { createTypstEngine } from "./typst/engine.ts";

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
});

const engine = createTypstEngine({
  assets: createAssetReader(),
  files: ASSET_FILES,
  document: DOCUMENT,
  onProgress: panel.setStatus,
});

/** The formula currently loaded for editing, if it is still in the scene. */
let editingLayerId: string | null = null;

/**
 * True while a render is in flight. Selection sync is paused for the duration
 * so a click in the scene can't swap the editor source out from under an
 * insert that is already using the text captured when it started.
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

  setBusy(true);
  try {
    const svg = await engine.render(source);
    editingLayerId = insertFormula({ source }, svg, replaces);
    panel.setEditing(true);
    panel.setStatus(replaces ? "Updated formula." : "Inserted formula.");
  } catch (error) {
    console.error("[pptypst] insert failed:", error);
    panel.setStatus(`Failed: ${errorMessage(error)}`);
  } finally {
    setBusy(false);
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
      panel.setStatus("No formula selected — Insert creates a new one.");
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
  panel.setSource(found.formula.source);
  panel.setEditing(true);
  panel.setStatus("Loaded formula from selection — Insert now updates it.");
}

function setBusy(value: boolean): void {
  busy = value;
  panel.setBusy(value);
}

// Reflect whatever happens to be selected when the panel opens.
syncToSelection();
