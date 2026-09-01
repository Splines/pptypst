# PPTypst for Cavalry

Brings PPTypst's "type Typst → get vector paths" workflow into the
[Cavalry](https://cavalry.studio) animation app, as a **plug-in** built on
Cavalry's Plug-in SDK.

A formula is one `Typst Formula` layer — a JS Shape plug-in whose Typst source,
size and compiled outlines live in ordinary Cavalry attributes. Because they are
attributes, they are saved with the scene, shown in the Attribute Editor, and
rewritable in place: editing a formula keeps its position, rotation, scale,
materials, deformers and keyframes.

The typesetting happens in the **PPTypst window** (`dist/panel.js`): a Typst
editor, a live preview that re-renders as you type, and two actions. **Insert**
compiles and creates a formula layer; selecting one loads its source back and
turns the button into **Update**. **Break Apart** re-renders the same formula as
one editable vector layer per glyph, for when glyphs need to be staggered or
coloured individually.

## Why it is split in two

The JS Shape sandbox has `cavalry` and `ctx` and nothing else. There is no
`api`, so **no file access and no network** — see `api-module.mdx`: *"The
following APIs are all in the `api` namespace. They are ONLY available in the
JavaScript Editor and not available when writing expressions in the JavaScript
Layers."* The Typst compiler is 28 MiB of wasm plus a dozen fonts read off disk,
so it cannot run inside the shape.

So the plug-in is two halves that meet at one string attribute:

```
  PPTypst window  (script context: api + ui + cavalry)
      Typst source ──▶ typst.ts wasm ──▶ SVG ──▶ flatten ──▶ serialize
                                                                │
                              api.set(layerId, { typstGeometry: … })
                                                                ▼
  Typst Formula layer  (shape sandbox: cavalry + ctx)
      typstGeometry ──▶ parse ──▶ cavalry.Path × N ──▶ cavalry.Mesh
```

The window is the compiler; the layer is a player. The layer never needs the
window again once written — a scene opens and draws its formulas with no script
running.

## Setup

```bash
cd cavalry-shape
npm install
npm run assets      # fills assets/vendor/ with the wasm modules + fonts (~35 MB)
npm run build       # -> dist/PPTypst/, the installable plug-in folder
```

Drag `dist/PPTypst/` (or a `.zip` of it) into the Cavalry window; a confirmation
dialogue appears if it is valid. It lands in:

- **macOS**: `~/Library/Application Support/Cavalry/Third-Party/Plugins`
- **Windows**: `%AppData%\Cavalry\Third-Party\Plugins`

Then open the window from `Window ▸ Scripts ▸ panel`, type some Typst, and press
Insert. The panel finds the wasm and fonts inside the installed plug-in folder,
so there is nothing to configure.

To iterate on the panel without reinstalling, paste `dist/panel.js` into the
JavaScript Editor. `ui.scriptLocation` is blank there, but the panel still finds
the installed plug-in's assets; set `ASSET_DIR_OVERRIDE` in
[`src/config.ts`](src/config.ts) only if the plug-in itself is not installed.

## Architecture

Dependencies point inwards. `core/` is pure and knows nothing about Cavalry or
Typst. `cavalry/` sits one ring out: it uses the `cavalry` namespace and nothing
else, so it is valid in *both* contexts. `platform/` and `typst/` are
script-context only. `main.ts` and `plugin/shape.ts` are the two composition
roots.

```
src/
  main.ts               panel entry point: builds the adapters, wires the actions
  config.ts             every user-tweakable setting, pure data

  core/                 pure logic — no cavalry.*/api.*/ui.*, unit-tested on Node
    assets.ts           AssetReader port (implemented by platform/files.ts)
    base64.ts           base64 → bytes (Cavalry has no atob)
    formula.ts          what a formula is and how its layer is named
    font-size.ts        default point size for the composition's resolution
    geometry.ts         the payload the two halves exchange
    svg-flatten.ts      typst.ts SVG → flat, absolute outlines
    svg-path.ts         normalized path `d` string → structured verbs
    typst-document.ts   wraps the user's source into a compilable document

  cavalry/              `cavalry` namespace only — valid in every JS context
    mesh.ts             outlines → cavalry.Path/Mesh, centring, materials

  plugin/
    shape.ts            the JS Shape script. cavalry + ctx only.

  platform/             Cavalry adapter — all api.*/ui.* access lives here
    files.ts            asset directory resolution, binary reads, temp files
    layer.ts            the formula layer: create, update in place, find again
    panel.ts            the window: widgets, layout, wording
    preview.ts          the live preview swatch (ui.Draw + cavalry.Path)
    scene.ts            composition, placement, and the Break Apart import

  typst/
    engine.ts           typst.ts wasm lifecycle + compile → SVG
    polyfills.ts        globals Cavalry's engine lacks (side-effect import)

plugin/                 the plug-in's non-code files, copied into dist/PPTypst/
  definitions.json      layer type, attributes, triggers, UI order
  strings.json          nice names and tooltips
  setup.js              runs on layer creation
  welcome.js            splash on install/update

tools/probe.js          paste into Cavalry to check the API assumptions below
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

### The attributes

`plugin/definitions.json` and `src/config.ts` (`PLUGIN.attributes`) must agree;
they are the contract between the two halves.

| Attribute | Type | Written by | Read by |
|---|---|---|---|
| `typstSource` | string | panel | panel, when you select the layer |
| `typstFontSize` | double | panel | panel |
| `typstGeometry` | string | panel | **the shape script** |
| `typstColours` | bool | you | the shape script |

Only `typstGeometry` and `typstColours` are `polyMesh` triggers, so only they
rebuild the mesh. `typstSource` and `typstFontSize` are metadata: editing them
in the Attribute Editor changes nothing until the panel re-typesets. (Wiring
`onAttrChanged` so it re-typesets on the spot is the obvious next step.)

### Why `svg-flatten.ts`

typst.ts doesn't emit plain SVG: glyph outlines are dedup'd into `<defs>` and
placed via `<use href="#id">` inside several levels of nested
`<g transform="translate(...) scale(...)">`. `flattenSvg` resolves every `<use>`,
composes the whole ancestor-transform chain into a single matrix per glyph, and
bakes it into that glyph's path coordinates, emitting one flat outline per glyph
or shape. Both halves depend on that: the shape plugin replays those outlines,
and Break Apart's `api.convertSVGToLayers` cannot resolve the nested form
(content came out collapsed onto one point and mirrored).

### Why the preview uses `ui.Draw`

Cavalry's UI has no SVG widget. `ui.Draw` paints `cavalry.Path`s, so the live
preview reuses `flattenTypstSvg` and `svg-path.ts` and replays each outline onto
a `cavalry.Path` scaled to fit the swatch. No scene layers, no temp files —
it renders straight from the compiled SVG on every keystroke (debounced),
sharing the one Typst engine with **Insert**.

## Development

```bash
npm run check      # typecheck + lint + tests
npm test           # node --test (native TS, no build step)
npm run build      # both bundles + dist/PPTypst/
```

Vite produces both bundles from one config, selected by `--mode`; both are
minified IIFEs. The shape bundle needs a trailing expression, because Cavalry
takes a plug-in script's result from its **last expression** and an IIFE
assigned to a `var` is a declaration — hence the `footer` in `vite.config.ts`.

`test/shape-bundle.test.ts` runs the built `dist/formula.js` inside a `node:vm`
context holding only fake `cavalry` and `ctx` globals. It is the one test that
covers the whole two-half contract, and it fails loudly if anything in the shape
half starts reaching for `api` or `ui`. It skips when `dist/` is empty.

`test/fixtures/` holds real typst.ts output and the flattened SVG Cavalry is
known to import correctly. `svg-flatten.test.ts` asserts the flattener still
reproduces it byte-for-byte — if that test fails, the change needs re-verifying
inside Cavalry before it ships.

## What Cavalry actually does

Established with `tools/probe.js` and the bisect plug-ins from
`npm run probe-plugins`, since the SDK documents none of it:

- **Third-party layer types are namespaced `<author>::<type>`.**
  `api.create('pptypstFormula')` silently returns nothing;
  `api.create('pptypst::pptypstFormula')` is the real name, and
  `api.getAllLayerTypes(true)` is the ground truth for what registered.
- **`string` attributes are legal on a JS Shape**, and one can drive the
  `polyMesh` trigger. The whole design rests on this, and
  `definitionsSchema.json` does not list `string` among its attribute types.
- **The `material` stanza without a `type`** — as in the official Trefoil
  example — is accepted.
- **Cavalry indexes plug-ins at start-up.** Copying a folder into
  `Third-Party/Plugins` is not installing it: drag it into the Cavalry window
  and restart. A rejected `definitions.json` fails silently, showing up only as
  a type missing from `getAllLayerTypes`.
- **A `string` attribute holds at least a million characters**, so payload size
  is a `.cv` file-size question, not a correctness one.
- **A JS Shape's `ctx` has no object store.** `ctx.saveObject`/`loadObject`/
  `hasObject` are documented for JavaScript Utilities and offered to shapes by
  `@scenery/cavalry-types`, but calling `ctx.hasObject` in a third-party JS
  Shape throws "is not a function" — and an exception there fails the whole
  evaluation, leaving the layer empty. `plugin/shape.ts` probes for the store
  instead of trusting the types, and simply rebuilds without it.
- **`console.log` from inside a JS Shape does not reach Cavalry's console**,
  though an exception does. The probe plug-ins therefore report what their
  sandbox contains as a bit mask baked into the shape's height.

## Still unverified

- **Rebuild cost.** With no object store there is no cache, so every
  re-evaluation re-parses every glyph. `tools/probe.js` times two consecutive
  writes of a 400-outline payload; if that is slow, the fix is a cheaper
  geometry format rather than a cache.
- **Scene handedness.** Outlines are fed through with SVG's y-down coordinates,
  on the evidence that `api.convertSVGToLayers` imports the same coordinates
  correctly today. If formulas land upside down, flip `SCENE.flipY` in
  `src/config.ts`.
- **That a JS Shape has no `api`.** The Plug-in SDK never says so — the claim
  comes from the main Cavalry docs (`api-module.mdx`: the `api` namespace is
  *"ONLY available in the JavaScript Editor and not available when writing
  expressions in the JavaScript Layers"*) and from `@scenery/cavalry-types`,
  whose `shape.d.ts` pulls in only `console`, `ctx` and `cavalry`. Neither is
  about third-party shape plug-ins specifically, and `ctx` has already turned
  out to differ from what both describe. `tools/probe.js` reports the sandbox's
  real contents; if `api` is available there, this whole two-half split is
  unnecessary.

## Known limitations

- Typst package imports (`#import "@preview/…"`) are unsupported (no registry).
- A formula is a single mesh, so glyphs cannot be animated individually. Use
  **Break Apart** for that; the result is plain geometry with no Typst source
  attached, and cannot be updated.
- Keyframing `typstFontSize` does nothing — only `typstGeometry` drives the
  mesh. Use the layer's own Scale to animate size.
- `versioning.js` is not shipped yet; there is only one payload version.
- The plug-in has no icons yet, so the layer uses Cavalry's generic shape icon.
