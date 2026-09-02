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
}

interface FlattenResult {
  width: number;
  height: number;
  paths: { d: string; style: Style }[];
}

function mergeStyle(base: Style, attrs: Record<string, string | undefined>): Style {
  return {
    fill: attrs.fill ?? base.fill,
    stroke: attrs.stroke ?? base.stroke,
    strokeWidth: attrs["stroke-width"] ?? base.strokeWidth,
    fillRule: attrs["fill-rule"] ?? base.fillRule,
  };
}

/**
 * Flattens `svgSource` into a list of absolute, already-transformed paths.
 * `SKIP_CONTENT` elements are non-visual or unsupported and their subtree is
 * dropped (foreignObject text-selection overlays, clip paths, styles/scripts).
 */
const SKIP_CONTENT = new Set(["defs", "foreignObject", "style", "script", "clipPath", "symbol", "metadata"]);

export function flattenTypstSvg(svgSource: string): FlattenResult {
  const glyphs = new Map<string, string>();
  const paths: { d: string; style: Style }[] = [];
  let width = 0;
  let height = 0;

  // Pass 1: collect every `<path id="...">` inside `<defs>` (glyph outlines).
  {
    let pos = 0;
    for (;;) {
      const { tag, closeName, end } = nextTag(svgSource, pos);
      if (!tag && !closeName) break;
      pos = end;
      if (tag?.name === "path" && tag.attrs.id) {
        glyphs.set(tag.attrs.id, tag.attrs.d ?? "");
      }
    }
  }

  const rootStyle: Style = { fill: "none", stroke: "none", strokeWidth: "1", fillRule: "nonzero" };

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
          paths.push({ d: transformPathData(d, useMatrix), style: childStyle });
        }
        if (!tag.selfClosing) pos = skipToClose(svgSource, tag.name, tag.contentStart);
        continue;
      }

      if (tag.selfClosing) continue;
      pos = walk(pos, childMatrix, childStyle);
    }
  }

  walk(0, IDENTITY, rootStyle);
  return { width, height, paths };
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
}

type FlatPath = { d: string; style: Style };

/** Distinguishes two resolved styles for merge purposes (see {@link mergeByStyle}). */
function styleKey(s: Style): string {
  return `${s.fill} ${s.stroke} ${s.strokeWidth} ${s.fillRule}`;
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

/** Serializes a {@link FlattenResult} into a plain, flat SVG document. */
export function serializeFlatSvg(result: FlattenResult, options: FlattenOptions = {}): string {
  const visible = result.paths.filter(p => p.d.trim() !== "");
  const emitted = visible.length > (options.mergePathsAbove ?? Infinity)
    ? mergeByStyle(visible)
    : visible;

  const body = emitted
    .map((p) => {
      const fill = p.style.fill === "none" ? "none" : p.style.fill || "#000000";
      const stroke = p.style.stroke === "none" ? "none" : p.style.stroke || "none";
      return `<path d="${p.d}" fill="${fill}" fill-rule="${p.style.fillRule}" `
        + `stroke="${stroke}" stroke-width="${p.style.strokeWidth}"/>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(result.width)} ${String(result.height)}" `
    + `width="${String(result.width)}" height="${String(result.height)}">\n${body}\n</svg>`;
}

/** Convenience: flatten typst.ts's SVG output into an importer-friendly SVG string. */
export function flattenSvg(svgSource: string, options: FlattenOptions = {}): string {
  return serializeFlatSvg(flattenTypstSvg(svgSource), options);
}
