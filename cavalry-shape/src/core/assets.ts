/**
 * Port for reading the vendored binary assets (wasm modules, fonts).
 *
 * Declared here, away from any Cavalry API, so the Typst engine can be driven
 * from a plain Node test with a stub reader.
 */
export interface AssetReader {
  /** Reads a file from the asset directory by name. Throws if it is missing. */
  read(fileName: string): Uint8Array;
}
