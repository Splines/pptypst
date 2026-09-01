# PPTypst for Cavalry

Brings PPTypst's "type Typst → get vector paths" workflow into the
[Cavalry](https://cavalry.studio) animation app as a Script UI window.

A small window with a Typst editor, a live preview that re-renders as you type,
and one action button. **Insert** compiles the Typst to SVG and imports it as
vector layers grouped under `PPTypst: <formula>`, storing the raw source on the
group. Selecting such a group in the scene loads its source back into the editor
and turns the button into **Update**, which replaces that formula in place (the
new group re-centred on the old one's centre); with nothing PPTypst selected the
button reverts to **Insert** and creates a fresh group.

## Build

```bash
cd cavalry
npm install
npm run setup       # assets + build + pack, in one go
```

`npm run setup` runs three steps (also available individually):

| step             | output                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `npm run assets` | `assets/vendor/` — the two wasm modules + 12 fonts (~35 MB)      |
| `npm run build`  | `dist/pptypst-cavalry.js` — the window script (Vite, minified IIFE) |
| `npm run pack`   | `dist/PPTypst.zip` — that script + the assets, ready to install  |

## Install

The wasm modules and fonts are far too large to embed in the script, so it reads
them from a `pptypst_assets/` folder sitting next to it. `dist/PPTypst.zip` holds
both, at the archive root:

```
PPTypst.js
pptypst_assets/vendor/   (wasm + fonts)
```

1. In Cavalry: **Scripts ▸ Show Scripts Folder** (or go there directly):
   - macOS — `~/Library/Application Support/Cavalry/Scripts`
   - Windows — `%APPDATA%/Cavalry/Scripts`
2. Extract `dist/PPTypst.zip` into that folder, so it now holds `PPTypst.js`
   next to `pptypst_assets/`.
3. Open **Window ▸ Scripts ▸ PPTypst**, type some Typst, and click **Insert**.

The `pptypst_assets` folder is hidden from the Scripts menu by its `_assets`
suffix. To update, extract a fresh zip over the old files.

### JavaScript-Editor dev loop

`ui.scriptLocation` is blank when a script is pasted rather than run from the
Scripts menu, so for editor testing the asset directory has to be baked in:

```bash
PPTYPST_ASSET_DIR="C:/Users/<you>/AppData/Roaming/Cavalry/Scripts/pptypst_assets/vendor" npm run build
```

Then paste `dist/pptypst-cavalry.js` into the JavaScript Editor. A plain
`npm run build` leaves the path empty, so the packaged script falls back to
`<script folder>/pptypst_assets/vendor`.

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
    svg-path.ts         normalized path `d` string → structured verbs
    typst-document.ts   wraps the user's source into a compilable document

  platform/             Cavalry adapter — all api.*/ui.* access lives here
    files.ts            asset directory resolution, binary reads, temp files
    panel.ts            the window: widgets, layout, wording
    preview.ts          the live preview swatch (ui.Draw + cavalry.Path)
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

### Why the preview uses `ui.Draw`

Cavalry's UI has no SVG widget. `ui.Draw` paints `cavalry.Path`s, so the live
preview reuses `flattenTypstSvg` to get already-transformed `d` strings,
`svg-path.ts` to turn each into verbs, and replays them onto a `cavalry.Path`
scaled to fit the swatch. No scene layers, no temp files — it renders straight
from the compiled SVG on every keystroke (debounced), sharing the one Typst
engine with **Insert**.

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

- The script is not self-contained; it reads `pptypst_assets/vendor/` from next
  to itself at runtime, so it must be installed as a folder (not pasted).
- Typst package imports (`#import "@preview/…"`) are unsupported (no registry).
- Updating a formula deletes and recreates it. The new group is re-centred on
  the old one's centre, but its rotation and scale are not carried over.
