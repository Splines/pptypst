/**
 * A deliberately small alternative to `core/svg-flatten.ts`.
 *
 * `svg-flatten.ts` bakes every ancestor transform into each path's `d`. This
 * module keeps the transform as a single `transform="matrix(...)"` attribute on
 * each emitted `<path>` instead, so it never has to compose transforms into
 * coordinates. All it does is:
 *
 *   1. resolve every `<use href="#g">` to the `<path>` it points at,
 *   2. compose the nested `<g transform>` chain above each shape into one matrix,
 *   3. drop non-visual content (`<foreignObject>`, `<style>`, `<script>`,
 *      `<clipPath>`, `<mask>`, `<defs>`).
 *
 * Three things `api.convertSVGToLayers` was found NOT to handle, patched here as
 * narrowly as possible (verified by trying the plain output in Cavalry):
 *
 *   - **quadratic Beziers** -- a `Q` that closes on the subpath start comes out
 *     as a straight chord (the "$partial$" hard edge). Fixed by running each `d`
 *     through {@link normalizePathData}, which degree-elevates every quadratic
 *     to a cubic (exact) and expands H/V/S/T. That is the one bit of path-data
 *     math, and it is borrowed wholesale from the tested flattener.
 *   - **gradients** -- `<linearGradient>` / `url(#...)` fills are ignored. Fixed
 *     by flattening each gradient to the coverage-weighted average of its stops
 *     (same fallback `svg-flatten.ts` uses).
 *   - **`fill-opacity` / `stroke-opacity`** -- ignored. Fixed by folding all
 *     transparency (paint alpha, `*-opacity`, gradient-stop alpha) into a single
 *     `opacity` presentation attribute, which the importer does map to the
 *     layer's opacity.
 */

import { normalizePathData } from "./svg-flatten.ts";

interface Mat { a: number; b: number; c: number; d: number; e: number; f: number }

const ID: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

const NUM_RE = /-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

/** Composes a `transform` attribute (`translate` / `scale` / `matrix` /
 * `rotate`, in order) into one matrix. */
function parseTransform(str: string | undefined): Mat {
  if (!str) return ID;
  let out = ID;
  const fn = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (let m = fn.exec(str); m !== null; m = fn.exec(str)) {
    const n = (m[2].match(NUM_RE) ?? []).map(Number);
    const p = n[0] ?? 0;
    const q = n[1] ?? 0;
    if (m[1] === "translate") out = mul(out, { ...ID, e: p, f: q });
    else if (m[1] === "scale") out = mul(out, { ...ID, a: p, d: n.length > 1 ? q : p });
    else if (m[1] === "matrix" && n.length >= 6) {
      out = mul(out, { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] });
    } else if (m[1] === "rotate") {
      const r = (p * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      out = mul(out, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
    }
  }
  return out;
}

function matrixAttr(m: Mat): string {
  return `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(v => Number(v.toFixed(6)).toString()).join(" ")})`;
}

function parseAttrs(raw: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const re = /([:\w-]+)\s*=\s*"([^"]*)"/g;
  for (let m = re.exec(raw); m !== null; m = re.exec(raw)) out[m[1]] = m[2];
  return out;
}

/* ------------------------------------------------------------------------- */
/* Colour + opacity                                                         */
/* ------------------------------------------------------------------------- */

function toHexByte(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/** `"0.5"` / `"50%"` / `""` -> 0..1 (default `1`). */
function opacityToken(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 1;
  const n = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  return clamp01(n);
}

interface Paint { color: string; alpha: number }

/** Splits `#RGBA` / `#RRGGBBAA` / `rgba(...)` into an opaque colour + 0..1
 * alpha; opaque or non-literal paints come back with `alpha: 1`. */
function splitAlpha(value: string): Paint {
  const s = value.trim();
  const hex8 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(s);
  if (hex8) return { color: `#${hex8[1].toLowerCase()}`, alpha: parseInt(hex8[2], 16) / 255 };
  const hex4 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(s);
  if (hex4) {
    const [, r, g, b, a] = hex4;
    return { color: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), alpha: parseInt(a + a, 16) / 255 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (rgba) {
    const a4 = rgba[4] as string | undefined;
    return {
      color: `#${toHexByte(+rgba[1])}${toHexByte(+rgba[2])}${toHexByte(+rgba[3])}`,
      alpha: a4 === undefined ? 1 : opacityToken(a4),
    };
  }
  return { color: s, alpha: 1 };
}

function hexToRgb(value: string): [number, number, number] {
  const h = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [0, 0, 0];
}

/* ------------------------------------------------------------------------- */
/* Gradients -> solid                                                       */
/* ------------------------------------------------------------------------- */

interface Stop { off: number; color: string; alpha: number }
interface RawGradient { stops: Stop[]; href: string | null }

function parseOffset(raw: string | undefined): number {
  if (raw === undefined) return 0;
  return clamp01(raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw));
}

/** Collects every `<linearGradient>` / `<radialGradient>` (id -> stops + the id
 * it inherits stops from via `href`). */
function collectGradients(svg: string): Map<string, RawGradient> {
  const out = new Map<string, RawGradient>();
  for (const g of svg.matchAll(/<(?:linear|radial)Gradient\b([^>]*)>([\s\S]*?)<\/(?:linear|radial)Gradient>/g)) {
    const a = parseAttrs(g[1]);
    if (a.id === undefined) continue;
    const stops: Stop[] = [];
    for (const s of g[2].matchAll(/<stop\b([^>]*?)\/?>/g)) {
      const sa = parseAttrs(s[1]);
      const { color, alpha } = splitAlpha(sa["stop-color"] ?? "#000000");
      stops.push({ off: parseOffset(sa.offset), color, alpha: alpha * opacityToken(sa["stop-opacity"]) });
    }
    const href = (a.href ?? a["xlink:href"] ?? "").replace(/^#/, "");
    out.set(a.id, { stops, href: href === "" ? null : href });
  }
  return out;
}

/** Follows `href` until stops are found (typst emits a bare alias that inherits
 * its stops from a base gradient). */
function resolveStops(id: string, grads: Map<string, RawGradient>): Stop[] {
  const seen = new Set<string>();
  let g = grads.get(id);
  while (g && g.stops.length === 0 && g.href !== null && !seen.has(g.href)) {
    seen.add(g.href);
    g = grads.get(g.href);
  }
  return g?.stops ?? [];
}

/** Coverage-weighted average of a gradient's stops (each weighted by half the
 * offset gap to each neighbour, so stop density does not skew it). */
function averageStops(stops: readonly Stop[]): Paint {
  if (stops.length === 0) return { color: "#000000", alpha: 1 };
  const s = [...stops].sort((x, y) => x.off - y.off);
  if (s.length === 1) return { color: s[0].color, alpha: s[0].alpha };

  const acc = [0, 0, 0, 0]; // r, g, b, alpha -- all weighted
  let wSum = 0;
  for (let i = 0; i < s.length; i++) {
    const lo = s[Math.max(0, i - 1)].off;
    const hi = s[Math.min(s.length - 1, i + 1)].off;
    const w = Math.max((hi - lo) / 2, 1e-6);
    const [cr, cg, cb] = hexToRgb(s[i].color);
    acc[0] += cr * w;
    acc[1] += cg * w;
    acc[2] += cb * w;
    acc[3] += s[i].alpha * w;
    wSum += w;
  }
  return {
    color: `#${toHexByte(acc[0] / wSum)}${toHexByte(acc[1] / wSum)}${toHexByte(acc[2] / wSum)}`,
    alpha: clamp01(acc[3] / wSum),
  };
}

/** `paint` resolved to a flat colour: a `url(#id)` gradient collapses to its
 * average stop; everything else just has its alpha split off. */
function resolvePaint(paint: string, grads: Map<string, RawGradient>): Paint {
  const ref = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(paint.trim());
  return ref ? averageStops(resolveStops(ref[1], grads)) : splitAlpha(paint);
}

/* ------------------------------------------------------------------------- */
/* Walk                                                                     */
/* ------------------------------------------------------------------------- */

interface Frame {
  skip: boolean;
  m: Mat;
  fill: string;
  stroke: string;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWidth: string;
  fillRule: string;
}

/** Subtrees whose content never becomes a visible shape. */
const SKIP = new Set([
  "defs", "foreignobject", "style", "script", "clippath", "mask",
  "symbol", "metadata", "title", "desc", "lineargradient", "radialgradient",
]);

const TAG_RE = /<(\/)?([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)\s*>/g;

function isVisible(color: string): boolean {
  return color !== "" && color !== "none" && color !== "transparent";
}

/**
 * Rewrites typst.ts "vector format" SVG into a flat one: `<use>` resolved,
 * transforms collapsed to a `matrix()` per `<path>`, quadratics elevated,
 * gradients flattened to solids, transparency folded into `opacity`.
 */
export function simplifyTypstSvg(svgSource: string): string {
  const glyphs = new Map<string, string>();
  for (const m of svgSource.matchAll(/<path\b([^>]*?)\/?>/g)) {
    const a = parseAttrs(m[1]);
    if (a.id !== undefined && a.d !== undefined) glyphs.set(a.id, a.d);
  }
  const grads = collectGradients(svgSource);

  const paths: string[] = [];
  let width = 0;
  let height = 0;
  const root: Frame = {
    skip: false, m: ID,
    fill: "none", stroke: "none",
    fillOpacity: 1, strokeOpacity: 1, strokeWidth: "", fillRule: "",
  };
  const stack: Frame[] = [root];

  for (let m = TAG_RE.exec(svgSource); m !== null; m = TAG_RE.exec(svgSource)) {
    const isClose = m[1] === "/";
    const name = m[2].toLowerCase();
    const selfClose = m[4] === "/";

    if (isClose) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const top = stack[stack.length - 1];
    const a = parseAttrs(m[3]);

    if (name === "svg") {
      width = Number(a["data-width"] ?? a.width) || width;
      height = Number(a["data-height"] ?? a.height) || height;
    }

    const frame: Frame = {
      skip: top.skip || SKIP.has(name),
      m: a.transform !== undefined ? mul(top.m, parseTransform(a.transform)) : top.m,
      fill: a.fill ?? top.fill,
      stroke: a.stroke ?? top.stroke,
      fillOpacity: top.fillOpacity * opacityToken(a["fill-opacity"]) * opacityToken(a.opacity),
      strokeOpacity: top.strokeOpacity * opacityToken(a["stroke-opacity"]) * opacityToken(a.opacity),
      strokeWidth: a["stroke-width"] ?? top.strokeWidth,
      fillRule: a["fill-rule"] ?? top.fillRule,
    };

    if (!frame.skip && (name === "path" || name === "use")) {
      const d = name === "path"
        ? a.d
        : glyphs.get((a.href ?? a["xlink:href"] ?? "").replace(/^#/, ""));
      if (d !== undefined && d.trim() !== "") {
        const px = Number(a.x) || 0;
        const py = Number(a.y) || 0;
        const shapeM = name === "use" && (px || py) ? mul(frame.m, { ...ID, e: px, f: py }) : frame.m;
        const svg = emitPath(d.trim(), shapeM, frame, grads);
        if (svg !== "") paths.push(svg);
      }
    }

    if (!selfClose) stack.push(frame);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" `
    + `width="${String(width)}" height="${String(height)}">\n${paths.join("\n")}\n</svg>`;
}

function emitPath(d: string, m: Mat, s: Frame, grads: Map<string, RawGradient>): string {
  const fill = resolvePaint(s.fill, grads);
  const stroke = resolvePaint(s.stroke, grads);
  const hasFill = isVisible(fill.color);
  const hasStroke = isVisible(stroke.color);
  if (!hasFill && !hasStroke) return "";

  const bits = [`d="${normalizePathData(d)}"`, `transform="${matrixAttr(m)}"`];

  bits.push(`fill="${hasFill ? fill.color : "none"}"`);
  if (hasFill && s.fillRule !== "") bits.push(`fill-rule="${s.fillRule}"`);
  if (hasStroke) {
    bits.push(`stroke="${stroke.color}"`);
    if (s.strokeWidth !== "") bits.push(`stroke-width="${s.strokeWidth}"`);
  }

  // Cavalry's importer ignores `fill-opacity` / `stroke-opacity` but honours
  // `opacity` (mapped to the layer's opacity). One shape almost always has just
  // a fill OR just a stroke, so collapsing both channels to one value is exact
  // here; if it ever has both, the fill's transparency wins.
  const opacity = clamp01((hasFill ? s.fillOpacity * fill.alpha : s.strokeOpacity * stroke.alpha));
  if (opacity < 0.999) bits.push(`opacity="${Number(opacity.toFixed(4)).toString()}"`);

  return `<path ${bits.join(" ")}/>`;
}
