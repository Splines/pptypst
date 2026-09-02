/**
 * Parses the *normalized* path `d` strings produced by
 * {@link import("./svg-flatten.ts").flattenTypstSvg} into structured verbs.
 *
 * That flattener already expands every command into absolute `M`/`L`/`C`/`Z`
 * (quadratics are degree-elevated to cubics; arcs are never emitted for glyph or
 * shape outlines), space-separated with a comma between the point groups of a
 * curve. So the grammar here is tiny: a verb letter followed by a fixed number
 * of coordinates. `Q` is still accepted in case a caller feeds raw SVG, but the
 * flattener no longer produces it; anything else -- a stray `A` and its numbers
 * -- is skipped rather than guessed at.
 *
 * Kept free of any `cavalry.*` access so it can be unit-tested on Node; the
 * platform layer turns these verbs into a `cavalry.Path`.
 */

export interface PathVerb {
  /** `M` move, `L` line, `C` cubic, `Q` quadratic, `Z` close. */
  type: "M" | "L" | "C" | "Q" | "Z";
  /** `M`/`L`: `[x, y]`; `C`: `[x1, y1, x2, y2, x, y]`; `Q`: `[x1, y1, x, y]`; `Z`: `[]`. */
  coords: number[];
}

const COORD_COUNT = new Map<string, number>([["M", 2], ["L", 2], ["C", 6], ["Q", 4], ["Z", 0]]);

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The tight box enclosing every coordinate across `verbs` (including curve
 * control points, so it's a safe over-estimate rather than the true ink
 * outline -- fine for fit-to-box scaling). `null` for an empty/`Z`-only input.
 */
export function boundingBox(verbs: readonly PathVerb[]): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const verb of verbs) {
    for (let i = 0; i < verb.coords.length; i += 2) {
      const x = verb.coords[i];
      const y = verb.coords[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export function parsePathData(d: string): PathVerb[] {
  const tokens = d.replace(/,/g, " ").split(/\s+/).filter(token => token.length > 0);
  const verbs: PathVerb[] = [];

  let i = 0;
  while (i < tokens.length) {
    const type = tokens[i++];
    const count = COORD_COUNT.get(type);
    if (count === undefined) {
      continue; // unsupported verb (or its orphaned numbers) -- drop it
    }
    if (i + count > tokens.length) {
      break; // truncated tail; nothing sensible left to read
    }
    const coords: number[] = [];
    for (let k = 0; k < count; k++) {
      coords.push(Number(tokens[i++]));
    }
    verbs.push({ type: type as PathVerb["type"], coords });
  }

  return verbs;
}
