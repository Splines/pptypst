/**
 * Minimal OpenType/TrueType `name` table reader.
 *
 * Extracts the human-readable family and subfamily (style) names from raw font
 * bytes so the UI can tell the user exactly what to type in
 * `#set text(font: "...")` and so different weights of the same family can be
 * told apart. This is a best-effort helper: if the format is unsupported (e.g.
 * WOFF, which stores compressed tables) it returns `null` fields and the caller
 * falls back to the file name.
 *
 * Reference: https://learn.microsoft.com/en-us/typography/opentype/spec/name
 */

// Name IDs we care about, in order of preference within each kind.
const NAME_ID_FONT_FAMILY = 1;
const NAME_ID_FONT_SUBFAMILY = 2;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_TYPOGRAPHIC_SUBFAMILY = 17;

/**
 * Family and subfamily (style) names read from a font.
 */
export interface FontNames {
  /** e.g. "Noto Sans JP" — what the user types in `#set text(font: ...)`. */
  family: string | null;
  /** e.g. "Bold", "Regular", "SemiBold Italic". */
  subfamily: string | null;
}

/**
 * Reads the family and subfamily names from raw font bytes.
 *
 * @param data Raw font file bytes (TTF/OTF, or TTC collection).
 */
export function readFontNames(data: Uint8Array): FontNames {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sfntOffset = resolveSfntOffset(view);
    if (sfntOffset === null) {
      return { family: null, subfamily: null };
    }
    const nameTableOffset = findNameTable(view, sfntOffset);
    if (nameTableOffset === null) {
      return { family: null, subfamily: null };
    }
    return parseNameTable(view, nameTableOffset);
  } catch {
    return { family: null, subfamily: null };
  }
}

/**
 * Resolves the offset of the sfnt table directory, transparently unwrapping a
 * TrueType Collection (`ttcf`) by pointing at its first font. Returns `null`
 * for formats we cannot parse directly (e.g. WOFF/WOFF2).
 */
function resolveSfntOffset(view: DataView): number | null {
  const tag = view.getUint32(0);
  // 'ttcf' collection: read the offset of the first contained font.
  if (tag === 0x74746366) {
    return view.getUint32(12);
  }
  // 0x00010000 (TrueType), 'OTTO' (CFF), 'true', 'typ1'.
  if (
    tag === 0x00010000
    || tag === 0x4f54544f
    || tag === 0x74727565
    || tag === 0x74797031
  ) {
    return 0;
  }
  // 'wOFF' / 'wOF2' and anything else: unsupported here.
  return null;
}

/**
 * Scans the table directory for the `name` table and returns its offset.
 */
function findNameTable(view: DataView, sfntOffset: number): number | null {
  const numTables = view.getUint16(sfntOffset + 4);
  const recordsStart = sfntOffset + 12;
  const NAME_TAG = 0x6e616d65; // 'name'

  for (let i = 0; i < numTables; i++) {
    const record = recordsStart + i * 16;
    if (view.getUint32(record) === NAME_TAG) {
      return view.getUint32(record + 8);
    }
  }
  return null;
}

/**
 * A name-table candidate, kept alongside whether it is an English record so we
 * can prefer English family names over localized ones.
 */
interface NameCandidate {
  value: string;
  isEnglish: boolean;
}

/**
 * Parses the `name` table, returning the best available family and subfamily.
 *
 * Preference order: typographic names (IDs 16/17) over the basic family/style
 * names (IDs 1/2), and an English record over a localized one within the same
 * ID.
 */
function parseNameTable(view: DataView, tableOffset: number): FontNames {
  const count = view.getUint16(tableOffset + 2);
  const stringStorage = tableOffset + view.getUint16(tableOffset + 4);
  const recordsStart = tableOffset + 6;

  let typographicFamily: NameCandidate | null = null;
  let fontFamily: NameCandidate | null = null;
  let typographicSubfamily: NameCandidate | null = null;
  let fontSubfamily: NameCandidate | null = null;

  for (let i = 0; i < count; i++) {
    const record = recordsStart + i * 12;
    const platformId = view.getUint16(record);
    const languageId = view.getUint16(record + 4);
    const nameId = view.getUint16(record + 6);

    const length = view.getUint16(record + 8);
    const offset = stringStorage + view.getUint16(record + 10);
    const value = decodeNameString(view, offset, length, platformId);
    if (!value) {
      continue;
    }

    const candidate: NameCandidate = { value, isEnglish: isEnglish(platformId, languageId) };
    switch (nameId) {
      case NAME_ID_TYPOGRAPHIC_FAMILY:
        typographicFamily = preferEnglish(typographicFamily, candidate);
        break;
      case NAME_ID_FONT_FAMILY:
        fontFamily = preferEnglish(fontFamily, candidate);
        break;
      case NAME_ID_TYPOGRAPHIC_SUBFAMILY:
        typographicSubfamily = preferEnglish(typographicSubfamily, candidate);
        break;
      case NAME_ID_FONT_SUBFAMILY:
        fontSubfamily = preferEnglish(fontSubfamily, candidate);
        break;
    }
  }

  return {
    family: (typographicFamily ?? fontFamily)?.value ?? null,
    subfamily: (typographicSubfamily ?? fontSubfamily)?.value ?? null,
  };
}

/**
 * Keeps the existing candidate unless we don't have one yet, or the new one is
 * English and the existing one is not.
 */
function preferEnglish(current: NameCandidate | null, next: NameCandidate): NameCandidate {
  if (!current) {
    return next;
  }
  if (next.isEnglish && !current.isEnglish) {
    return next;
  }
  return current;
}

/**
 * Whether a name record is explicitly English. Windows uses language ID
 * 0x0409 and Macintosh uses 0. Unicode/other platforms carry no reliable
 * language marker, so they are not treated as English — that way an explicit
 * English record is preferred over an early platform-0 record of unknown
 * language (while still falling back to the first record when none is English).
 */
function isEnglish(platformId: number, languageId: number): boolean {
  if (platformId === 3) {
    return languageId === 0x0409;
  }
  if (platformId === 1) {
    return languageId === 0;
  }
  return false;
}

/**
 * Decodes a name string. Windows (platform 3) and Unicode (platform 0) records
 * are UTF-16BE; Macintosh (platform 1) records are treated as Latin-1.
 */
function decodeNameString(
  view: DataView, offset: number, length: number, platformId: number,
): string {
  if (platformId === 1) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += String.fromCharCode(view.getUint8(offset + i));
    }
    return result;
  }

  // UTF-16BE (platform 0 = Unicode, platform 3 = Windows).
  let result = "";
  for (let i = 0; i + 1 < length; i += 2) {
    result += String.fromCharCode(view.getUint16(offset + i));
  }
  return result;
}
