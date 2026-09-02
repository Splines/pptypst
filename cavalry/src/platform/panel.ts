/**
 * The PPTypst window: widgets, layout and wording.
 *
 * All `ui.*` construction lives here. The panel knows nothing about Typst or
 * the scene — it exposes a small view interface and calls back on user action,
 * so `main.ts` owns what actually happens. Adding controls (e.g. color) means
 * extending {@link Panel} and this file, not the orchestration.
 */

import { createColorField } from "./color-field.ts";
import { createMathDelimiters } from "./math-delimiter.ts";
import { createPreview } from "./preview.ts";
import { createResizeGrip } from "./resize-grip.ts";
import { createSizeField } from "./size-field.ts";

/** Shown as the editor placeholder while "Only Math" is off. */
const EXAMPLE_SOURCE = "$ integral_0^1 x^2 dif x = 1/3 $";
/** Placeholder while "Only Math" is on: the `$ ... $` is added for the user. */
const EXAMPLE_SOURCE_MATH = "integral_0^1 x^2 dif x = 1/3";
/** Placeholder in the preamble editor. */
const EXAMPLE_PREAMBLE = '#import "@preview/physica:0.9.8": *';

/**
 * Preamble section wording, following the PowerPoint add-in's `PREAMBLE_UI`.
 * The label switches with scope: with nothing being edited the field is the
 * "Global preamble" (the default for new formulas); with a formula group
 * selected it is that formula's own "Shape preamble".
 */
const PREAMBLE_UI = {
  GLOBAL_LABEL: "Global preamble",
  SHAPE_LABEL: "Shape preamble",
  GLOBAL_TITLE:
    "Compiled before every new formula. Formulas already in the scene keep their own preamble until you update them.",
  SHAPE_TITLE:
    "Belongs to the selected formula; saved back onto it when you press Update.",
} as const;

/**
 * The preamble editor's height when first expanded, in pixels -- roughly double
 * the source editor's, since a preamble is usually several `#import` / `#let`
 * lines. Draggable via its own grip, within the shared editor min/max.
 */
const PREAMBLE_EDITOR_DEFAULT_HEIGHT = 112;

/** Actions the panel reports; implemented by the composition root. */
export interface PanelHandlers {
  onInsert: () => void;
  /**
   * The "Update font size" button (shown while several formulas are selected)
   * was clicked. The app re-renders every selected formula with its own source,
   * color and math mode but the size from {@link Panel.getBulkFontSizePt}.
   */
  onBulkUpdate: () => void;
  /**
   * The scene selection changed. The panel does not know what is selected —
   * the app inspects the scene and calls back with {@link Panel.setEditing} /
   * {@link Panel.setMultiSelect}.
   */
  onSelectionChanged: () => void;
  /** The editor text changed; the app re-renders the live preview. */
  onSourceChanged: () => void;
  /**
   * The preamble editor text changed. The app re-renders the preview and, when
   * nothing is being edited (global scope), remembers it as the default for
   * new formulas.
   */
  onPreambleChanged: () => void;
  /**
   * The user expanded (`true`) or collapsed (`false`) the preamble section.
   * The app remembers the state for next launch.
   */
  onPreambleToggled: (open: boolean) => void;
  /** The Size input changed; the app re-renders the live preview. */
  onFontSizeChanged: () => void;
  /**
   * The user toggled "Only Math". The app re-renders the preview and, when
   * inserting a fresh formula, remembers the choice as a user preference.
   */
  onMathModeChanged: () => void;
  /**
   * The user picked a different fill color. The app re-renders the preview
   * and, when inserting a fresh formula, remembers the color as a preference.
   */
  onFillColorChanged: () => void;
  /**
   * The user clicked "Reset". The app restores the size, color and "Only
   * Math" tick to their derived defaults (font size from the composition
   * height, color from its background) and, for a fresh insert, forgets the
   * remembered choices.
   */
  onReset: () => void;
}

/** What the rest of the app may do to the panel. */
export interface Panel {
  getSource: () => string;
  setSource: (source: string) => void;
  /** The preamble editor text, trimmed. */
  getPreamble: () => string;
  /** Sets the preamble editor text (fires {@link PanelHandlers.onPreambleChanged}). */
  setPreamble: (preamble: string) => void;
  /** Expands or collapses the preamble section without firing a handler. */
  setPreambleOpen: (open: boolean) => void;
  getFontSizePt: () => number;
  setFontSizePt: (fontSizePt: number) => void;
  /** The font size in the bulk row's own input (shown only in multi-select). */
  getBulkFontSizePt: () => number;
  /** Seeds the bulk row's input, normally with the first selected formula's size. */
  setBulkFontSizePt: (fontSizePt: number) => void;
  /** Whether "Only Math" is ticked, i.e. the source is wrapped in `$ ... $`. */
  getMathMode: () => boolean;
  /** Sets the "Only Math" tick and its editor cues without firing the handler. */
  setMathMode: (mathMode: boolean) => void;
  /** The chosen fill color as a hex string. */
  getFillColor: () => string;
  /** Sets the Color chip without firing the handler. */
  setFillColor: (hex: string) => void;
  /** Shows an informational message under the action button, in the normal ink. */
  showInfo: (message: string) => void;
  /** Shows an error message under the action button, in bright red. */
  showError: (message: string) => void;
  /** Disables the actions while a render is in flight. */
  setBusy: (busy: boolean) => void;
  /**
   * Switches the primary action between inserting a fresh formula ("Insert")
   * and replacing the one currently selected in the scene ("Update"), and with
   * it the preamble section's scope: "Shape preamble" while editing, "Global
   * preamble" otherwise.
   */
  setEditing: (editing: boolean) => void;
  /**
   * Enters (`true`) or  (`false`) multi-select mode: the "Insert" /
   * "Update" button is swleavesapped for a row holding a font-size input and an
   * "Update font size" button (see {@link PanelHandlers.onBulkUpdate}).
   */
  setMultiSelect: (active: boolean) => void;
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
const EDITOR_DEFAULT_HEIGHT = 60;
/** How far the grip may shrink / grow the editor, in pixels. */
const EDITOR_MIN_HEIGHT = 45;
const EDITOR_MAX_HEIGHT = 280;

/**
 * Height cap for the whole window, in pixels. Cavalry has no "open at this
 * size" API -- only min/max/fixed -- and a script window otherwise opens
 * taller than its content, leaving dead space under the status line. Capping
 * the height makes the first open snug while still letting the user drag it
 * shorter (and a little taller, up to this, for the editor grip's range).
 */
const MAX_WINDOW_HEIGHT = 680;

/**
 * Right-hand inset, on top of the 3px default margin, kept clear for the
 * window's own vertical scrollbar. Cavalry draws that scrollbar as an overlay
 * on the very edge; the gutter stops it landing on top of the source / preamble
 * editors' own inner scrollbars, which would otherwise be impossible to grab.
 * Applied only while the content actually overflows the window (see
 * `syncScrollbarGutter`) -- a permanent empty strip looks worse than it helps.
 *
 * Tuned to about the scrollbar's own width, so the leftover space between the
 * content and the scrollbar roughly matches the panel's 3px left margin.
 */
const WINDOW_SCROLLBAR_GUTTER = 12;

/** Editor text size, in pixels; the toolkit default is too small to read comfortably. */
const EDITOR_FONT_SIZE_PX = 18;

/** Status-line ink: near-white for normal messages, bright red for errors. */
const STATUS_INK = "#e6e6e6";
const STATUS_ERROR_INK = "#ff5c5c";

export function createPanel(handlers: PanelHandlers): Panel {
  ui.setTitle("PPTypst");

  // Whether the right-hand scrollbar gutter is currently applied. Toggled by
  // `syncScrollbarGutter` (defined below) whenever the content might have grown
  // or shrunk past the window height.
  let gutterOn = false;

  const editor = new ui.MultiLineEdit();
  editor.setFontSize(EDITOR_FONT_SIZE_PX);

  const mathDelimiters = createMathDelimiters();

  // Reflects "Only Math" into the editor: the bracketing "$" plates appear and
  // the placeholder switches to an example without the delimiters (the user
  // types the maths, PPTypst adds the `$ ... $`). The editor starts empty -- no
  // seeded example -- so a fresh window shows only the placeholder.
  const applyMathModeCues = (mathMode: boolean): void => {
    mathDelimiters.setActive(mathMode);
    editor.setPlaceholder(
      mathMode
        ? `Typst math, e.g.  ${EXAMPLE_SOURCE_MATH}`
        : `Typst source, e.g.  ${EXAMPLE_SOURCE}`,
    );
  };

  // A grab bar under the editor: drags resize it, and pinning it to a fixed
  // height keeps it from stretching as the window grows taller. Each drag may
  // push the content past the window height, so re-check the scrollbar gutter.
  const editorGrip = createResizeGrip(editor, {
    defaultHeight: EDITOR_DEFAULT_HEIGHT,
    minHeight: EDITOR_MIN_HEIGHT,
    maxHeight: EDITOR_MAX_HEIGHT,
    onResize: () => {
      syncScrollbarGutter();
    },
  });

  const preview = createPreview();

  // Collapsible preamble editor: `#import` / `#let` lines compiled ahead of the
  // body. A summary row (a Label in a pressable Container, the same affordance
  // as "Only Math" above) toggles it; the editor itself is hidden when
  // collapsed. Its label -- "Global preamble" vs "Shape preamble" -- follows the
  // editing state, set from `setEditing` via `applyPreambleScope`.
  const preambleEditor = new ui.MultiLineEdit();
  preambleEditor.setFontSize(EDITOR_FONT_SIZE_PX);
  preambleEditor.setPlaceholder(`Typst preamble, e.g.  ${EXAMPLE_PREAMBLE}`);
  preambleEditor.onValueChanged = () => {
    handlers.onPreambleChanged();
  };

  // Its own grab bar, like the source editor's -- `createResizeGrip` pins the
  // starting height. Both it and the editor are hidden while the section is
  // collapsed (see `applyPreambleOpen`).
  const preambleGrip = createResizeGrip(preambleEditor, {
    defaultHeight: PREAMBLE_EDITOR_DEFAULT_HEIGHT,
    minHeight: EDITOR_MIN_HEIGHT,
    maxHeight: EDITOR_MAX_HEIGHT,
    onResize: () => {
      syncScrollbarGutter();
    },
  });
  preambleEditor.setHidden(true);
  preambleGrip.widget.setHidden(true);

  let preambleOpen = false;
  let preambleShapeScope = false;

  const preambleSummary = new ui.Label("");
  preambleSummary.setFontSize(11);
  const preambleSummaryRow = new ui.HLayout();
  preambleSummaryRow.setMargins(2, 4, 2, 4);
  preambleSummaryRow.add(preambleSummary);
  preambleSummaryRow.addStretch();
  const preambleSummaryBox = new ui.Container();
  preambleSummaryBox.setLayout(preambleSummaryRow);

  const refreshPreambleSummary = (): void => {
    const label = preambleShapeScope ? PREAMBLE_UI.SHAPE_LABEL : PREAMBLE_UI.GLOBAL_LABEL;
    preambleSummary.setText(`${preambleOpen ? "▾" : "▸"}  ${label}`);
    preambleSummaryBox.setToolTip(
      preambleShapeScope ? PREAMBLE_UI.SHAPE_TITLE : PREAMBLE_UI.GLOBAL_TITLE,
    );
  };

  const applyPreambleOpen = (open: boolean): void => {
    preambleOpen = open;
    preambleEditor.setHidden(!open);
    preambleGrip.widget.setHidden(!open);
    refreshPreambleSummary();
    syncScrollbarGutter(); // expanding the section can push content past the window
  };

  const applyPreambleScope = (shapeScope: boolean): void => {
    preambleShapeScope = shapeScope;
    refreshPreambleSummary();
  };

  preambleSummaryBox.onMousePress = () => {
    applyPreambleOpen(!preambleOpen);
    handlers.onPreambleToggled(preambleOpen);
  };

  refreshPreambleSummary(); // fill the label before the window is shown

  const fontSizeField = createSizeField({
    label: "Size",
    value: MIN_FONT_SIZE_PT,
    min: MIN_FONT_SIZE_PT,
    max: MAX_FONT_SIZE_PT,
    onChange: () => {
      handlers.onFontSizeChanged();
    },
  });

  // Fill color for the inserted formula (not the preview strip, which stays a
  // fixed white-on-dark readability check). The real default is seeded by the
  // app from the saved preference or the composition background.
  const colorField = createColorField({
    label: "Color",
    value: "#ffffff",
    onChange: () => {
      handlers.onFillColorChanged();
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

  // Sits next to "Only Math"; restores Size, Color and the tick to the
  // defaults the app derives from the active composition.
  const resetButton = new ui.Button("Reset");
  resetButton.setFontSize(11);
  resetButton.setFixedWidth(52);
  resetButton.setToolTip("Reset Size, Color and “Only Math” to their defaults for this composition");
  resetButton.onClick = () => {
    handlers.onReset();
  };

  const insertButton = new ui.Button("Insert");
  // Taller than the toolkit default, with symmetric padding so the label sits
  // in the vertical centre rather than riding high in the box.
  insertButton.setFixedHeight(30);
  insertButton.setContentsMargins(0, 0, 0, 0);

  // Multi-select action: a font-size input and an "Update font size" button
  // that takes its place while several formulas are selected. Its input is
  // separate from the top "Size" field (that one drives single insert/update).
  const bulkSizeField = createSizeField({
    label: "Size",
    value: MIN_FONT_SIZE_PT,
    min: MIN_FONT_SIZE_PT,
    max: MAX_FONT_SIZE_PT,
    onChange: () => {
      /* no live preview in bulk mode; the value is read on button press */
    },
  });
  const bulkButton = new ui.Button("Update font size");
  bulkButton.setFixedHeight(30);
  bulkButton.setContentsMargins(0, 0, 0, 0);
  bulkButton.setToolTip("Re-render every selected formula at this font size, keeping its own text, color and math mode");
  bulkButton.onClick = () => {
    handlers.onBulkUpdate();
  };
  const bulkRow = new ui.HLayout();
  bulkRow.setMargins(0, 0, 0, 0);
  bulkRow.add(bulkSizeField.widget);
  bulkRow.addSpacing(8);
  bulkRow.add(bulkButton);
  const bulkBox = new ui.Container();
  bulkBox.setLayout(bulkRow);
  bulkBox.setHidden(true);

  // Opens on "Loading..." -- `main.ts` warms up the wasm engine on show and
  // flips this to "Ready." when it finishes.
  const status = new ui.Label("Loading...");
  status.setTextColor(STATUS_INK);

  // A Label can't be selected, but status messages -- Typst compile errors above
  // all -- are worth pasting elsewhere. Wrap it so a right-click offers "Copy
  // message", putting the current text on the system clipboard.
  let statusMessage = "Loading...";
  const statusLayout = new ui.VLayout();
  statusLayout.setMargins(0, 0, 0, 0);
  statusLayout.add(status);
  const statusBox = new ui.Container();
  statusBox.setLayout(statusLayout);
  statusBox.setToolTip("Right-click to copy this message");
  statusBox.onMousePress = (_position, button) => {
    if (button === "right" && statusMessage !== "") {
      ui.showContextMenu();
    }
  };
  ui.addMenuItem({
    name: "Copy message",
    onMouseRelease: () => {
      api.setClipboardText(statusMessage);
    },
  });

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

  const fontSizeRow = new ui.HLayout();
  fontSizeRow.add(fontSizeField.widget);
  fontSizeRow.addSpacing(6);
  fontSizeRow.add(colorField.widget);
  fontSizeRow.addSpacing(10);
  fontSizeRow.add(mathModeCheckbox, mathModeLabelBox);
  fontSizeRow.addSpacing(10);
  fontSizeRow.add(resetButton);
  fontSizeRow.addStretch();

  ui.add(fontSizeRow);
  ui.add(mathDelimiters.top);
  ui.add(editor);
  ui.add(editorGrip.widget);
  ui.add(mathDelimiters.bottom);
  ui.add(preambleSummaryBox);
  ui.add(preambleEditor);
  ui.add(preambleGrip.widget);
  ui.add(preview.widget);
  ui.add(insertButton);
  ui.add(bulkBox);
  ui.add(statusBox);
  ui.addStretch();
  ui.setMinimumWidth(360);
  ui.setMaximumHeight(MAX_WINDOW_HEIGHT);

  // Keep the preview strip spanning the panel as it is resized. Usable content
  // width is the window width less the left margin (3px) and the right margin --
  // 3px, plus the scrollbar gutter while it is applied. `ui.size()` is typed
  // `unknown` by the Cavalry types.
  const panelWidth = (): number =>
    (ui.size() as { width: number }).width - 6 - (gutterOn ? WINDOW_SCROLLBAR_GUTTER : 0);

  function applyContentWidths(): void {
    const width = panelWidth();
    preview.setWidth(width);
    editorGrip.setWidth(width);
    preambleGrip.setWidth(width);
  }

  /**
   * The window's overflow scrollbar is an overlay on the right edge -- with no
   * gutter it covers the source / preamble editors' own scrollbars. So reserve
   * the gutter only while the content is actually taller than the window: an
   * empty 16px strip the rest of the time looks worse than it helps.
   *
   * `span` is the rendered distance from the top of the first widget to the
   * bottom of the last, plus the 3px top and bottom margins; it is unaffected
   * by scroll position (both ends move together). Toggling only reflows the
   * layout narrower/wider, which cannot flip the result back (a narrower status
   * line only grows taller), so this settles in one pass.
   */
  function syncScrollbarGutter(): void {
    const size = ui.size() as { width: number; height: number };
    const span
      = statusBox.geometry().bottom - fontSizeField.widget.geometry().top + 6;
    if (span <= 6) {
      return; // geometry not laid out yet
    }
    const want = span > size.height + 2;
    if (want === gutterOn) {
      return;
    }
    gutterOn = want;
    ui.setMargins(3, 3, gutterOn ? 3 + WINDOW_SCROLLBAR_GUTTER : 3, 3);
    applyContentWidths();
  }

  ui.onResize = () => {
    applyContentWidths();
    syncScrollbarGutter();
  };

  ui.show();
  applyContentWidths();
  applyMathModeCues(mathModeCheckbox.getValue());

  // Geometry is not settled synchronously after `show`; check the gutter on the
  // next tick, and again on every resize / grip drag / preamble toggle.
  const gutterTimer = new api.Timer({
    onTimeout: () => {
      syncScrollbarGutter();
    },
  });
  gutterTimer.setRepeating(false);
  gutterTimer.setInterval(0);
  gutterTimer.start();

  return {
    getSource: () => editor.getText().trim(),
    setSource: (source: string) => {
      editor.setText(source);
    },
    getPreamble: () => preambleEditor.getText().trim(),
    setPreamble: (preamble: string) => {
      preambleEditor.setText(preamble);
    },
    setPreambleOpen: (open: boolean) => {
      applyPreambleOpen(open);
    },
    getFontSizePt: () => fontSizeField.getValue(),
    setFontSizePt: (fontSizePt: number) => {
      fontSizeField.setValue(fontSizePt);
    },
    getBulkFontSizePt: () => bulkSizeField.getValue(),
    setBulkFontSizePt: (fontSizePt: number) => {
      bulkSizeField.setValue(fontSizePt);
    },
    getMathMode: () => mathModeCheckbox.getValue(),
    setMathMode: (mathMode: boolean) => {
      mathModeCheckbox.setValue(mathMode);
      // `setValue` may not fire `onValueChanged`, so refresh the cues here.
      applyMathModeCues(mathMode);
    },
    getFillColor: () => colorField.getValue(),
    setFillColor: (hex: string) => {
      colorField.setValue(hex);
    },
    showInfo: (message: string) => {
      statusMessage = message;
      status.setText(message);
      status.setTextColor(STATUS_INK);
      syncScrollbarGutter(); // a longer message can wrap to another line
    },
    showError: (message: string) => {
      statusMessage = message;
      status.setText(message);
      status.setTextColor(STATUS_ERROR_INK);
      syncScrollbarGutter();
    },
    setBusy: (busy: boolean) => {
      insertButton.setEnabled(!busy);
      bulkButton.setEnabled(!busy);
    },
    setEditing: (editing: boolean) => {
      insertButton.setText(editing ? "Update" : "Insert");
      applyPreambleScope(editing);
    },
    setMultiSelect: (active: boolean) => {
      insertButton.setHidden(active);
      bulkBox.setHidden(!active);
      // A preamble only makes sense per formula; keep the field from looking
      // editable while several are selected.
      preambleEditor.setReadOnly(active);
      syncScrollbarGutter();
    },
    showPreview: preview.show,
    clearPreview: preview.clear,
  };
}
