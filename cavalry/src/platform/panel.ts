/**
 * The PPTypst window: widgets, layout and wording.
 *
 * All `ui.*` construction lives here. The panel knows nothing about Typst or
 * the scene — it exposes a small view interface and calls back on user action,
 * so `main.ts` owns what actually happens. Adding controls (font size, colour)
 * means extending {@link Panel} and this file, not the orchestration.
 */

const EXAMPLE_SOURCE = "$ integral_0^1 x^2 dif x = 1/3 $";

/** Actions the panel reports; implemented by the composition root. */
export interface PanelHandlers {
  onInsert: () => void;
  onLoadFromSelection: () => void;
}

/** What the rest of the app may do to the panel. */
export interface Panel {
  getSource: () => string;
  setSource: (source: string) => void;
  setStatus: (message: string) => void;
  /** Disables the actions while a render is in flight. */
  setBusy: (busy: boolean) => void;
}

export function createPanel(handlers: PanelHandlers): Panel {
  ui.setTitle("PPTypst");

  const editor = new ui.MultiLineEdit();
  editor.setPlaceholder(`Typst source, e.g.  ${EXAMPLE_SOURCE}`);
  editor.setText(EXAMPLE_SOURCE);
  editor.setMinimumHeight(120);

  const insertButton = new ui.Button("Insert");
  const loadButton = new ui.Button("Load from selection");
  const status = new ui.Label("Ready.");

  insertButton.onClick = () => {
    handlers.onInsert();
  };
  loadButton.onClick = () => {
    handlers.onLoadFromSelection();
  };

  ui.add(editor);
  ui.add(insertButton);
  ui.add(loadButton);
  ui.add(status);
  ui.addStretch();
  ui.setMinimumWidth(360);
  ui.show();

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
      loadButton.setEnabled(!busy);
    },
  };
}
