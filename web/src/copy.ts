/**
 * Handles copying the preview SVG to the clipboard upon clicking the copy button.
 */

import { DOM_IDS } from "./constants.js";
import { serializeSvgForClipboard } from "./svg.js";
import { setStatus } from "./ui.js";
import { getButtonElement, getHTMLElement } from "./utils/dom.js";

type ClipboardTextWriter = {
  writeText: (_text: string) => Promise<void>;
};

type ClipboardSvgWriter = ClipboardTextWriter & {
  write?: (_items: ClipboardItem[]) => Promise<void>;
};

type ClipboardItemConstructorLike = {
  new (
    _items: Record<string, string | Blob | PromiseLike<string | Blob>>,
    _options?: ClipboardItemOptions,
  ): ClipboardItem;
  supports?: (_type: string) => boolean;
};

let copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;
let clipboardUnavailable = false;

/**
 * Sets up the preview SVG copy button and its clipboard behavior.
 */
export function setupPreviewCopyButton() {
  const previewCopyButton = getPreviewCopyButton();
  const clipboard = getClipboardWriter();

  if (!window.isSecureContext || !clipboard) {
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

async function writeSvgToClipboard(svgText: string) {
  const clipboard = getClipboardWriter();
  if (!clipboard) {
    throw new Error("Clipboard API is not available.");
  }

  const ClipboardItemConstructor = getClipboardItemConstructor();
  if (clipboard.write && ClipboardItemConstructor && clipboardItemSupportsSvg(ClipboardItemConstructor)) {
    try {
      await clipboard.write([
        new ClipboardItemConstructor({
          "image/svg+xml": new Blob([svgText], { type: "image/svg+xml" }),
          "text/plain": new Blob([svgText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Some hosts expose rich clipboard APIs but reject SVG items at runtime.
    }
  }

  await clipboard.writeText(svgText);
}

function getClipboardWriter(): ClipboardSvgWriter | null {
  const clipboard = Reflect.get(navigator, "clipboard") as unknown;
  if (!isRecord(clipboard)) {
    return null;
  }

  const writeText = clipboard.writeText;
  if (typeof writeText !== "function") {
    return null;
  }

  const write = clipboard.write;
  if (write !== undefined && typeof write !== "function") {
    return null;
  }

  return {
    writeText: async (text) => {
      await writeText.call(clipboard, text);
    },
    write: typeof write === "function"
      ? async (items) => {
        await write.call(clipboard, items);
      }
      : undefined,
  };
}

function getClipboardItemConstructor(): ClipboardItemConstructorLike | null {
  const ClipboardItemConstructor = Reflect.get(globalThis, "ClipboardItem") as unknown;
  return isClipboardItemConstructor(ClipboardItemConstructor) ? ClipboardItemConstructor : null;
}

function clipboardItemSupportsSvg(ClipboardItemConstructor: ClipboardItemConstructorLike): boolean {
  if (typeof ClipboardItemConstructor.supports !== "function") {
    return true;
  }

  return ClipboardItemConstructor.supports("image/svg+xml");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClipboardItemConstructor(value: unknown): value is ClipboardItemConstructorLike {
  return typeof value === "function";
}
