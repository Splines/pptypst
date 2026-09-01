/**
 * Shims for globals Cavalry's JavaScript engine does not provide but the
 * typst.ts / wasm-bindgen glue references.
 *
 * `TextEncoder`, `TextDecoder`, `fetch` and `queueMicrotask` all read as
 * `undefined` on a fresh Cavalry engine, and the wasm glue references them by
 * bare identifier, so without these it throws `ReferenceError` during compiler
 * init. `fetch` is only ever referenced, never called — every font is handed to
 * the compiler as bytes (see `engine.ts`) — so a throwing stub is enough.
 *
 * A note on verifying whether a shim is still needed: testing it by installing
 * the shim and then `delete`-ing the global does NOT work. Cavalry appears to
 * lazily register its own native version of some of these the first time
 * anything touches `globalThis.X` (our assignment counts), and that binding
 * then survives the delete — so the test passes whether or not the shim
 * matters. A valid test has to never touch the global at all, i.e. build a
 * variant with the install code physically removed. `TextDecoder` was dropped
 * on the strength of the bad test and immediately broke in production.
 *
 * Imported for side effects, and it must be evaluated before any typst.ts
 * module — see the import order in `engine.ts`.
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
