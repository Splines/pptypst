/**
 * Parses the *normalized* path `d` strings produced by
 * {@link import("./svg-flatten.ts").flattenTypstSvg} into structured verbs.
 *
 * That flattener already expands every command into absolute `M`/`L`/`C`/`Q`/`Z`
 * (arcs are never emitted for glyph or shape outlines), space-separated with a
 * comma between the point groups of a curve. So the grammar here is tiny: a verb
 * letter followed by a fixed number of coordinates. Anything else -- a stray `A`
 * and its numbers -- is skipped rather than guessed at.
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
