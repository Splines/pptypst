/**
 * The PPTypst window: widgets, layout and wording.
 *
 * All `ui.*` construction lives here. The panel knows nothing about Typst or
 * the scene — it exposes a small view interface and calls back on user action,
 * so `main.ts` owns what actually happens. Adding controls (e.g. colour) means
 * extending {@link Panel} and this file, not the orchestration.
 */

import { createMathDelimiters } from "./math-delimiter.ts";
import { createPreview } from "./preview.ts";
import { createResizeGrip } from "./resize-grip.ts";
import { createSizeField } from "./size-field.ts";

/** Seeded into the editor and shown as the placeholder while "Only Math" is off. */
const EXAMPLE_SOURCE = "$ integral_0^1 x^2 dif x = 1/3 $";
/** Placeholder while "Only Math" is on: the `$ ... $` is added for the user. */
const EXAMPLE_SOURCE_MATH = "integral_0^1 x^2 dif x = 1/3";

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
  /** The Size input changed; the app re-renders the live preview. */
  onFontSizeChanged: () => void;
  /**
   * The user toggled "Only Math". The app re-renders the preview and, when
   * inserting a fresh formula, remembers the choice as a user preference.
   */
  onMathModeChanged: () => void;
}

/** What the rest of the app may do to the panel. */
export interface Panel {
  getSource: () => string;
  setSource: (source: string) => void;
  getFontSizePt: () => number;
  setFontSizePt: (fontSizePt: number) => void;
  /** Whether "Only Math" is ticked, i.e. the source is wrapped in `$ ... $`. */
  getMathMode: () => boolean;
  /** Sets the "Only Math" tick and its editor cues without firing the handler. */
  setMathMode: (mathMode: boolean) => void;
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

/** Matches the PowerPoint add-in's `<input id="fontSize" min="1" step="1.0">`. */
const MIN_FONT_SIZE_PT = 1;
/** Generous upper bound; keeps the field narrow (four digits) and sane. */
const MAX_FONT_SIZE_PT = 1000;

/** The editor's height before the user drags the grip, in pixels. */
const EDITOR_DEFAULT_HEIGHT = 80;
/** How far the grip may shrink / grow the editor, in pixels. */
const EDITOR_MIN_HEIGHT = 50;
const EDITOR_MAX_HEIGHT = 600;

export function createPanel(handlers: PanelHandlers): Panel {
  ui.setTitle("PPTypst");

  const editor = new ui.MultiLineEdit();

  const mathDelimiters = createMathDelimiters();

  // The seeded example is only valid for one "Only Math" state (with the `$`
  // for off, without for on). While the user hasn't touched it, swapping the
  // toggle swaps the example too; once they type, we leave their text alone.
  let editorHoldsExample = true;
  // Set while `seedExample` calls `setText`, so the resulting `onValueChanged`
  // is ignored: it isn't a user edit, and firing `onSourceChanged` from here
  // can re-enter the app before its module finishes initialising.
  let seedingExample = false;
  const seedExample = (mathMode: boolean): void => {
    seedingExample = true;
    editor.setText(mathMode ? EXAMPLE_SOURCE_MATH : EXAMPLE_SOURCE);
    seedingExample = false;
  };

  // Reflects "Only Math" into the editor: the bracketing "$" plates appear,
  // and the placeholder switches to an example without the delimiters (the
  // user types the maths, PPTypst adds the `$ ... $`).
  const applyMathModeCues = (mathMode: boolean): void => {
    mathDelimiters.setActive(mathMode);
    editor.setPlaceholder(
      mathMode
        ? `Typst math, e.g.  ${EXAMPLE_SOURCE_MATH}`
        : `Typst source, e.g.  ${EXAMPLE_SOURCE}`,
    );
    if (editorHoldsExample) {
      seedExample(mathMode);
    }
  };

  seedExample(false);

  // A grab bar under the editor: drags resize it, and pinning it to a fixed
  // height keeps it from stretching as the window grows taller.
  const editorGrip = createResizeGrip(editor, {
    defaultHeight: EDITOR_DEFAULT_HEIGHT,
    minHeight: EDITOR_MIN_HEIGHT,
    maxHeight: EDITOR_MAX_HEIGHT,
  });

  const preview = createPreview();

  const fontSizeField = createSizeField({
    label: "Size",
    value: MIN_FONT_SIZE_PT,
    min: MIN_FONT_SIZE_PT,
    max: MAX_FONT_SIZE_PT,
    onChange: () => {
      handlers.onFontSizeChanged();
    },
  });

  // "Only Math" -- ticking it wraps the source in `$ ... $` before compiling,
  // so the user writes plain maths. Mirrors the PowerPoint add-in's checkbox.
  const mathModeCheckbox = new ui.Checkbox(false);
  const MATH_MODE_TOOLTIP = "Wrap the source in display-math delimiters ($) before compiling";
  const onMathModeToggled = (): void => {
    applyMathModeCues(mathModeCheckbox.getValue());
    handlers.onMathModeChanged();
  };
  mathModeCheckbox.onValueChanged = onMathModeToggled;

  // Cavalry's Checkbox carries no label and Label has no click event, so the
  // caption is a Label in a Container whose press toggles the box -- the usual
  // "click the words, not just the tick" accessibility affordance.
  const mathModeLabel = new ui.Label("Only Math");
  const mathModeLabelRow = new ui.HLayout();
  mathModeLabelRow.setMargins(2, 0, 2, 0);
  mathModeLabelRow.add(mathModeLabel);
  const mathModeLabelBox = new ui.Container();
  mathModeLabelBox.setLayout(mathModeLabelRow);
  mathModeLabelBox.setToolTip(MATH_MODE_TOOLTIP);
  mathModeCheckbox.setToolTip(MATH_MODE_TOOLTIP);
  mathModeLabelBox.onMousePress = () => {
    mathModeCheckbox.setValue(!mathModeCheckbox.getValue());
    onMathModeToggled();
  };

  const insertButton = new ui.Button("Insert");
  const status = new ui.Label("Ready.");

  insertButton.onClick = () => {
    handlers.onInsert();
  };
  editor.onValueChanged = () => {
    if (seedingExample) {
      return; // programmatic example swap, not a user edit
    }
    editorHoldsExample = false;
    handlers.onSourceChanged();
  };

  // Cavalry invokes this whenever the scene selection changes, letting the
  // panel follow the formula the user just clicked without a manual button.
  ui.addCallbackObject({
    onSelectionChanged: () => {
      handlers.onSelectionChanged();
    },
  });

  const fontSizeRow = new ui.HLayout();
  fontSizeRow.add(fontSizeField.widget);
  fontSizeRow.addSpacing(10);
  fontSizeRow.add(mathModeCheckbox, mathModeLabelBox);
  fontSizeRow.addStretch();

  ui.add(fontSizeRow);
  ui.add(mathDelimiters.top);
  ui.add(editor);
  ui.add(editorGrip.widget);
  ui.add(mathDelimiters.bottom);
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
    const width = panelWidth();
    preview.setWidth(width);
    editorGrip.setWidth(width);
  };

  ui.show();
  preview.setWidth(panelWidth());
  editorGrip.setWidth(panelWidth());
  applyMathModeCues(mathModeCheckbox.getValue());

  return {
    getSource: () => editor.getText().trim(),
    setSource: (source: string) => {
      editor.setText(source);
    },
    getFontSizePt: () => fontSizeField.getValue(),
    setFontSizePt: (fontSizePt: number) => {
      fontSizeField.setValue(fontSizePt);
    },
    getMathMode: () => mathModeCheckbox.getValue(),
    setMathMode: (mathMode: boolean) => {
      mathModeCheckbox.setValue(mathMode);
      // `setValue` may not fire `onValueChanged`, so refresh the cues here.
      applyMathModeCues(mathMode);
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
