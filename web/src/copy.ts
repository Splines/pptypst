/**
 * Handles copying the preview SVG to the clipboard upon clicking the copy button.
 */

import { DOM_IDS } from "./constants.js";
import { serializeSvgForClipboard } from "./svg.js";
import { setStatus } from "./ui.js";
import { getButtonElement, getHTMLElement } from "./utils/dom.js";

let copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;
let clipboardUnavailable = false;

/**
 * Sets up the preview SVG copy button and its clipboard behavior.
 */
export function setupPreviewCopyButton() {
  const previewCopyButton = getPreviewCopyButton();

  if (!isClipboardAvailable()) {
    clipboardUnavailable = true;
    previewCopyButton.hidden = true;
    return;
  }

  previewCopyButton.addEventListener("click", (event) => {
    void copyPreviewSvg(event.shiftKey);
  });
  setPreviewCopyButtonEnabled(false);
}

/**
 * Shows or hides the preview copy button based on preview SVG availability.
 */
export function setPreviewCopyButtonEnabled(enabled: boolean) {
  if (clipboardUnavailable) {
    return;
  }

  const previewCopyButton = getPreviewCopyButton();

  if (!enabled) {
    previewCopyButton.hidden = true;
    previewCopyButton.classList.remove("is-copied");
    if (copyFeedbackTimeout) {
      clearTimeout(copyFeedbackTimeout);
      copyFeedbackTimeout = undefined;
    }
  } else {
    previewCopyButton.hidden = false;
  }

  previewCopyButton.disabled = !enabled;
}

async function copyPreviewSvg(invertColors: boolean) {
  const previewElement = getHTMLElement(DOM_IDS.PREVIEW_CONTENT);
  const svgElement = previewElement.querySelector("svg");
  if (!svgElement) {
    return;
  }

  try {
    const svgText = serializeSvgForClipboard(svgElement, invertColors);
    await writeSvgToClipboard(svgText);
    showPreviewCopyFeedback();
  } catch {
    setStatus("Could not copy preview SVG.", true);
  }
}

/**
 * Writes the SVG as a rich clipboard item so it can be pasted into vector
 * editors, falling back to plain text when that is not possible.
 */
async function writeSvgToClipboard(svgText: string) {
  if (hasClipboardItem()) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/svg+xml": new Blob([svgText], { type: "image/svg+xml" }),
          "text/plain": new Blob([svgText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Some hosts expose ClipboardItem but reject SVG payloads at runtime,
      // so we fall back to writing plain text below.
    }
  }

  await navigator.clipboard.writeText(svgText);
}

function isClipboardAvailable(): boolean {
  return window.isSecureContext && isDefined(navigator.clipboard);
}

function hasClipboardItem(): boolean {
  return isDefined(globalThis.ClipboardItem);
}

function isDefined(value: unknown): boolean {
  return value !== undefined;
}

function showPreviewCopyFeedback() {
  const previewCopyButton = getPreviewCopyButton();
  previewCopyButton.classList.add("is-copied");

  if (copyFeedbackTimeout) {
    clearTimeout(copyFeedbackTimeout);
  }

  copyFeedbackTimeout = setTimeout(() => {
    previewCopyButton.classList.remove("is-copied");
    copyFeedbackTimeout = undefined;
  }, 1300);
}

function getPreviewCopyButton(): HTMLButtonElement {
  return getButtonElement(DOM_IDS.PREVIEW_COPY_BTN);
}
