/**
 * UI wiring for the "Custom fonts" panel: uploading font files, listing the
 * loaded fonts, and removing them. Adding or removing a font re-initializes
 * the Typst compiler and refreshes the preview.
 */

import { DOM_IDS, STORAGE_KEYS } from "./constants.js";
import { getDetailsElement, getHTMLElement, getInputElement } from "./utils/dom.js";
import { getStoredValue, storeValue } from "./utils/storage.js";
import {
  addFontFromFile,
  getUserFonts,
  removeFont,
  type UserFont,
} from "./registry/user-fonts.js";
import { reloadCompilerFonts } from "./typst.js";
import { updatePreview } from "./preview.js";
import { setStatus } from "./ui.js";

/**
 * Initializes the custom-fonts panel: restores its open state, renders the
 * current fonts, and wires up the file input.
 */
export function setupFontsPanel() {
  const details = getDetailsElement(DOM_IDS.FONTS_DETAILS);
  details.open = getStoredValue(STORAGE_KEYS.FONTS_OPEN) === "true";
  details.addEventListener("toggle", () => {
    storeValue(STORAGE_KEYS.FONTS_OPEN, details.open.toString());
  });

  const input = getInputElement(DOM_IDS.FONTS_INPUT);
  input.addEventListener("change", () => {
    void handleFilesSelected(input);
  });

  renderFontsList();
}

/**
 * Reads the selected files, adds them as user fonts, reloads the compiler and
 * refreshes the preview.
 */
async function handleFilesSelected(input: HTMLInputElement) {
  const files = Array.from(input.files ?? []);
  if (files.length === 0) {
    return;
  }
  // Reset so selecting the same file again still fires a change event.
  input.value = "";

  setStatus(`Loading ${files.length.toString()} font(s)…`);

  // Add each file independently so one bad file doesn't discard the others.
  const added: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      const font = await addFontFromFile(file);
      added.push(font.key);
    } catch (error) {
      console.error(`Failed to add custom font "${file.name}":`, error);
      failed.push(file.name);
    }
  }

  // Always apply whatever was added successfully, keeping registry/compiler/UI
  // in sync even if some files failed.
  if (added.length > 0) {
    try {
      await reloadCompilerFonts();
      renderFontsList();
      await updatePreview();
    } catch (error) {
      console.error("Failed to apply custom fonts:", error);
      setStatus("Added fonts, but failed to apply them.", true);
      return;
    }
  }

  if (failed.length > 0) {
    setStatus(`Could not add: ${failed.join(", ")}`, true);
  } else {
    setStatus(`Added: ${added.join(", ")}`);
  }
}

/**
 * Removes a font, reloads the compiler and refreshes the preview.
 */
async function handleRemove(key: string) {
  try {
    await removeFont(key);
    await reloadCompilerFonts();
    renderFontsList();
    await updatePreview();
    setStatus("");
  } catch (error) {
    console.error("Failed to remove custom font:", error);
    setStatus("Could not remove that font.", true);
  }
}

/**
 * Renders the list of loaded custom fonts.
 */
function renderFontsList() {
  const list = getHTMLElement(DOM_IDS.FONTS_LIST);
  list.innerHTML = "";

  const fonts = getUserFonts();
  if (fonts.length === 0) {
    const empty = document.createElement("li");
    empty.className = "fonts-empty";
    empty.textContent = "No custom fonts yet.";
    list.appendChild(empty);
    return;
  }

  for (const font of fonts) {
    list.appendChild(createFontRow(font));
  }
}

/**
 * Builds a single list row for a loaded font.
 */
function createFontRow(font: UserFont): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "fonts-item";

  const info = document.createElement("div");
  info.className = "fonts-item-info";

  const familyRow = document.createElement("div");
  familyRow.className = "fonts-item-family-row";

  const family = document.createElement("code");
  family.className = "fonts-item-family";
  family.textContent = font.family;
  family.title = `Use in Typst: #set text(font: "${font.family}")`;
  familyRow.appendChild(family);

  if (font.subfamily) {
    const style = document.createElement("span");
    style.className = "fonts-item-style";
    style.textContent = font.subfamily;
    familyRow.appendChild(style);
  }

  const fileName = document.createElement("span");
  fileName.className = "fonts-item-file";
  fileName.textContent = font.fileName;

  info.append(familyRow, fileName);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "fonts-item-remove";
  remove.textContent = "✕";
  remove.title = `Remove ${font.family}`;
  remove.setAttribute("aria-label", `Remove ${font.family}`);
  remove.onclick = () => void handleRemove(font.key);

  row.append(info, remove);
  return row;
}
