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
  onLoadFromSelection: () => {
    loadFromSelection();
  },
});

const engine = createTypstEngine({
  assets: createAssetReader(),
  files: ASSET_FILES,
  document: DOCUMENT,
  onProgress: panel.setStatus,
});

/** The formula currently being edited, if it is still in the scene. */
let editingLayerId: string | null = null;

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

  panel.setBusy(true);
  try {
    const svg = await engine.render(source);
    editingLayerId = insertFormula({ source }, svg, replaces);
    panel.setStatus(replaces ? "Updated formula." : "Inserted formula.");
  } catch (error) {
    console.error("[pptypst] insert failed:", error);
    panel.setStatus(`Failed: ${errorMessage(error)}`);
  } finally {
    panel.setBusy(false);
  }
}

function loadFromSelection(): void {
  const found = findSelectedFormula();
  if (!found) {
    panel.setStatus("Select a 'PPTypst: ...' group (or a layer inside one) first.");
    return;
  }
  panel.setSource(found.formula.source);
  editingLayerId = found.layerId;
  panel.setStatus("Loaded source. Edit it and press Insert to replace that formula.");
}
