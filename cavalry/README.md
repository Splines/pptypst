# PPTypst for Cavalry

Brings PPTypst's "type Typst → get vector paths" workflow into the
[Cavalry](https://cavalry.studio) animation app as a pasteable script.

A small window with a Typst editor and one action button. **Insert** compiles the
Typst to SVG and imports it as vector layers grouped under `PPTypst: <formula>`,
storing the raw source on the group. Selecting such a group in the scene loads
its source back into the editor and turns the button into **Update**, which
replaces that formula in place; with nothing PPTypst selected the button reverts
to **Insert** and creates a fresh group.

## Setup

```bash
cd cavalry
npm install
npm run assets      # fills assets/vendor/ with the wasm modules + fonts (~35 MB)
npm run build       # -> dist/pptypst-cavalry.js
```

The wasm modules and fonts are far too large to embed in a pasted script, so
they live on disk and the script reads them at runtime. Point it at them one of
two ways:

- **Installed script** (recommended): copy `assets/vendor/` to
  `<Cavalry Scripts>/pptypst_assets/vendor/` and `dist/pptypst-cavalry.js` to
  `<Cavalry Scripts>/`, then run it from the Scripts menu. This is Cavalry's
  own `_assets` convention and needs no configuration.
- **JavaScript Editor**: `ui.scriptLocation` is blank when pasting, so set
  `ASSET_DIR_OVERRIDE` in [`src/config.ts`](src/config.ts) to the absolute path
  of the vendor folder and rebuild.

Then paste or open the script and click **Insert**.

## Architecture

Dependencies point inwards. `core/` is pure and knows nothing about Cavalry or
Typst; the outer layers depend on it, never the reverse. `main.ts` is the only
place they meet.

```
src/
  main.ts               composition root: builds the adapters, wires the panel
  config.ts             every user-tweakable setting, pure data

  core/                 pure logic — no api.*/ui.*, unit-tested on Node
    assets.ts           AssetReader port (implemented by platform/files.ts)
    base64.ts           base64 → bytes (Cavalry has no atob)
    formula.ts          what a formula is, how it is stored, how it is named
    svg-flatten.ts      typst.ts SVG → SVG that Cavalry can import
    typst-document.ts   wraps the user's source into a compilable document

  platform/             Cavalry adapter — all api.*/ui.* access lives here
    files.ts            asset directory resolution, binary reads, temp files
    panel.ts            the window: widgets, layout, wording
    scene.ts            SVG → named, tagged group; finding it again

  typst/
    engine.ts           typst.ts wasm lifecycle + compile → SVG
    polyfills.ts        globals Cavalry's engine lacks (side-effect import)
```

Three things about the engine are load-bearing and easy to break:

1. **`polyfills.ts` must be imported first** in `engine.ts`, before the
   `@myriaddreamin/*` imports. The wasm glue constructs a `TextDecoder` while
   *its module is evaluating*, so the shims have to already be installed.
2. **The wasm is instantiated synchronously** via wasm-bindgen's `initSync`.
   Cavalry runs JS microtasks but never settles the host promise from async
   `WebAssembly.instantiate`, so the async path hangs forever.
3. **Fonts are passed as bytes through `beforeBuild`**, keeping a single 28 MiB
   compiler instance. A separate font builder instantiates it a second time.

### Why `svg-flatten.ts`

typst.ts doesn't emit plain SVG: glyph outlines are dedup'd into `<defs>` and
placed via `<use href="#id">` inside several levels of nested
`<g transform="translate(...) scale(...)">`. `api.convertSVGToLayers` isn't
built for that — content came out collapsed onto one point and mirrored.
`flattenSvg` resolves every `<use>`, composes the whole ancestor-transform chain
into a single matrix per glyph, and bakes it into that glyph's path coordinates,
emitting one flat top-level `<path>` per glyph or shape.

## Development

```bash
npm run check      # typecheck + lint + tests
npm test           # node --test (native TS, no build step)
```

`test/fixtures/` holds real typst.ts output and the flattened SVG Cavalry is
known to import correctly. `svg-flatten.test.ts` asserts the flattener still
reproduces it byte-for-byte — if that test fails, the change needs re-verifying
inside Cavalry before it ships.

## Known limitations

- The pasted script is not self-contained; it needs `assets/vendor/` on disk.
- Typst package imports (`#import "@preview/…"`) are unsupported (no registry).
- Updating a formula deletes and recreates it, so the new group does not inherit
  the old one's transform.
