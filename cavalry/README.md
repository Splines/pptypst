# PPTypst for Cavalry (prototype)

Brings PPTypst's "type Typst → get vector paths" workflow into the
[Cavalry](https://cavalry.studio) animation app as a pasteable script.

You get a small window with a Typst editor and an **Insert** button. Insert
compiles the Typst to SVG and imports it as vector layers grouped under
`PPTypst: <formula>`, storing the raw Typst source on the group. **Load from
selection** reads that source back so you can edit a formula and re-insert it.

This is a first prototype: no colour / size / font controls.

## How it runs Typst

Entirely in-engine: `src/typst.ts` runs the `typst.ts` WASM compiler and
renderer directly inside Cavalry's JavaScript engine — no external `typst`
binary, no subprocess. Two things make that work:

- Cavalry's engine doesn't pump the host promise from async
  `WebAssembly.instantiate` / `.compile`, so both wasm modules are instantiated
  **synchronously** via wasm-bindgen's `initSync` before typst.ts's own async
  `init()` runs (which then sees the module is already loaded and returns
  immediately).
- Cavalry's engine is genuinely missing `fetch`, which typst.ts references
  unconditionally while building the compiler — shimmed in `src/polyfills.ts`.
  (`TextEncoder`/`TextDecoder`/`queueMicrotask` looked missing too under a
  naive `typeof globalThis.X` check, but direct probing showed the engine has
  working native versions of all three that just aren't exposed as enumerable
  `globalThis` properties — the wasm glue's bare references to them resolve
  fine on their own, so they don't need shims.)

## Setup

```bash
cd cavalry
npm install
npm run assets      # fills assets/vendor/ with the wasm modules + fonts (~30 MB, downloads text fonts)
```

Then set `ASSET_DIR` in [`src/config.ts`](src/config.ts) to the **absolute**
path of `cavalry/assets/vendor/` printed by `npm run assets`, and build:

```bash
npm run build       # -> dist/pptypst-cavalry.js
```

Paste `dist/pptypst-cavalry.js` into Cavalry's JavaScript Editor
(`Window > JavaScript Editor`) and run it. Type Typst, click **Insert**.

To edit an existing formula: select its `PPTypst: ...` group in the Scene
tree, click **Load from selection**, edit the text, click **Insert** — the old
group is replaced.

## Project layout

| path | purpose |
| --- | --- |
| `src/main.ts` | UI + Insert / Load wiring |
| `src/scene.ts` | `convertSVGToLayers` → group (named + tagged), read-back |
| `src/typst.ts` | in-engine typst.ts wiring (mirrors `web/src/typst.ts`) |
| `src/svg-flatten.ts` | flattens typst.ts's SVG into one that `convertSVGToLayers` can actually import (see below) |
| `src/polyfills.ts` | the one Cavalry-engine shim typst.ts actually needs (`fetch`) + base64 decode |
| `src/wrap.ts` | page-setup preamble (ported from the add-in) |
| `src/config.ts` | **edit `ASSET_DIR` here** |
| `scripts/fetch-assets.mjs` | populates `assets/vendor/` |
| `build.mjs` | esbuild bundling |

### Why `svg-flatten.ts`

typst.ts doesn't emit plain SVG: glyph outlines are dedup'd into `<defs>` and
placed via `<use href="#id">` inside several levels of nested
`<g transform="translate(...) scale(...)">`. `api.convertSVGToLayers` isn't
built for that (most SVG importers aren't) — content came out collapsed onto
one point and mirrored. `flattenSvg` resolves every `<use>`, composes the whole
ancestor-transform chain into a single matrix per glyph, and bakes it directly
into that glyph's path coordinates, emitting one flat top-level `<path>` per
glyph/shape.

## Known limitations

- The pasted file is not fully self-contained: it needs `assets/vendor/` on
  disk at the `ASSET_DIR` path.
- Typst package imports (`#import "@preview/…"`) are unsupported (no registry).
- Update = delete + recreate; the new group is not moved to the old transform.
