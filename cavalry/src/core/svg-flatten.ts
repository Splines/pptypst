/**
 * Flattens a typst.ts "vector format" SVG into a plain, importer-friendly SVG:
 * every glyph/shape becomes a single top-level `<path>` with its `d` baked into
 * absolute, already-transformed coordinates. No `<use>`, no nested `<g
 * transform>`, no `<defs>`, no `<style>`, no `<foreignObject>`.
 *
 * Why: typst.ts dedups glyph outlines into `<defs>` and instantiates them via
 * `<use href="#id">` (note: unprefixed `href`, not `xlink:href`) inside several
 * levels of nested `<g transform="translate(...) scale(...)">`, plus a
 * `<foreignObject>` text-selection overlay per glyph and a CSS stylesheet that
 * sets the effective default fill. Cavalry's `api.convertSVGToLayers` is built
 * for flat, hand-authored SVGs and does not compose that structure correctly
 * (glyphs collapse onto one point, orientation comes out mirrored). Resolving
 * every reference and baking every ancestor transform into the path data itself
 * sidesteps whatever the importer does or doesn't support.
 */

interface Matrix {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function applyPoint(m: Matrix, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** Reflects `prev` through `current`, or returns `current` if there is no `prev`
 * (used for the S/T "smooth curve" commands' implicit control point). */
function reflectControlPoint(
  current: readonly [number, number],
  prev: readonly [number, number] | null,
): [number, number] {
  if (!prev) return [current[0], current[1]];
  return [2 * current[0] - prev[0], 2 * current[1] - prev[1]];
}

function num(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

/* -------------------------------------------------------------------------- */
/* Color + opacity normalization                                             */
/*                                                                            */
/* Ported from the PowerPoint add-in's `web/src/svg.ts`. PowerPoint's SVG      */
/* import chokes on `#RRGGBBAA` / `rgba(...)` colors; Cavalry's                */
/* `api.convertSVGToLayers` has the same blind spot, and it also drops         */
/* `fill-opacity` / `stroke-opacity` that only lived on a group we flatten     */
/* away. So we split every alpha-carrying color into an opaque color plus an   */
/* explicit `*-opacity`, and fold group `opacity` / `*-opacity` into the leaf  */
/* paths the same multiplicative way `combineOpacity` does there.              */
/* -------------------------------------------------------------------------- */

function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

/** Parses `"0.5"` / `"50%"` / `"1"` into a 0..1 number; `null` when absent or
 * unparseable (so callers can treat it as "not specified"). Mirrors
 * `parseAlpha` in `web/src/svg.ts`. */
function parseOpacityToken(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === "") return null;
  const isPercent = s.endsWith("%");
  const n = Number(isPercent ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  return clampUnit(isPercent ? n / 100 : n);
}

interface ColorAlpha {
  /** An opaque color string suitable for a `fill` / `stroke` / `stop-color`. */
  color: string;
  /** The alpha carried by the input, or `null` if it was already opaque /
   * not a literal color (`none`, `url(...)`, `currentColor`, a named color,
   * `#rgb`, `#rrggbb`, `rgb(...)`). */
  alpha: number | null;
}

/** Splits `#RGBA` / `#RRGGBBAA` / `rgba(...)` into an opaque color + its
 * alpha. Anything else is returned untouched with `alpha: null`. This is the
 * `parseColorWithAlpha` half of `web/src/svg.ts`, minus the DOM color parser
 * (this module stays runnable on plain Node for the unit tests). */
function splitColorAlpha(value: string): ColorAlpha {
  const v = value.trim();

  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      return { color: `#${hex.slice(0, 6).toLowerCase()}`, alpha: parseInt(hex.slice(6), 16) / 255 };
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      const [r, g, b, a] = hex;
      return { color: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), alpha: parseInt(a + a, 16) / 255 };
    }
    return { color: v, alpha: null };
  }

  const rgba = v.toLowerCase().match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/,
  );
  if (rgba) {
    const color = `#${toHexByte(Number(rgba[1]))}${toHexByte(Number(rgba[2]))}${toHexByte(Number(rgba[3]))}`;
    return { color, alpha: rgba[4] ? parseOpacityToken(rgba[4]) : null };
  }

  return { color: v, alpha: null };
}

/** `#rrggbb` / `#rgb` -> `[r, g, b]` (0..255). Non-hex inputs fall back to
 * black -- gradient stops from typst are always `#rrggbb`. */
function hexToRgb(value: string): [number, number, number] {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return [0, 0, 0];
}

/** Formats an opacity for output, trimming a pointless `.0000` tail. */
function formatOpacity(value: number): string {
  return Number(clampUnit(value).toFixed(4)).toString();
}

/** The `#id` a `url(#id)` paint points at, or `null` for any other value. */
function gradientRefId(paint: string): string | null {
  const m = paint.trim().match(/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/);
  return m ? m[1] : null;
}

/** Indexes into a number array, genuinely typed `number | undefined` (plain
 * indexing is `number` under this project's tsconfig, hiding out-of-range
 * reads -- `Array.prototype.at` needs a newer `lib` than Cavalry's engine is
 * confirmed to support, so this is the portable equivalent). */
function at(values: readonly number[], index: number): number | undefined {
  return index < values.length ? values[index] : undefined;
}

function parseTransform(str: string | undefined): Matrix {
  if (!str) return IDENTITY;
  let result = IDENTITY;
  const fnRe = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match = fnRe.exec(str);
  while (match !== null) {
    const fn = match[1];
    const args = (match[2].match(/-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    let m: Matrix = IDENTITY;
    if (fn === "translate") {
      m = { ...IDENTITY, e: at(args, 0) ?? 0, f: at(args, 1) ?? 0 };
    } else if (fn === "scale") {
      const sx = at(args, 0) ?? 1;
      m = { ...IDENTITY, a: sx, d: at(args, 1) ?? sx };
    } else if (fn === "matrix" && args.length >= 6) {
      m = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    } else if (fn === "rotate") {
      const rad = ((at(args, 0) ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot: Matrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (args.length >= 3) {
        const cx = args[1];
        const cy = args[2];
        m = multiply(multiply({ ...IDENTITY, e: cx, f: cy }, rot), { ...IDENTITY, e: -cx, f: -cy });
      } else {
        m = rot;
      }
    }
    result = multiply(result, m);
    match = fnRe.exec(str);
  }
  return result;
}

/** Transforms an SVG path `d` string, baking `m` into every coordinate. Expands
 * H/V/S/T so the output only ever uses M/L/C/Q/Z (plus best-effort A). */
function transformPathData(d: string, m: Matrix): string {
  const cmdRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  const numRe = /-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCubicCtrl: [number, number] | null = null;
  let prevQuadCtrl: [number, number] | null = null;
  const out: string[] = [];

  const emitPoint = (x: number, y: number): string => {
    const [tx, ty] = applyPoint(m, x, y);
    return `${tx.toFixed(3)} ${ty.toFixed(3)}`;
  };

  let match = cmdRe.exec(d);
  while (match !== null) {
    const letter = match[1];
    const isRelative = letter === letter.toLowerCase();
    const cmd = letter.toUpperCase();
    const nums = (match[2].match(numRe) ?? []).map(num);
    let i = 0;

    const nextPoint = (): [number, number] => {
      const x = nums[i++];
      const y = nums[i++];
      return isRelative ? [cx + x, cy + y] : [x, y];
    };

    if (cmd === "Z") {
      out.push("Z");
      cx = startX;
      cy = startY;
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    } else if (cmd === "M") {
      const [x, y] = nextPoint();
      out.push(`M ${emitPoint(x, y)}`);
      cx = x;
      cy = y;
      startX = x;
      startY = y;
      // Subsequent coordinate pairs after an initial moveto are implicit linetos.
      while (i < nums.length) {
        const [lx, ly] = nextPoint();
        out.push(`L ${emitPoint(lx, ly)}`);
        cx = lx;
        cy = ly;
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    } else if (cmd === "L") {
      while (i < nums.length) {
        const [x, y] = nextPoint();
        out.push(`L ${emitPoint(x, y)}`);
        cx = x;
        cy = y;
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    } else if (cmd === "H") {
      while (i < nums.length) {
        const x = isRelative ? cx + nums[i++] : nums[i++];
        out.push(`L ${emitPoint(x, cy)}`);
        cx = x;
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    } else if (cmd === "V") {
      while (i < nums.length) {
        const y = isRelative ? cy + nums[i++] : nums[i++];
        out.push(`L ${emitPoint(cx, y)}`);
        cy = y;
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    } else if (cmd === "C") {
      while (i + 5 < nums.length + 1 && i < nums.length) {
        const [x1, y1] = nextPoint();
        const [x2, y2] = nextPoint();
        const [x, y] = nextPoint();
        out.push(`C ${emitPoint(x1, y1)}, ${emitPoint(x2, y2)}, ${emitPoint(x, y)}`);
        cx = x;
        cy = y;
        prevCubicCtrl = [x2, y2];
      }
      prevQuadCtrl = null;
    } else if (cmd === "S") {
      while (i < nums.length) {
        const [x1, y1] = reflectControlPoint([cx, cy], prevCubicCtrl);
        const [x2, y2] = nextPoint();
        const [x, y] = nextPoint();
        out.push(`C ${emitPoint(x1, y1)}, ${emitPoint(x2, y2)}, ${emitPoint(x, y)}`);
        cx = x;
        cy = y;
        prevCubicCtrl = [x2, y2];
      }
      prevQuadCtrl = null;
    } else if (cmd === "Q") {
      while (i < nums.length) {
        const [x1, y1] = nextPoint();
        const [x, y] = nextPoint();
        out.push(`Q ${emitPoint(x1, y1)}, ${emitPoint(x, y)}`);
        cx = x;
        cy = y;
        prevQuadCtrl = [x1, y1];
      }
      prevCubicCtrl = null;
    } else if (cmd === "T") {
      while (i < nums.length) {
        const [x1, y1] = reflectControlPoint([cx, cy], prevQuadCtrl);
        const [x, y] = nextPoint();
        out.push(`Q ${emitPoint(x1, y1)}, ${emitPoint(x, y)}`);
        cx = x;
        cy = y;
        prevQuadCtrl = [x1, y1];
      }
      prevCubicCtrl = null;
    } else if (cmd === "A") {
      // Best-effort: typst never emits arcs for glyph/shape outlines (fonts use
      // line/quadratic/cubic only), so this is untested but kept for safety.
      while (i + 6 < nums.length + 1 && i < nums.length) {
        const rx = nums[i++];
        const ry = nums[i++];
        const xrot = nums[i++];
        const large = nums[i++];
        const sweep = nums[i++];
        const [x, y] = nextPoint();
        const scaleX = Math.hypot(m.a, m.b);
        const scaleY = Math.hypot(m.c, m.d);
        const det = m.a * m.d - m.b * m.c;
        const flippedSweep = det < 0 ? (sweep ? 0 : 1) : sweep;
        const largeFlag = large ? "1" : "0";
        const sweepFlag = flippedSweep ? "1" : "0";
        out.push(
          `A ${(rx * scaleX).toFixed(3)} ${(ry * scaleY).toFixed(3)} ${xrot.toFixed(2)} `
          + `${largeFlag} ${sweepFlag} ${emitPoint(x, y)}`,
        );
        cx = x;
        cy = y;
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
    }

    match = cmdRe.exec(d);
  }

  return out.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Minimal SVG tag walker                                                    */
/* -------------------------------------------------------------------------- */

interface Tag {
  name: string;
  attrs: Record<string, string | undefined>;
  selfClosing: boolean;
  /** Index just past this tag's opening `>` in the source string. */
  contentStart: number;
}

function parseAttrs(raw: string): Record<string, string | undefined> {
  const attrs: Record<string, string | undefined> = {};
  const re = /([:\w-]+)\s*=\s*"([^"]*)"/g;
  let m = re.exec(raw);
  while (m !== null) {
    attrs[m[1]] = m[2];
    m = re.exec(raw);
  }
  return attrs;
}

/** Finds the next opening/self-closing/closing tag at or after `from`. */
function nextTag(src: string, from: number): { tag: Tag | null; closeName: string | null; end: number } {
  const re = /<\/?([a-zA-Z][\w:.-]*)((?:[^"'>]|"[^"]*"|'[^']*')*?)\/?>/g;
  re.lastIndex = from;
  const m = re.exec(src);
  if (!m) return { tag: null, closeName: null, end: src.length };
  const isClose = m[0].startsWith("</");
  const selfClosing = m[0].endsWith("/>");
  if (isClose) {
    return { tag: null, closeName: m[1], end: re.lastIndex };
  }
  return {
    tag: { name: m[1], attrs: parseAttrs(m[2]), selfClosing, contentStart: re.lastIndex },
    closeName: null,
    end: re.lastIndex,
  };
}

/** Skips past the matching closing tag for an element opened at `openEnd`. */
function skipToClose(src: string, tagName: string, from: number): number {
  let depth = 1;
  let pos = from;
  while (depth > 0 && pos < src.length) {
    const { tag, closeName, end } = nextTag(src, pos);
    pos = end;
    if (tag && tag.name === tagName && !tag.selfClosing) depth++;
    else if (closeName === tagName) depth--;
  }
  return pos;
}

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: string;
  fillRule: string;
  /** Effective 0..1 fill opacity: inherited `fill-opacity` x this node's
   * `fill-opacity` x any alpha carried in the `fill` color x every ancestor's
   * (and this node's) `opacity`. `1` unless something set transparency. */
  fillOpacity: number;
  /** Effective 0..1 stroke opacity, computed the same way as {@link fillOpacity}. */
  strokeOpacity: number;
}

/** A `<linearGradient>` / `<radialGradient>` re-emitted into the flat SVG's own
 * `<defs>`, with the referencing path's baked transform composed in so it still
 * lines up after flattening. Only present when {@link FlattenOptions.flattenGradientsToSolid}
 * is `false`. */
interface ResolvedGradient {
  id: string;
  kind: "linear" | "radial";
  /** Geometry + `spreadMethod` + `gradientUnits`, ready to serialise verbatim. */
  attrs: Record<string, string>;
  /** Composed `ancestorMatrix x gradientTransform`, or `null` for none. */
  transform: Matrix | null;
  stops: { offset: string; color: string; opacity: number }[];
}

interface FlattenResult {
  width: number;
  height: number;
  paths: { d: string; style: Style }[];
  /** Gradients referenced by `fill="url(#...)"` / `stroke="url(#...)"` on the
   * paths above, already transformed into the flat SVG's coordinate space.
   * Empty when there are none, or when gradients were flattened to solid fills. */
  gradients: ResolvedGradient[];
}

function mergeStyle(base: Style, attrs: Record<string, string | undefined>): Style {
  const rawFill = attrs.fill;
  const rawStroke = attrs.stroke;
  const fillSplit = rawFill != null ? splitColorAlpha(rawFill) : null;
  const strokeSplit = rawStroke != null ? splitColorAlpha(rawStroke) : null;

  // `opacity` is not an inherited property in SVG -- it composites the element
  // (and its subtree) as a group. For a flattener that bakes groups into leaf
  // paths, folding it into both fill and stroke opacity is exact for
  // non-overlapping shapes (the assumption `mergeByStyle` already leans on) and
  // a close approximation otherwise. typst only ever emits it on leaf shapes.
  const nodeOpacity = parseOpacityToken(attrs.opacity) ?? 1;

  // Multiplicative, matching `combineOpacity` in web/src/svg.ts. A node that
  // re-declares `fill` also re-bases the color alpha; an inherited
  // `fill-opacity` from an ancestor still rides along (rare in typst output,
  // and only ever slightly over-darkens a doubly-transparent nesting).
  const fillOpacity = base.fillOpacity
    * (parseOpacityToken(attrs["fill-opacity"]) ?? 1)
    * (fillSplit?.alpha ?? 1)
    * nodeOpacity;
  const strokeOpacity = base.strokeOpacity
    * (parseOpacityToken(attrs["stroke-opacity"]) ?? 1)
    * (strokeSplit?.alpha ?? 1)
    * nodeOpacity;

  return {
    fill: fillSplit ? fillSplit.color : base.fill,
    stroke: strokeSplit ? strokeSplit.color : base.stroke,
    strokeWidth: attrs["stroke-width"] ?? base.strokeWidth,
    fillRule: attrs["fill-rule"] ?? base.fillRule,
    fillOpacity: clampUnit(fillOpacity),
    strokeOpacity: clampUnit(strokeOpacity),
  };
}

/**
 * Flattens `svgSource` into a list of absolute, already-transformed paths.
 * `SKIP_CONTENT` elements are non-visual or unsupported and their subtree is
 * dropped (foreignObject text-selection overlays, clip paths, styles/scripts).
 * `linearGradient` / `radialGradient` are skipped here too: they are collected
 * separately in pass 1 and re-emitted, resolved, by {@link resolveGradients}.
 */
const SKIP_CONTENT = new Set([
  "defs", "foreignObject", "style", "script", "clipPath", "symbol", "metadata",
  "linearGradient", "radialGradient",
]);

/** A gradient element as parsed straight out of the source (before href
 * resolution or transform baking). */
interface RawGradient {
  kind: "linear" | "radial";
  attrs: Record<string, string | undefined>;
  stops: { offset: string; color: string; opacity: number | null }[];
}

/** A path paint that pointed at a gradient, paired with the transform that got
 * baked into that path so the gradient can be moved to match. */
interface GradientRef {
  /** Index into `paths`. */
  pathIndex: number;
  channel: "fill" | "stroke";
  /** The `#id` from the `url(#id)` paint. */
  sourceId: string;
  /** The matrix flattened into this path's `d`. */
  matrix: Matrix;
  /** The path's resolved `fill-opacity` / `stroke-opacity`, to fold into the
   * gradient's stops (Cavalry may not honour `*-opacity` on a `url(...)` paint). */
  opacity: number;
  /** Stable id for the re-emitted gradient. */
  outId: string;
}

/** Pulls the `<stop>` children out of a gradient element's inner markup,
 * reading `stop-color` / `stop-opacity` from either attributes or an inline
 * `style` (typst uses attributes, but hand-authored SVGs vary). */
function parseStops(inner: string): RawGradient["stops"] {
  const stopRe = /<stop\b((?:[^"'>]|"[^"]*"|'[^']*')*?)\/?>/g;
  const stops: RawGradient["stops"] = [];
  let m = stopRe.exec(inner);
  while (m !== null) {
    const a = parseAttrs(m[1]);
    const styleColor = a.style?.match(/stop-color\s*:\s*([^;]+)/i)?.[1].trim();
    const styleOpacity = a.style?.match(/stop-opacity\s*:\s*([^;]+)/i)?.[1].trim();
    stops.push({
      offset: a.offset ?? "0",
      color: (a["stop-color"] ?? styleColor ?? "#000000").trim(),
      opacity: parseOpacityToken(a["stop-opacity"] ?? styleOpacity),
    });
    m = stopRe.exec(inner);
  }
  return stops;
}

export interface FlattenOptions {
  /**
   * When the flattened SVG has more than this many visible paths, paths that
   * share an identical resolved style are merged into a single `<path>` (one
   * Cavalry layer), kept in first-seen order. Cuts `api.convertSVGToLayers`
   * time on large figures, at the cost of per-shape editability. Omit (or
   * `Infinity`) to never merge -- the default.
   */
  mergePathsAbove?: number;
  /**
   * How `fill="url(#...)"` / `stroke="url(#...)"` gradient paints are handled:
   *
   *   - `true` (default) -- replace the paint with a single flat color, the
   *     coverage-weighted average of the gradient's stops (its alpha folded into
   *     `fill-opacity` / `stroke-opacity`). Lossy, but every importer renders
   *     it; mirrors the PowerPoint add-in giving up on true gradients.
   *   - `false` -- keep the gradient: re-emit it in the flat SVG's own `<defs>`
   *     with the referencing path's baked transform composed in, and alpha
   *     folded into `stop-opacity`. Faithful, but only as good as the importer's
   *     gradient support.
   */
  flattenGradientsToSolid?: boolean;
}

export function flattenTypstSvg(svgSource: string, options: FlattenOptions = {}): FlattenResult {
  const glyphs = new Map<string, string>();
  const rawGradients = new Map<string, RawGradient>();
  const paths: { d: string; style: Style }[] = [];
  const gradientRefs: GradientRef[] = [];
  let width = 0;
  let height = 0;

  // Pass 1: collect `<path id="...">` glyph outlines and every gradient
  // definition, wherever they sit (typst puts the base gradient in
  // `<defs class="clip-path">` and an href'd, transformed alias inline next to
  // the shape -- and pass 2 skips both).
  {
    let pos = 0;
    for (;;) {
      const { tag, closeName, end } = nextTag(svgSource, pos);
      if (!tag && !closeName) break;
      pos = end;
      if (!tag) continue;
      if (tag.name === "path" && tag.attrs.id) {
        glyphs.set(tag.attrs.id, tag.attrs.d ?? "");
      } else if ((tag.name === "linearGradient" || tag.name === "radialGradient") && tag.attrs.id) {
        const inner = tag.selfClosing
          ? ""
          : svgSource.slice(tag.contentStart).match(/^([\s\S]*?)<\/(?:linear|radial)Gradient>/)?.[1] ?? "";
        rawGradients.set(tag.attrs.id, {
          kind: tag.name === "linearGradient" ? "linear" : "radial",
          attrs: tag.attrs,
          stops: parseStops(inner),
        });
      }
    }
  }

  const rootStyle: Style = {
    fill: "none", stroke: "none", strokeWidth: "1", fillRule: "nonzero",
    fillOpacity: 1, strokeOpacity: 1,
  };

  function walk(pos: number, matrix: Matrix, style: Style): number {
    for (;;) {
      const { tag, closeName, end } = nextTag(svgSource, pos);
      if (closeName) return end;
      if (!tag) return svgSource.length;
      pos = end;

      if (tag.name === "svg") {
        width = Number(tag.attrs["data-width"] ?? tag.attrs.width) || width;
        height = Number(tag.attrs["data-height"] ?? tag.attrs.height) || height;
        if (tag.selfClosing) continue;
        pos = walk(pos, matrix, style);
        continue;
      }

      if (SKIP_CONTENT.has(tag.name)) {
        if (!tag.selfClosing) pos = skipToClose(svgSource, tag.name, tag.contentStart);
        continue;
      }

      const childMatrix = tag.attrs.transform ? multiply(matrix, parseTransform(tag.attrs.transform)) : matrix;
      const childStyle = mergeStyle(style, tag.attrs);

      if (tag.name === "path" || tag.name === "use") {
        const d = tag.name === "path"
          ? tag.attrs.d
          : glyphs.get((tag.attrs.href ?? tag.attrs["xlink:href"] ?? "").replace(/^#/, ""));
        if (d) {
          const ox = Number(tag.attrs.x ?? 0);
          const oy = Number(tag.attrs.y ?? 0);
          const useMatrix = (ox || oy) ? multiply(childMatrix, { ...IDENTITY, e: ox, f: oy }) : childMatrix;
          const pathIndex = paths.length;
          paths.push({ d: transformPathData(d, useMatrix), style: childStyle });
          registerGradientRef(pathIndex, "fill", childStyle.fill, useMatrix, childStyle.fillOpacity);
          registerGradientRef(pathIndex, "stroke", childStyle.stroke, useMatrix, childStyle.strokeOpacity);
        }
        if (!tag.selfClosing) pos = skipToClose(svgSource, tag.name, tag.contentStart);
        continue;
      }

      if (tag.selfClosing) continue;
      pos = walk(pos, childMatrix, childStyle);
    }
  }

  function registerGradientRef(
    pathIndex: number, channel: "fill" | "stroke", paint: string, matrix: Matrix, opacity: number,
  ): void {
    const sourceId = gradientRefId(paint);
    if (sourceId === null || !rawGradients.has(sourceId)) return;
    gradientRefs.push({
      pathIndex, channel, sourceId, matrix, opacity,
      outId: `pptypst-grad-${String(gradientRefs.length)}`,
    });
  }

  walk(0, IDENTITY, rootStyle);

  const gradients = resolveGradients(paths, gradientRefs, rawGradients, options.flattenGradientsToSolid !== false);
  return { width, height, paths, gradients };
}

/** Follows a gradient's `href` / `xlink:href` chain, inheriting any attribute
 * (and the stops) not set closer to the leaf -- SVG's "if absent" inheritance,
 * not a compose. */
function resolveGradientChain(
  startId: string, defs: Map<string, RawGradient>,
): { kind: "linear" | "radial"; attrs: Record<string, string | undefined>; stops: RawGradient["stops"] } | null {
  const start = defs.get(startId);
  if (!start) return null;

  const merged: Record<string, string | undefined> = {};
  const inherited = new Set<string>();
  let stops: RawGradient["stops"] = [];
  const seen = new Set<string>();
  let cur: RawGradient | undefined = start;
  let curId: string | undefined = startId;

  while (cur && curId !== undefined && !seen.has(curId)) {
    seen.add(curId);
    for (const [k, v] of Object.entries(cur.attrs)) {
      if (v !== undefined && k !== "id" && k !== "href" && k !== "xlink:href" && !inherited.has(k)) {
        merged[k] = v;
        inherited.add(k);
      }
    }
    if (stops.length === 0 && cur.stops.length > 0) stops = cur.stops;
    const parentRef: string | undefined = cur.attrs.href ?? cur.attrs["xlink:href"];
    curId = parentRef !== undefined && parentRef.startsWith("#") ? parentRef.slice(1) : undefined;
    cur = curId !== undefined ? defs.get(curId) : undefined;
  }

  return { kind: start.kind, attrs: merged, stops };
}

/** Resolves a chain's raw stops into opaque `#rrggbb` colors plus a single
 * 0..1 `opacity` -- folding in each stop's own alpha (from an `#rrggbbaa`
 * `stop-color` or a `stop-opacity`) and `extra` (the referencing path's
 * fill/stroke opacity). Mirrors the `stop-color` -> `stop-opacity` split in
 * `web/src/svg.ts`. */
function normalizeStops(
  stops: readonly RawGradient["stops"][number][], extra: number,
): { offset: string; color: string; opacity: number }[] {
  return stops.map((s) => {
    const { color, alpha } = splitColorAlpha(s.color);
    return { offset: s.offset, color, opacity: clampUnit((s.opacity ?? 1) * (alpha ?? 1) * extra) };
  });
}

/** Coverage-weighted average of a gradient's stops: each stop weighted by half
 * the offset gap to each neighbour, so it does not matter how densely typst
 * samples the ramp. */
function averageStops(stops: readonly { offset: string; color: string; opacity: number }[]): {
  color: string; opacity: number;
} {
  const parsed = stops
    .map(s => ({
      off: clampUnit(s.offset.endsWith("%") ? Number(s.offset.slice(0, -1)) / 100 : Number(s.offset)),
      rgb: hexToRgb(s.color),
      a: s.opacity,
    }))
    .sort((x, y) => x.off - y.off);

  if (parsed.length === 0) return { color: "#000000", opacity: 1 };
  if (parsed.length === 1) {
    const [r, g, b] = parsed[0].rgb;
    return { color: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`, opacity: clampUnit(parsed[0].a) };
  }

  let r = 0, g = 0, b = 0, a = 0, wSum = 0;
  for (let i = 0; i < parsed.length; i++) {
    const lo = parsed[Math.max(0, i - 1)].off;
    const hi = parsed[Math.min(parsed.length - 1, i + 1)].off;
    const w = Math.max((hi - lo) / 2, 1e-6);
    r += parsed[i].rgb[0] * w;
    g += parsed[i].rgb[1] * w;
    b += parsed[i].rgb[2] * w;
    a += parsed[i].a * w;
    wSum += w;
  }
  return { color: `#${toHexByte(r / wSum)}${toHexByte(g / wSum)}${toHexByte(b / wSum)}`, opacity: clampUnit(a / wSum) };
}

/** Geometry attributes worth carrying onto a re-emitted gradient. */
const LINEAR_GEOM = ["x1", "y1", "x2", "y2"];
const RADIAL_GEOM = ["cx", "cy", "r", "fx", "fy", "fr"];

/**
 * Turns each {@link GradientRef} into either a flat color written straight
 * back onto its path (`toSolid`), or a {@link ResolvedGradient} to emit in the
 * flat SVG's `<defs>`. In the gradient case the referencing path's baked matrix
 * is composed into `gradientTransform` so it still lines up, and every alpha
 * (stop alpha, stop-opacity, the path's own fill/stroke-opacity) is folded into
 * `stop-opacity`.
 */
function resolveGradients(
  paths: { d: string; style: Style }[],
  refs: readonly GradientRef[],
  defs: Map<string, RawGradient>,
  toSolid: boolean,
): ResolvedGradient[] {
  const out: ResolvedGradient[] = [];
  const opacityChannel = (c: "fill" | "stroke"): "fillOpacity" | "strokeOpacity" =>
    c === "fill" ? "fillOpacity" : "strokeOpacity";

  for (const ref of refs) {
    const chain = resolveGradientChain(ref.sourceId, defs);
    if (!chain || chain.stops.length === 0) continue;
    const path = paths[ref.pathIndex];

    if (toSolid) {
      const avg = averageStops(normalizeStops(chain.stops, 1));
      path.style[ref.channel] = avg.color;
      path.style[opacityChannel(ref.channel)] = clampUnit(
        path.style[opacityChannel(ref.channel)] * avg.opacity,
      );
      continue;
    }

    const units = chain.attrs.gradientUnits ?? "objectBoundingBox";
    const ownTransform = chain.attrs.gradientTransform ? parseTransform(chain.attrs.gradientTransform) : null;
    // Only `userSpaceOnUse` gradients can be re-anchored without the path's
    // pre-flatten bounding box; typst always emits that, so the other branch is
    // just a safety net that leaves the gradient in its original local space.
    const transform = units === "userSpaceOnUse"
      ? multiply(ref.matrix, ownTransform ?? IDENTITY)
      : ownTransform;

    const attrs: Record<string, string> = { gradientUnits: "userSpaceOnUse" };
    const spread = chain.attrs.spreadMethod;
    if (spread !== undefined) attrs.spreadMethod = spread;
    for (const k of chain.kind === "linear" ? LINEAR_GEOM : RADIAL_GEOM) {
      const v = chain.attrs[k];
      if (v !== undefined) attrs[k] = v;
    }

    out.push({
      id: ref.outId,
      kind: chain.kind,
      attrs,
      transform,
      stops: normalizeStops(chain.stops, ref.opacity),
    });
    path.style[ref.channel] = `url(#${ref.outId})`;
    // The alpha now lives on the stops; don't double-apply it on the path.
    path.style[opacityChannel(ref.channel)] = 1;
  }
  return out;
}

type FlatPath = { d: string; style: Style };

/** Distinguishes two resolved styles for merge purposes (see {@link mergeByStyle}). */
function styleKey(s: Style): string {
  return `${s.fill} ${s.stroke} ${s.strokeWidth} ${s.fillRule} ${formatOpacity(s.fillOpacity)} ${formatOpacity(s.strokeOpacity)}`;
}

/**
 * Collapses `paths` to one entry per distinct style, concatenating the `d` of
 * every path with that style, in the order the styles first appear.
 *
 * This reorders same-style paths relative to each other; that only shows when
 * two shapes of the *same* paint overlap, where the stacking is invisible
 * anyway. Different styles never merge, so their relative order (mostly) holds.
 * Concatenating subpaths under one `fill-rule` can turn an overlap into a hole
 * with `evenodd`; typst keeps each glyph's holes inside its own single `<path>`
 * already, and separate glyphs/shapes don't overlap, so this is safe in
 * practice -- and it only runs on big figures past the caller's threshold.
 */
function mergeByStyle(paths: readonly FlatPath[]): FlatPath[] {
  const buckets = new Map<string, FlatPath>();
  for (const p of paths) {
    const key = styleKey(p.style);
    const existing = buckets.get(key);
    if (existing) {
      existing.d += ` ${p.d}`;
    } else {
      buckets.set(key, { d: p.d, style: p.style });
    }
  }
  return [...buckets.values()];
}

/** How many paths {@link serializeFlatSvg} emits before any style merge -- i.e.
 * the shape count the user sees, and what the caller compares against its
 * "large figure" threshold. */
export function countVisiblePaths(result: FlattenResult): number {
  let n = 0;
  for (const p of result.paths) {
    if (p.d.trim() !== "") n++;
  }
  return n;
}

function matrixToString(m: Matrix): string {
  return `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n => Number(n.toFixed(6)).toString()).join(",")})`;
}

/** Serializes one {@link ResolvedGradient} back to markup for the flat `<defs>`. */
function serializeGradient(g: ResolvedGradient): string {
  const tag = g.kind === "linear" ? "linearGradient" : "radialGradient";
  const attrs = [`id="${g.id}"`];
  for (const [k, v] of Object.entries(g.attrs)) attrs.push(`${k}="${v}"`);
  if (g.transform) attrs.push(`gradientTransform="${matrixToString(g.transform)}"`);
  const stops = g.stops
    .map(s => `<stop offset="${s.offset}" stop-color="${s.color}"`
      + `${s.opacity < 1 ? ` stop-opacity="${formatOpacity(s.opacity)}"` : ""}/>`)
    .join("");
  return `<${tag} ${attrs.join(" ")}>${stops}</${tag}>`;
}

/** Serializes a {@link FlattenResult} into a plain, flat SVG document. */
export function serializeFlatSvg(result: FlattenResult, options: FlattenOptions = {}): string {
  const visible = result.paths.filter(p => p.d.trim() !== "");
  const emitted = visible.length > (options.mergePathsAbove ?? Infinity)
    ? mergeByStyle(visible)
    : visible;

  const defs = result.gradients.length > 0
    ? `<defs>${result.gradients.map(serializeGradient).join("")}</defs>\n`
    : "";

  const body = emitted
    .map((p) => {
      const fill = p.style.fill === "none" ? "none" : p.style.fill || "#000000";
      const stroke = p.style.stroke === "none" ? "none" : p.style.stroke || "none";
      const fillOpacity = p.style.fillOpacity < 1 ? ` fill-opacity="${formatOpacity(p.style.fillOpacity)}"` : "";
      const strokeOpacity = p.style.strokeOpacity < 1 && stroke !== "none"
        ? ` stroke-opacity="${formatOpacity(p.style.strokeOpacity)}"`
        : "";
      return `<path d="${p.d}" fill="${fill}"${fillOpacity} fill-rule="${p.style.fillRule}" `
        + `stroke="${stroke}"${strokeOpacity} stroke-width="${p.style.strokeWidth}"/>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(result.width)} ${String(result.height)}" `
    + `width="${String(result.width)}" height="${String(result.height)}">\n${defs}${body}\n</svg>`;
}

/** Convenience: flatten typst.ts's SVG output into an importer-friendly SVG string. */
export function flattenSvg(svgSource: string, options: FlattenOptions = {}): string {
  return serializeFlatSvg(flattenTypstSvg(svgSource, options), options);
}
