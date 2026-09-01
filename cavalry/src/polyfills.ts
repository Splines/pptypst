/**
 * Cavalry-engine shims typst.ts needs, plus a base64 decoder for reading the
 * wasm/font bytes Cavalry hands us via `api.encodeBinary`.
 *
 * `TextEncoder`/`TextDecoder`/`queueMicrotask`/`fetch` all read as `undefined`
 * on a fresh Cavalry engine. Earlier probing here mistakenly concluded the
 * first three were unnecessary: it tested "install the shim, then `delete` it"
 * rather than "never touch the global at all", and Cavalry's engine appears to
 * lazily register its (otherwise identical) native versions of these the first
 * time anything *touches* `globalThis.X` -- including our own assignment --
 * after which the native binding persists even once our value is deleted. That
 * made the delete-based test pass regardless of whether the shim is actually
 * needed. Skipping the install outright (i.e. never touching the global) is
 * what a real "is this needed" test has to do, and doing that for real in
 * production showed `TextDecoder` truly is needed. Out of the same caution,
 * `queueMicrotask` -- "proven" unnecessary by the same flawed method -- is
 * kept here too, until it's re-verified with a test that never touches it.
 *
 * Import this module for its side effects **before** anything that touches
 * typst.ts (see `typst.ts`).
 */

const g = globalThis as Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* UTF-8 TextEncoder / TextDecoder                                           */
/* -------------------------------------------------------------------------- */

class Utf8Encoder {
  readonly encoding = "utf-8";

  encode(input = ""): Uint8Array {
    const bytes: number[] = [];
    for (let i = 0; i < input.length; i++) {
      let code = input.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
        const next = input.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  }

  encodeInto(source: string, destination: Uint8Array): { read: number; written: number } {
    const encoded = this.encode(source);
    const written = Math.min(encoded.length, destination.length);
    destination.set(encoded.subarray(0, written));
    return { read: source.length, written };
  }
}

// The typst.ts glue constructs this as `new TextDecoder("utf-8", { ... })`; the
// label/options are accepted at runtime but ignored (this shim is always
// non-fatal UTF-8), so no constructor is declared.
class Utf8Decoder {
  readonly encoding = "utf-8";

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) {
      return "";
    }
    const bytes = input instanceof Uint8Array
      ? input
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);

    let out = "";
    let i = 0;
    while (i < bytes.length) {
      const byte = bytes[i++];
      let code: number;
      if (byte < 0x80) {
        code = byte;
      } else if (byte >= 0xc0 && byte < 0xe0) {
        code = ((byte & 0x1f) << 6) | (bytes[i++] & 0x3f);
      } else if (byte >= 0xe0 && byte < 0xf0) {
        code = ((byte & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      } else {
        code = ((byte & 0x07) << 18)
          | ((bytes[i++] & 0x3f) << 12)
          | ((bytes[i++] & 0x3f) << 6)
          | (bytes[i++] & 0x3f);
      }
      if (code > 0xffff) {
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      } else {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }
}

if (typeof g.TextEncoder !== "function") {
  g.TextEncoder = Utf8Encoder;
}
if (typeof g.TextDecoder !== "function") {
  g.TextDecoder = Utf8Decoder;
}

/* -------------------------------------------------------------------------- */
/* fetch                                                                     */
/* -------------------------------------------------------------------------- */

// typst.ts's `ComponentBuilder` references `fetch` unconditionally while
// building the compiler. Every font is passed in as bytes (see `typst.ts`
// `initOnce`), so the stub is never actually called -- it only needs to exist.
if (typeof g.fetch !== "function") {
  g.fetch = (): never => {
    throw new Error("fetch() is not available in the Cavalry runtime");
  };
}

/* -------------------------------------------------------------------------- */
/* queueMicrotask                                                            */
/* -------------------------------------------------------------------------- */

if (typeof g.queueMicrotask !== "function") {
  g.queueMicrotask = (cb: () => void): void => {
    void Promise.resolve().then(cb);
  };
}

/* -------------------------------------------------------------------------- */
/* base64                                                                    */
/* -------------------------------------------------------------------------- */

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
