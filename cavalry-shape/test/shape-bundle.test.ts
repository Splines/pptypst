/**
 * Runs the built shape bundle the way Cavalry's JS Shape sandbox would: only
 * `cavalry`, `ctx` and `console` in scope, plus the layer's attributes as bare
 * globals, and the script's completion value taken as the result.
 *
 * This is the one test that exercises the whole panel-to-layer contract —
 * flatten, serialize, store, parse, rebuild — and the packaging around it (the
 * IIFE footer, and the fact that nothing in the shape half reaches for `api`
 * or `ui`). It needs `npm run build` first, so it skips rather than fails when
 * `dist/` is empty.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { geometryFromFlattened, serializeGeometry } from "../src/core/geometry.ts";
import { flattenTypstSvg } from "../src/core/svg-flatten.ts";

const bundlePath = new URL("../dist/formula.js", import.meta.url);
const skip = existsSync(bundlePath) ? false : "run `npm run build` first";

const typstSvg = readFileSync(new URL("fixtures/typst-output.svg", import.meta.url), "utf8");

/* -------------------------------------------------------------------------- */
/* A minimal stand-in for the `cavalry` classes the shape script touches.      */
/* -------------------------------------------------------------------------- */

class FakePath {
  points: [number, number][] = [];
  verbs: string[] = [];
  moveTo(x: number, y: number): void {
    this.verbs.push("M");
    this.points.push([x, y]);
  }

  lineTo(x: number, y: number): void {
    this.verbs.push("L");
    this.points.push([x, y]);
  }

  cubicTo(...coords: number[]): void {
    this.verbs.push("C");
    this.pairs(coords);
  }

  quadTo(...coords: number[]): void {
    this.verbs.push("Q");
    this.pairs(coords);
  }

  close(): void {
    this.verbs.push("Z");
  }

  empty(): boolean {
    return this.points.length === 0;
  }

  translate(x: number, y: number): void {
    this.points = this.points.map(([px, py]) => [px + x, py + y]);
  }

  boundingBox() {
    const xs = this.points.map(p => p[0]);
    const ys = this.points.map(p => p[1]);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  }

  toObject(): unknown {
    return { verbs: this.verbs, points: this.points };
  }

  fromObject(object: unknown): void {
    const { verbs, points } = object as FakePath;
    this.verbs = verbs;
    this.points = points;
  }

  private pairs(coords: number[]): void {
    for (let i = 0; i < coords.length; i += 2) this.points.push([coords[i], coords[i + 1]]);
  }
}

class FakeMesh {
  paths: FakePath[] = [];
  materials: (object | null)[] = [];
  addPath(path: FakePath, material?: object): void {
    this.paths.push(path);
    this.materials.push(material ?? null);
  }

  count(): number {
    return this.paths.length;
  }

  getPathAtIndex(index: number): FakePath {
    return this.paths[index];
  }
}

interface SandboxRun {
  mesh: FakeMesh;
  /** Evaluates the same bundle against the same layer again. */
  again: () => FakeMesh;
  /** Anything the script stashed on the layer. Expected to stay empty. */
  cacheKeys: () => string[];
}

/**
 * `withStore: false` reproduces what a real third-party JS Shape gets: a `ctx`
 * carrying only `index`/`count`. The object store that the docs and the type
 * definitions both promise is not there, and an exception in a shape script
 * fails the whole evaluation and empties the layer — so the shape half must not
 * reach for anything on `ctx`.
 */
function runShapeScript(geometry: string, colours: boolean, withStore = true): SandboxRun {
  const store = new Map<string, unknown>();
  const context = vm.createContext({
    console,
    // The shape script only ever constructs a Material and assigns to it.
    cavalry: { Path: FakePath, Mesh: FakeMesh, Material: function FakeMaterial() { /* fields assigned by the script */ } },
    ctx: withStore
      ? {
          saveObject: (key: string, value: unknown) => store.set(key, structuredClone(value)),
          loadObject: (key: string) => store.get(key),
          hasObject: (key: string) => store.has(key),
        }
      : { index: 0, count: 1 },
    typstGeometry: geometry,
    typstColours: colours,
  });

  const script = new vm.Script(readFileSync(bundlePath, "utf8"));
  const run = (): FakeMesh => script.runInContext(context) as FakeMesh;

  return { mesh: run(), again: run, cacheKeys: () => [...store.keys()] };
}

function payload(precision = 2): string {
  return serializeGeometry(geometryFromFlattened(flattenTypstSvg(typstSvg), { precision }));
}

/* -------------------------------------------------------------------------- */

test("the bundle's last expression is the mesh", { skip }, () => {
  const { mesh } = runShapeScript(payload(), false);
  assert.ok(mesh instanceof FakeMesh);
  assert.equal(mesh.count(), flattenTypstSvg(typstSvg).paths.length);
});

test("outlines are centred on the layer origin", { skip }, () => {
  const { mesh } = runShapeScript(payload(), false);
  const flat = flattenTypstSvg(typstSvg);
  const xs = mesh.paths.flatMap(path => path.points.map(point => point[0]));
  const ys = mesh.paths.flatMap(path => path.points.map(point => point[1]));

  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 0.01);
  assert.ok(Math.abs(Math.min(...ys) + Math.max(...ys)) < 0.01);
  // The ink spans the page, so the centred extents are about half the page box.
  assert.ok(Math.max(...xs) <= flat.width / 2 + 1);
});

test("no material is attached unless Typst colours are asked for", { skip }, () => {
  assert.equal(runShapeScript(payload(), false).mesh.materials.filter(Boolean).length, 0);
  const coloured = runShapeScript(payload(), true).mesh;
  assert.equal(coloured.materials.filter(Boolean).length, coloured.count());
});

test("repeated evaluations are identical and touch no `ctx` state", { skip }, () => {
  const run = runShapeScript(payload(), false);
  const again = run.again();

  assert.equal(again.count(), run.mesh.count());
  assert.deepEqual(
    again.paths.map(path => path.points),
    run.mesh.paths.map(path => path.points),
  );
  assert.deepEqual(run.cacheKeys(), []);
});

test("a bare `ctx` is enough — the real sandbox's has no object store", { skip }, () => {
  const full = runShapeScript(payload(), false);
  const bare = runShapeScript(payload(), false, false);

  assert.equal(bare.mesh.count(), full.mesh.count());
  assert.deepEqual(
    bare.mesh.paths.map(path => path.points),
    full.mesh.paths.map(path => path.points),
  );
  assert.equal(bare.again().count(), full.mesh.count());
});

test("an empty or unreadable attribute yields an empty mesh, not a throw", { skip }, () => {
  assert.equal(runShapeScript("", false).mesh.count(), 0);
  assert.equal(runShapeScript("{ not json", false).mesh.count(), 0);
});
