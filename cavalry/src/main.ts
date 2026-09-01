/**
 * PPTypst for Cavalry — prototype entry point.
 *
 * Build (`npm run build`) emits `dist/pptypst-cavalry.js`. Paste that into
 * Cavalry's JavaScript Editor and run it: a window appears with a Typst editor
 * and an Insert button. Insert compiles the Typst to SVG and imports it as
 * vector layers grouped under "PPTypst: <formula>", storing the raw source on
 * the group so "Load from selection" can bring it back for editing.
 *
 * Before first use, set `ASSET_DIR` in `src/config.ts` (see README).
 */

import { renderTypstToSvg, onProgress } from "./typst";
import { findSelectedFormula, insertFormula } from "./scene";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

ui.setTitle("PPTypst");

const editor = new ui.MultiLineEdit();
editor.setPlaceholder("Typst source, e.g.  $ integral_0^1 x^2 dif x = 1/3 $");
editor.setText("$ integral_0^1 x^2 dif x = 1/3 $");

const insertButton = new ui.Button("Insert");
const loadButton = new ui.Button("Load from selection");
const status = new ui.Label("Ready.");

let loadedGroupId: string | null = null;

onProgress((message) => {
  status.setText(message);
});

async function runInsert(): Promise<void> {
  const code = editor.getText().trim();
  if (!code) {
    status.setText("Enter some Typst first.");
    return;
  }

  const replace = loadedGroupId && api.layerExists(loadedGroupId) ? loadedGroupId : undefined;
  status.setText("Compiling…");
  insertButton.setEnabled(false);
  try {
    const svg = await renderTypstToSvg(code);
    const groupId = insertFormula(svg, code, replace);
    loadedGroupId = groupId;
    status.setText(replace ? "Updated formula." : "Inserted formula.");
  } catch (err) {
    console.error("[pptypst] insert failed:", err);
    status.setText(`Compile failed: ${errorMessage(err)}`);
  } finally {
    insertButton.setEnabled(true);
  }
}

function loadFromSelection(): void {
  const found = findSelectedFormula();
  if (!found) {
    status.setText("Select a 'PPTypst: ...' group (or a layer inside one) first.");
    return;
  }
  editor.setText(found.code);
  loadedGroupId = found.groupId;
  status.setText("Loaded source. Edit it and press Insert to replace that formula.");
}

insertButton.onClick = () => {
  void runInsert();
};
loadButton.onClick = loadFromSelection;

editor.setMinimumHeight(120);
ui.add(editor);
ui.add(insertButton);
ui.add(loadButton);
ui.add(status);
ui.addStretch();
ui.setMinimumWidth(360);
ui.show();
