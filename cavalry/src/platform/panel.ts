/**
 * The PPTypst window: widgets, layout and wording.
 *
 * All `ui.*` construction lives here. The panel knows nothing about Typst or
 * the scene — it exposes a small view interface and calls back on user action,
 * so `main.ts` owns what actually happens. Adding controls (font size, colour)
 * means extending {@link Panel} and this file, not the orchestration.
 */

import { createPreview } from "./preview.ts";

const EXAMPLE_SOURCE = "$ integral_0^1 x^2 dif x = 1/3 $";

/** Actions the panel reports; implemented by the composition root. */
export interface PanelHandlers {
  onInsert: () => void;
  /**
   * The scene selection changed. The panel does not know what is selected —
   * the app inspects the scene and calls back with {@link Panel.setEditing}.
   */
  onSelectionChanged: () => void;
  /** The editor text changed; the app re-renders the live preview. */
  onSourceChanged: () => void;
}

/** What the rest of the app may do to the panel. */
export interface Panel {
  getSource: () => string;
  setSource: (source: string) => void;
  setStatus: (message: string) => void;
  /** Disables the actions while a render is in flight. */
  setBusy: (busy: boolean) => void;
  /**
   * Switches the primary action between inserting a fresh formula ("Insert")
   * and replacing the one currently selected in the scene ("Update").
   */
  setEditing: (editing: boolean) => void;
  /** Repaints the live preview from raw typst.ts SVG. */
  showPreview: (svg: string) => void;
  /** Clears the live preview. */
  clearPreview: () => void;
}

export function createPanel(handlers: PanelHandlers): Panel {
  ui.setTitle("PPTypst");

  const editor = new ui.MultiLineEdit();
  editor.setPlaceholder(`Typst source, e.g.  ${EXAMPLE_SOURCE}`);
  editor.setText(EXAMPLE_SOURCE);
  editor.setMinimumHeight(120);

  const preview = createPreview();
  const insertButton = new ui.Button("Insert");
  const status = new ui.Label("Ready.");

  insertButton.onClick = () => {
    handlers.onInsert();
  };
  editor.onValueChanged = () => {
    handlers.onSourceChanged();
  };

  // Cavalry invokes this whenever the scene selection changes, letting the
  // panel follow the formula the user just clicked without a manual button.
  ui.addCallbackObject({
    onSelectionChanged: () => {
      handlers.onSelectionChanged();
    },
  });

  ui.add(editor);
  ui.add(preview.widget);
  ui.add(insertButton);
  ui.add(status);
  ui.addStretch();
  ui.setMinimumWidth(360);

  // Keep the preview strip spanning the panel as it is resized. The default
  // layout margin is 3px a side, so the usable content width is 6px short.
  // `ui.size()` is typed `unknown` by the Cavalry types.
  const panelWidth = (): number => (ui.size() as { width: number }).width - 6;
  ui.onResize = () => {
    preview.setWidth(panelWidth());
  };

  ui.show();
  preview.setWidth(panelWidth());

  return {
    getSource: () => editor.getText().trim(),
    setSource: (source: string) => {
      editor.setText(source);
    },
    setStatus: (message: string) => {
      status.setText(message);
    },
    setBusy: (busy: boolean) => {
      insertButton.setEnabled(!busy);
    },
    setEditing: (editing: boolean) => {
      insertButton.setText(editing ? "Update" : "Insert");
    },
    showPreview: preview.show,
    clearPreview: preview.clear,
  };
}
