/**
 * Base64 decoding.
 *
 * Cavalry's engine has no native `atob` (verified by direct probing), and
 * `api.encodeBinary` is the only way to read a binary file, so every wasm
 * module and font file goes through here.
 */

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const B64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) {
    table[B64_CHARS.charCodeAt(i)] = i;
  }
  table["=".charCodeAt(0)] = 0;
  return table;
})();

/**
 * Decodes a base64 string (as returned by `api.encodeBinary`) into raw bytes.
 * Tolerates whitespace and missing padding.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((clean.length * 3) / 4) - padding;
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)];
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 3)];

    const chunk = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (p < byteLength) bytes[p++] = (chunk >> 16) & 0xff;
    if (p < byteLength) bytes[p++] = (chunk >> 8) & 0xff;
    if (p < byteLength) bytes[p++] = chunk & 0xff;
  }
  return bytes;
}
