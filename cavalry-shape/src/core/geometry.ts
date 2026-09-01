/**
 * The compiled formula as it travels from the panel to the JS Shape plugin.
 *
 * The shape sandbox has no `api` and no file access, so it cannot run Typst
 * (see README). The panel compiles, flattens the SVG and stores the resulting
 * outlines on the layer as a JSON string attribute; `plugin/shape.ts` parses it
 * back and replays it onto a `cavalry.Mesh`.
 *
 * That string is written into every `.cv` file that contains a formula, so the
 * stored shape is deliberately terse: short keys, no whitespace, defaults
 * omitted, coordinates rounded. Pure -- no `cavalry.*`, no `api.*`.
 */

import type { FlattenResult } from "./svg-flatten.ts";

/** Version stamped into every payload; bump when {@link StoredGeometry} changes. */
export const GEOMETRY_VERSION = 1;

/** One flattened outline: absolute SVG user units, no transform left to apply. */
export interface GeometryPath {
  d: string;
  /** `#rrggbb`, or `undefined` when the outline is not filled. */
  fill?: string;
  /** `#rrggbb`, or `undefined` when the outline is not stroked. */
  stroke?: string;
  /** Only meaningful alongside {@link stroke}. */
  strokeWidth?: number;
}

/** Everything the shape plugin needs to rebuild a formula. */
export interface Geometry {
  /** Typst's page box, in the same units as the path coordinates. */
  width: number;
  height: number;
  paths: GeometryPath[];
}

/** The on-layer representation, kept structurally separate from {@link Geometry}. */
interface StoredGeometry {
  v: number;
  w: number;
  h: number;
  p: StoredPath[];
}

interface StoredPath {
  d: string;
  f?: string;
  s?: string;
  sw?: number;
}

export interface GeometryOptions {
  /** Decimal places kept on every coordinate. Typst emits three. */
  precision: number;
}

export function serializeGeometry(geometry: Geometry): string {
  const stored: StoredGeometry = {
    v: GEOMETRY_VERSION,
    w: geometry.width,
    h: geometry.height,
    p: geometry.paths.map(path => ({
      d: path.d,
      ...(path.fill === undefined ? {} : { f: path.fill }),
      ...(path.stroke === undefined ? {} : { s: path.stroke }),
      ...(path.strokeWidth === undefined ? {} : { sw: path.strokeWidth }),
    })),
  };
  return JSON.stringify(stored);
}

/**
 * Reads a payload written by {@link serializeGeometry}. Returns `null` for
 * anything unrecognisable -- an empty attribute on a freshly created layer, a
 * future version, hand-edited nonsense -- so the shape plugin can fall back to
 * an empty mesh instead of throwing inside Cavalry's evaluation.
 */
export function parseGeometry(raw: string): Geometry | null {
  if (!raw) {
    return null;
  }

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof stored !== "object" || stored === null) {
    return null;
  }
  const { v, w, h, p } = stored as Partial<StoredGeometry>;
  if (v !== GEOMETRY_VERSION || !Array.isArray(p)) {
    return null;
  }

  const paths: GeometryPath[] = [];
  for (const entry of p) {
    if (typeof entry !== "object" || typeof entry.d !== "string") {
      continue;
    }
    paths.push({
      d: entry.d,
      ...(typeof entry.f === "string" ? { fill: entry.f } : {}),
      ...(typeof entry.s === "string" ? { stroke: entry.s } : {}),
      ...(typeof entry.sw === "number" ? { strokeWidth: entry.sw } : {}),
    });
  }

  return { width: typeof w === "number" ? w : 0, height: typeof h === "number" ? h : 0, paths };
}

/**
 * Turns flattened typst.ts output into a {@link Geometry}.
 *
 * Drops what would draw nothing -- typst's page rect comes through with
 * `fill="none" stroke="none"` -- and rounds coordinates, which is worth
 * roughly a tenth of the payload at the default precision.
 */
export function geometryFromFlattened(result: FlattenResult, options: GeometryOptions): Geometry {
  const paths: GeometryPath[] = [];

  for (const { d, style } of result.paths) {
    const fill = style.fill === "none" ? undefined : style.fill || "#000000";
    const stroke = style.stroke === "none" ? undefined : style.stroke || undefined;
    if ((fill === undefined && stroke === undefined) || d.trim() === "") {
      continue;
    }
    paths.push({
      d: roundCoordinates(d, options.precision),
      ...(fill === undefined ? {} : { fill }),
      ...(stroke === undefined ? {} : { stroke, strokeWidth: Number(style.strokeWidth) || 1 }),
    });
  }

  return { width: result.width, height: result.height, paths };
}

const NUMBER_RE = /-?(?:\d+\.\d+|\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

/** Rounds every number in a `d` string, dropping the zeros that leaves behind. */
function roundCoordinates(d: string, precision: number): string {
  return d.replace(NUMBER_RE, (token) => {
    const rounded = Number(token).toFixed(precision);
    return rounded.includes(".") ? rounded.replace(/\.?0+$/, "") : rounded;
  });
}
