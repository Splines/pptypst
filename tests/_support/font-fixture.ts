/**
 * Generates a minimal, tiny sfnt (TrueType) font in memory for tests.
 *
 * The font is not meant to be rendered (the Typst compiler is mocked in tests);
 * it only carries a valid `name` table so that the add-in's family/subfamily
 * detection and the Custom fonts UI can be exercised against a real font file
 * without committing a large binary fixture.
 */

/** Encodes a string as big-endian UTF-16 (the encoding used by Windows name records). */
function utf16be(value: string): Buffer {
  const buffer = Buffer.alloc(value.length * 2);
  for (let i = 0; i < value.length; i++) {
    buffer.writeUInt16BE(value.charCodeAt(i), i * 2);
  }
  return buffer;
}

/**
 * Builds a minimal font whose `name` table reports the given family and
 * subfamily (style) names.
 */
export function makeTestFont(family: string, subfamily: string): Buffer {
  const records = [
    { nameId: 1, value: utf16be(family) }, // Font Family
    { nameId: 2, value: utf16be(subfamily) }, // Font Subfamily
  ];

  // --- name table ---
  const nameHeaderSize = 6;
  const stringStorageOffset = nameHeaderSize + records.length * 12;
  const strings = Buffer.concat(records.map(record => record.value));
  const nameTable = Buffer.alloc(stringStorageOffset + strings.length);

  nameTable.writeUInt16BE(0, 0); // format 0
  nameTable.writeUInt16BE(records.length, 2); // count
  nameTable.writeUInt16BE(stringStorageOffset, 4); // string storage offset

  let recordOffset = nameHeaderSize;
  let stringOffset = 0;
  for (const record of records) {
    nameTable.writeUInt16BE(3, recordOffset); // platformID: Windows
    nameTable.writeUInt16BE(1, recordOffset + 2); // encodingID: Unicode BMP
    nameTable.writeUInt16BE(0x0409, recordOffset + 4); // languageID: English (US)
    nameTable.writeUInt16BE(record.nameId, recordOffset + 6);
    nameTable.writeUInt16BE(record.value.length, recordOffset + 8); // length
    nameTable.writeUInt16BE(stringOffset, recordOffset + 10); // offset in storage
    recordOffset += 12;
    stringOffset += record.value.length;
  }
  strings.copy(nameTable, stringStorageOffset);

  // --- sfnt wrapper: offset table + one table record pointing at `name` ---
  const offsetTableSize = 12;
  const tableRecordSize = 16;
  const nameTableFileOffset = offsetTableSize + tableRecordSize;
  const font = Buffer.alloc(nameTableFileOffset + nameTable.length);

  font.writeUInt32BE(0x00010000, 0); // sfntVersion: TrueType
  font.writeUInt16BE(1, 4); // numTables
  // searchRange/entrySelector/rangeShift are not read by the parser; leave 0.

  font.write("name", offsetTableSize, "ascii"); // tag
  font.writeUInt32BE(0, offsetTableSize + 4); // checksum (unused by the parser)
  font.writeUInt32BE(nameTableFileOffset, offsetTableSize + 8); // offset
  font.writeUInt32BE(nameTable.length, offsetTableSize + 12); // length
  nameTable.copy(font, nameTableFileOffset);

  return font;
}
