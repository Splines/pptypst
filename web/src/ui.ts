import {
  DOM_IDS,
  DEFAULTS,
  BUTTON_TEXT,
  STORAGE_KEYS,
  FILL_COLOR_DISABLED,
  PREAMBLE_UI,
} from "./constants.js";
import {
  getInputElement,
  getHTMLElement,
  getAreaElement,
  getButtonElement,
  getDetailsElement,
} from "./utils/dom.js";
import { insertOrUpdateFormula, bulkUpdateFontSize } from "./insertion.js";
import { getStoredValue, storeValue } from "./utils/storage.js";
import { handleGenerateFromFile } from "./file/file.js";

export type EditorMode = "insert" | "edit" | "multi-select";
let currentEditorMode: EditorMode = "insert";

/**
 * Initializes the UI state.
 */
export function initializeUIState() {
  const savedFontSize = getStoredValue(STORAGE_KEYS.FONT_SIZE);
  if (savedFontSize) {
    setFontSize(savedFontSize);
  }

  const savedFillColor = getStoredValue(STORAGE_KEYS.FILL_COLOR);
  if (savedFillColor) {
    setFillColor(savedFillColor === FILL_COLOR_DISABLED ? null : savedFillColor);
  }

  const savedMathMode = getStoredValue(STORAGE_KEYS.MATH_MODE);
  if (savedMathMode !== null) {
    setMathModeEnabled(savedMathMode === "true");
  }

  const savedPreamble = getStoredValue(STORAGE_KEYS.PREAMBLE);
  setPreambleCode(savedPreamble || DEFAULTS.PREAMBLE);

  const preambleDetails = getDetailsElement(DOM_IDS.PREAMBLE_DETAILS);
  preambleDetails.open = getStoredValue(STORAGE_KEYS.PREAMBLE_OPEN) === "true";

  const savedPreviewFill = getStoredValue(STORAGE_KEYS.PREVIEW_FILL);
  if (savedPreviewFill !== null) {
    setPreviewFillEnabled(savedPreviewFill === "true");
  }

  updatePreamblePresentation();
}

/**
 * Sets up event listeners for UI interactions.
 */
export function setupEventListeners() {
  const insertButton = getButtonElement(DOM_IDS.INSERT_BTN);
  insertButton.onclick = insertOrUpdateFormula;

  const bulkUpdateButton = getButtonElement(DOM_IDS.BULK_UPDATE_BTN);
  bulkUpdateButton.onclick = bulkUpdateFontSize;

  const handleCtrlEnter = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      void insertOrUpdateFormula();
    }
  };

  const typstInput = getAreaElement(DOM_IDS.TYPST_INPUT);
  typstInput.addEventListener("keydown", handleCtrlEnter);

  const preambleInput = getAreaElement(DOM_IDS.PREAMBLE_INPUT);
  preambleInput.addEventListener("keydown", handleCtrlEnter);
  preambleInput.addEventListener("input", updatePreamblePresentation);

  const preambleDetails = getDetailsElement(DOM_IDS.PREAMBLE_DETAILS);
  preambleDetails.addEventListener("toggle", () => {
    storeValue(STORAGE_KEYS.PREAMBLE_OPEN, preambleDetails.open.toString());

    if (preambleDetails.open && !preambleInput.disabled) {
      requestAnimationFrame(() => {
        preambleInput.focus();
        const cursor = preambleInput.value.length;
        preambleInput.setSelectionRange(cursor, cursor);
      });
    }
  });

  const fontSizeInput = getInputElement(DOM_IDS.FONT_SIZE);
  fontSizeInput.addEventListener("keydown", handleCtrlEnter);

  const generateFromFileBtn = getButtonElement(DOM_IDS.GENERATE_FROM_FILE_BTN);
  generateFromFileBtn.onclick = handleGenerateFromFile;
}

/**
 * Sets the status message in the UI.
 */
export function setStatus(message: string, isError = false) {
  const statusElement = getHTMLElement(DOM_IDS.STATUS);
  statusElement.textContent = message || "";
  statusElement.classList.toggle("error", isError);
}

/**
 * @returns the current font size from the UI
 */
export function getFontSize(): string {
  return getInputElement(DOM_IDS.FONT_SIZE).value;
}

/**
 * Sets the font size in the UI.
 */
export function setFontSize(fontSize: string) {
  getInputElement(DOM_IDS.FONT_SIZE).value = fontSize;
}

/**
 * @returns Fill color value or empty string if disabled
 */
export function getFillColor(): string {
  const checkbox = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);
  const enabled = checkbox.checked;
  if (!enabled) return "";

  const fillColorInput = getInputElement(DOM_IDS.FILL_COLOR);
  return fillColorInput.value || DEFAULTS.FILL_COLOR;
}

/**
 * @returns whether preview should keep Typst's own fill colors.
 */
export function getPreviewFillEnabled(): boolean {
  const checkbox = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);
  return checkbox.checked;
}

/**
 * Sets whether preview should keep Typst's own fill colors.
 */
export function setPreviewFillEnabled(enabled: boolean) {
  const checkbox = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);
  checkbox.checked = enabled;
}

/**
 * Sets the fill color in the UI.
 *
 * @param color Fill color to set, or null to disable
 */
export function setFillColor(color: string | null) {
  const fillColorInput = getInputElement(DOM_IDS.FILL_COLOR);
  const checkbox = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);

  if (color) {
    checkbox.checked = true;
    fillColorInput.value = color;
    fillColorInput.disabled = false;
  } else {
    checkbox.checked = false;
    fillColorInput.disabled = true;
  }
}

/**
 * @returns Typst source code from the UI input
 */
export function getTypstCode(): string {
  return getAreaElement(DOM_IDS.TYPST_INPUT).value;
}

/**
 * Sets the Typst code in the UI input.
 */
export function setTypstCode(typstCode: string) {
  getAreaElement(DOM_IDS.TYPST_INPUT).value = typstCode;
}

/**
 * @returns Typst preamble from the UI input
 */
export function getPreambleCode(): string {
  return getAreaElement(DOM_IDS.PREAMBLE_INPUT).value;
}

/**
 * Sets the Typst preamble in the UI input.
 */
export function setPreambleCode(preamble: string) {
  getAreaElement(DOM_IDS.PREAMBLE_INPUT).value = preamble;
  updatePreamblePresentation();
}

/**
 * Restores the global preamble from local storage.
 */
export function restorePreambleFromStorage() {
  const savedPreamble = getStoredValue(STORAGE_KEYS.PREAMBLE);
  setPreambleCode(savedPreamble || DEFAULTS.PREAMBLE);
}

/**
 * @returns the current editor mode.
 */
export function getEditorMode(): EditorMode {
  return currentEditorMode;
}

/**
 * Tracks whether the task pane is inserting, editing, or locked by multi-select.
 */
export function setEditorMode(mode: EditorMode) {
  currentEditorMode = mode;
  updatePreamblePresentation();
}

/**
 * Updates the button text based on whether a Typst shape is selected.
 */
export function setButtonText(isEditingExistingFormula: boolean) {
  const button = getHTMLElement(DOM_IDS.INSERT_BTN) as HTMLButtonElement;
  button.innerHTML = isEditingExistingFormula ? BUTTON_TEXT.UPDATE : BUTTON_TEXT.INSERT;

  if (isEditingExistingFormula) {
    button.classList.add("update-mode");
  } else {
    button.classList.remove("update-mode");
  }
}

/**
 * Enables or disables the insert button.
 */
export function setButtonEnabled(enabled: boolean) {
  const button = getHTMLElement(DOM_IDS.INSERT_BTN) as HTMLButtonElement;
  button.disabled = !enabled;
}

/**
 * Shows or hides the bulk update button.
 *
 * This button is used to update the font size of multiple selected Typst shapes.
 */
export function setBulkUpdateButtonVisible(visible: boolean) {
  const button = getButtonElement(DOM_IDS.BULK_UPDATE_BTN);
  button.style.display = visible ? "block" : "none";
}

/**
 * @returns Whether math mode is enabled
 */
export function getMathModeEnabled(): boolean {
  const checkbox = getInputElement(DOM_IDS.MATH_MODE_ENABLED);
  return checkbox.checked;
}

/**
 * Sets the math mode enabled state in the UI.
 */
export function setMathModeEnabled(enabled: boolean) {
  const checkbox = getInputElement(DOM_IDS.MATH_MODE_ENABLED);
  checkbox.checked = enabled;
}

/**
 * Updates the file button text based on whether a Typst shape is selected.
 */
export function setFileButtonText(isEditingExistingFormula: boolean) {
  const button = getButtonElement(DOM_IDS.GENERATE_FROM_FILE_BTN);
  button.textContent = isEditingExistingFormula ? BUTTON_TEXT.UPDATE_FROM_FILE : BUTTON_TEXT.GENERATE_FROM_FILE;
}

/**
 * Updates the preamble panel label and locked state.
 */
function updatePreamblePresentation() {
  const preambleInput = getAreaElement(DOM_IDS.PREAMBLE_INPUT);
  const preambleDetails = getDetailsElement(DOM_IDS.PREAMBLE_DETAILS);
  const summaryElement = getHTMLElement(DOM_IDS.PREAMBLE_SUMMARY);

  const isLocked = currentEditorMode === "multi-select";

  let labelText: string = PREAMBLE_UI.GLOBAL_LABEL;
  let summaryTitle: string = PREAMBLE_UI.GLOBAL_TITLE;
  if (currentEditorMode === "edit") {
    labelText = PREAMBLE_UI.SHAPE_LABEL;
    summaryTitle = PREAMBLE_UI.SHAPE_TITLE;
  } else if (currentEditorMode === "multi-select") {
    labelText = PREAMBLE_UI.MULTI_LABEL;
    summaryTitle = PREAMBLE_UI.MULTI_TITLE;
  }

  preambleInput.disabled = isLocked;
  preambleDetails.classList.toggle("is-readonly", isLocked);
  summaryElement.textContent = labelText;
  summaryElement.title = summaryTitle;
}
