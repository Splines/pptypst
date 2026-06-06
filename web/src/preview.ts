import { DiagnosticMessage, typst } from "./typst.js";
import { applyFillColor, parseAndApplySize } from "./svg.js";
import { DOM_IDS, PREVIEW_CONFIG, STORAGE_KEYS, FILL_COLOR_DISABLED } from "./constants.js";
import { getAreaElement, getHTMLElement, getInputElement } from "./utils/dom";
import {
  getFillColor,
  getFontSize,
  getPreambleCode,
  getEditorMode,
  getMathModeEnabled,
  getTypstCode,
  setButtonEnabled,
  setMathModeEnabled,
} from "./ui";
import { storeValue, getStoredValue } from "./utils/storage.js";

/**
 * Sets up event listeners for preview updates.
 */
export function setupPreviewListeners() {
  const typstInput = getAreaElement(DOM_IDS.TYPST_INPUT);
  const preambleInput = getAreaElement(DOM_IDS.PREAMBLE_INPUT);
  const fontSizeInput = getInputElement(DOM_IDS.FONT_SIZE);
  const fillColorInput = getInputElement(DOM_IDS.FILL_COLOR);
  const fillColorEnabled = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);
  const previewFillEnabled = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);
  const mathModeEnabled = getInputElement(DOM_IDS.MATH_MODE_ENABLED);

  typstInput.addEventListener("input", () => {
    updateButtonState();
    void updatePreview();
  });

  preambleInput.addEventListener("input", () => {
    if (getEditorMode() === "insert") {
      storeValue(STORAGE_KEYS.PREAMBLE, getPreambleCode());
    }
    void updatePreview();
  });

  fontSizeInput.addEventListener("input", () => {
    const fontSize = getFontSize();
    storeValue(STORAGE_KEYS.FONT_SIZE, fontSize);
    void updatePreview();
  });

  fillColorInput.addEventListener("input", () => {
    const fillColor = getFillColor();
    storeValue(STORAGE_KEYS.FILL_COLOR, fillColor);
  });

  fillColorEnabled.addEventListener("change", () => {
    const fillColor = getFillColor();
    const colorInput = getInputElement(DOM_IDS.FILL_COLOR);
    colorInput.disabled = !fillColorEnabled.checked;
    syncPreviewFillToggleState(fillColorEnabled.checked);
    storeValue(STORAGE_KEYS.FILL_COLOR, fillColor || FILL_COLOR_DISABLED);
    void updatePreview();
  });

  previewFillEnabled.addEventListener("change", () => {
    storeValue(STORAGE_KEYS.PREVIEW_FILL, previewFillEnabled.checked.toString());
    void updatePreview();
  });

  mathModeEnabled.addEventListener("change", () => {
    const mathMode = getMathModeEnabled();
    if (getEditorMode() === "insert") {
      // Only save to storage when in insert mode (no shape selected)
      storeValue(STORAGE_KEYS.MATH_MODE, mathMode.toString());
    }
    updateMathModeVisuals();
    void updatePreview();
  });

  syncPreviewFillToggleState(fillColorEnabled.checked);
  updateMathModeVisuals();
}

/**
 * Keeps preview fill toggle consistent with Fill checkbox behavior.
 */
function syncPreviewFillToggleState(isFillEnabled: boolean) {
  const previewFillEnabled = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED);

  if (isFillEnabled) {
    previewFillEnabled.checked = false;
    previewFillEnabled.disabled = true;
    storeValue(STORAGE_KEYS.PREVIEW_FILL, "false");
    return;
  }

  previewFillEnabled.disabled = false;
}

/**
 * Syncs preview fill toggle state based on the current fill checkbox value.
 */
export function syncPreviewFillToggleFromFillCheckbox() {
  const fillColorEnabled = getInputElement(DOM_IDS.FILL_COLOR_ENABLED);
  syncPreviewFillToggleState(fillColorEnabled.checked);
}

/**
 * Restores the math mode setting from localStorage.
 */
export function restoreMathModeFromStorage() {
  const savedMathMode = getStoredValue(STORAGE_KEYS.MATH_MODE);
  if (savedMathMode !== null) {
    setMathModeEnabled(savedMathMode === "true");
    updateMathModeVisuals();
    void updatePreview();
  }
}

/**
 * Updates the visual state of the input wrapper based on math mode.
 */
export function updateMathModeVisuals() {
  const mathMode = getMathModeEnabled();
  const inputWrapper = getHTMLElement(DOM_IDS.INPUT_WRAPPER);
  const textarea = getAreaElement(DOM_IDS.TYPST_INPUT);

  if (mathMode) {
    inputWrapper.classList.remove("math-mode-disabled");
    textarea.placeholder = "Enter Typst code, e.g. a^2 + b^2 = c^2";
  } else {
    inputWrapper.classList.add("math-mode-disabled");
    textarea.placeholder = "Enter Typst code, e.g. $ a^2 + b^2 = c^2 $";
  }
}

/**
 * Updates the preview panel with compiled SVG.
 */
export async function updatePreview() {
  const rawCode = getTypstCode().trim();
  const preamble = getPreambleCode();
  const fontSize = getFontSize();
  const mathMode = getMathModeEnabled();
  const previewElement = getHTMLElement(DOM_IDS.PREVIEW_CONTENT);
  const diagnosticsContainer = getHTMLElement(DOM_IDS.DIAGNOSTICS_CONTAINER);
  const diagnosticsContent = getHTMLElement(DOM_IDS.DIAGNOSTICS_CONTENT);

  if (!rawCode) {
    previewElement.innerHTML = "";
    diagnosticsContainer.style.display = "none";
    return;
  }

  const result = await typst({ body: rawCode, preamble }, fontSize, mathMode);

  if (result.diagnostics && result.diagnostics.length > 0) {
    diagnosticsContainer.style.display = "block";
    displayDiagnostics(result.diagnostics, diagnosticsContent);
  } else {
    diagnosticsContainer.style.display = "none";
  }

  if (!result.svg) {
    previewElement.innerHTML = "";
    return;
  }

  const { svgElement: processedSvg } = parseAndApplySize(result.svg);
  previewElement.innerHTML = processedSvg.outerHTML;
  previewElement.style.color = "";

  const svgElement = previewElement.querySelector("svg");
  if (!svgElement) return;

  svgElement.style.width = "100%";
  svgElement.style.height = "auto";
  svgElement.style.maxHeight = PREVIEW_CONFIG.MAX_HEIGHT;

  const isDarkMode = document.documentElement.classList.contains("dark-mode");
  const previewFill = isDarkMode ? PREVIEW_CONFIG.DARK_MODE_FILL : PREVIEW_CONFIG.LIGHT_MODE_FILL;
  const shouldKeepTypstFill = getInputElement(DOM_IDS.PREVIEW_FILL_ENABLED).checked;
  if (!shouldKeepTypstFill) {
    applyFillColor(svgElement, previewFill);
  }
}

/**
 * Displays diagnostics in the UI.
 */
function displayDiagnostics(
  diagnostics: (string | DiagnosticMessage)[],
  content: HTMLElement,
) {
  content.innerHTML = "";

  diagnostics.forEach((diag, index) => {
    if (typeof diag === "string") {
      const diagElement = document.createElement("div");
      diagElement.className = "diagnostic";
      diagElement.textContent = diag;
      content.appendChild(diagElement);
      return;
    }

    if (index > 0) {
      const separator = document.createElement("hr");
      separator.className = "diagnostic-separator";
      content.appendChild(separator);
    }

    const diagElement = document.createElement("div");
    diagElement.className = `diagnostic diagnostic-${diag.severity.toLowerCase()}`;

    const headerDiv = document.createElement("div");
    headerDiv.className = "diagnostic-header";

    const severitySpan = document.createElement("span");
    severitySpan.className = "diagnostic-severity";
    severitySpan.textContent = diag.severity;

    headerDiv.appendChild(severitySpan);

    const messageSpan = document.createElement("span");
    messageSpan.className = "diagnostic-message";
    messageSpan.textContent = diag.message;

    diagElement.appendChild(headerDiv);
    diagElement.appendChild(messageSpan);

    content.appendChild(diagElement);
  });
}

/**
 * Updates the insert button enabled state based on whether there's input.
 */
export function updateButtonState() {
  if (getEditorMode() === "multi-select") {
    setButtonEnabled(false);
    return;
  }

  const rawCode = getTypstCode().trim();
  setButtonEnabled(rawCode.length > 0);
}
