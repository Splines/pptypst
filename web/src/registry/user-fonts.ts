/**
 * Management of user-provided (custom) fonts.
 *
 * Fonts are uploaded by the user in the browser, kept in memory so the Typst
 * compiler can use them, and persisted in IndexedDB so they survive a reload
 * of the task pane. Everything happens client-side; no server or fork needed.
 */

import { debug } from "../utils/logger.js";
import { readFontNames } from "./font-name.js";

/**
 * A custom font provided by the user. One entry corresponds to one font face
 * (e.g. "Noto Sans JP" Regular and "Noto Sans JP" Bold are two entries that
 * share the same family but differ by subfamily).
 */
export interface UserFont {
  /** Unique key per face: `family` plus `subfamily`, or the file name. */
  key: string;
  /** Family name to use in `#set text(font: "...")`. */
  family: string;
  /** Style within the family, e.g. "Regular", "Bold". May be empty. */
  subfamily: string;
  /** Original file name, shown in the UI. */
  fileName: string;
  /** Raw font bytes handed to the Typst compiler. */
  data: Uint8Array;
}

const DB_NAME = "pptypst-user-fonts";
const DB_VERSION = 1;
const STORE_NAME = "fonts";

let fonts: UserFont[] = [];

/**
 * @returns the currently loaded user fonts.
 */
export function getUserFonts(): readonly UserFont[] {
  return fonts;
}

/**
 * @returns the raw bytes of all user fonts, for handing to `loadFonts`.
 */
export function getUserFontData(): Uint8Array[] {
  return fonts.map(font => font.data);
}

/**
 * Opens (and lazily creates) the IndexedDB database.
 */
function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: "key" });
    }
  };
  return awaitRequest(request, "open");
}

/**
 * Wraps an IDBRequest in a promise.
 */
function awaitRequest<T>(request: IDBRequest<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`IndexedDB ${label} failed`));
    };
  });
}

/**
 * Wraps an IDBTransaction completion in a promise.
 */
function awaitTransaction(tx: IDBTransaction, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error(`IndexedDB ${label} failed`));
    };
  });
}

interface StoredFont {
  key: string;
  family: string;
  subfamily?: string;
  fileName: string;
  data: ArrayBuffer;
}

/**
 * Loads previously persisted fonts from IndexedDB into memory.
 *
 * Must be awaited before the first compiler initialization so persisted fonts
 * are available for the initial preview. Failures are non-fatal: the add-in
 * still works, just without persisted fonts.
 */
export async function loadStoredFonts(): Promise<void> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    const request = db.transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll() as IDBRequest<StoredFont[]>;
    const stored = await awaitRequest(request, "read");

    fonts = stored.map(font => ({
      key: font.key,
      family: font.family,
      subfamily: font.subfamily ?? "",
      fileName: font.fileName,
      data: new Uint8Array(font.data),
    }));
    debug(`Loaded ${fonts.length.toString()} persisted custom font(s)`);
  } catch (error) {
    console.warn("Could not load persisted custom fonts:", error);
    fonts = [];
  } finally {
    db?.close();
  }
}

/**
 * Persists a single font to IndexedDB.
 */
async function persistFont(font: UserFont): Promise<void> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      key: font.key,
      family: font.family,
      subfamily: font.subfamily,
      fileName: font.fileName,
      // Store a standalone ArrayBuffer copy (not a view into a larger buffer).
      data: font.data.slice().buffer,
    } satisfies StoredFont);
    await awaitTransaction(tx, "write");
  } catch (error) {
    console.warn("Could not persist custom font:", error);
  } finally {
    db?.close();
  }
}

/**
 * Removes a single font from IndexedDB.
 */
async function unpersistFont(key: string): Promise<void> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    await awaitTransaction(tx, "delete");
  } catch (error) {
    console.warn("Could not remove persisted custom font:", error);
  } finally {
    db?.close();
  }
}

/**
 * Adds a font from an uploaded file: reads its bytes, detects the family name,
 * stores it in memory and persists it.
 *
 * @param file The font file selected by the user.
 * @returns the added font (caller is responsible for reloading the compiler).
 */
export async function addFontFromFile(file: File): Promise<UserFont> {
  const data = new Uint8Array(await file.arrayBuffer());
  const names = readFontNames(data);
  const family = names.family ?? stripExtension(file.name);
  const subfamily = names.subfamily ?? "";

  // Key per face so multiple weights/styles of the same family coexist
  // (e.g. "Noto Sans JP" Regular and Bold). Re-adding the same face replaces it.
  const key = subfamily ? `${family} ${subfamily}` : family;

  const font: UserFont = { key, family, subfamily, fileName: file.name, data };

  fonts = fonts.filter(existing => existing.key !== key);
  fonts.push(font);

  await persistFont(font);
  debug(`Added custom font "${key}" from ${file.name}`);
  return font;
}

/**
 * Removes a font by its key from memory and IndexedDB.
 */
export async function removeFont(key: string): Promise<void> {
  fonts = fonts.filter(font => font.key !== key);
  await unpersistFont(key);
  debug(`Removed custom font "${key}"`);
}

/**
 * Drops the file extension from a file name for use as a fallback family label.
 */
function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
