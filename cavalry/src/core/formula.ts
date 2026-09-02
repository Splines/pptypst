/**
 * The formula as PPTypst stores it on a Cavalry layer, and how that layer is
 * named.
 *
 * Everything about the persisted shape lives here. The product has not
 * shipped, so there is only one payload version and no back-compat handling:
 * adding a per-formula setting just means extending {@link Formula} /
 * {@link StoredFormula} and requiring the new field in {@link parseFormula} --
 * any payload from before the change is simply treated as "not a PPTypst
 * formula" and re-created on the next insert. {@link FORMULA_VERSION} is only
 * bumped once shipped payloads exist that we would otherwise misread.
 */

/** Version stamped into every payload written to a layer. */
export const FORMULA_VERSION = 1;

/** What PPTypst knows about an inserted formula. */
export interface Formula {
  /** The raw Typst body the user typed, exactly as typed. */
  source: string;
  /**
   * The preamble compiled ahead of {@link source} -- `#import` / `#let` lines.
   * Its own copy per formula: editing the global default does not disturb
   * formulas already in the scene (see the panel's "Shape preamble" mode).
   */
  preamble: string;
  /** Point size it was rendered at. */
  fontSizePt: number;
  /** Whether {@link source} was wrapped in `$ ... $` before compiling ("Only Math"). */
  mathMode: boolean;
  /** Fill color it was rendered with, as a hex string like "#ffffff". */
  color: string;
}

/** The on-layer representation. Kept structurally separate from {@link Formula}. */
interface StoredFormula {
  v: number;
  code: string;
  preamble: string;
  fontSize: number;
  math: boolean;
  color: string;
}

export function serializeFormula(formula: Formula): unknown {
  return {
    v: FORMULA_VERSION,
    code: formula.source,
    preamble: formula.preamble,
    fontSize: formula.fontSizePt,
    math: formula.mathMode,
    color: formula.color,
  } satisfies StoredFormula;
}

/**
 * Reads a payload previously written by {@link serializeFormula}. Returns
 * `null` for anything that isn't a current-version payload, so a layer
 * carrying foreign, corrupt or older-version user data is simply treated as
 * "not a PPTypst formula".
 */
export function parseFormula(raw: unknown): Formula | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { v, code, preamble, fontSize, math, color } = raw as Partial<StoredFormula>;
  if (v !== FORMULA_VERSION || typeof code !== "string" || typeof preamble !== "string"
    || typeof fontSize !== "number" || typeof math !== "boolean"
    || typeof color !== "string") {
    return null;
  }
  return { source: code, preamble, fontSizePt: fontSize, mathMode: math, color };
}

export interface LayerNameOptions {
  /** Longest run of formula source kept in the name; the rest is dropped. */
  maxSourceChars: number;
}

/** e.g. `integral_0^1 x^2 dif` for the source `$ integral_0^1 x^2 dif x = 1/3 $`. */
export function formulaLayerName(source: string, options: LayerNameOptions): string {
  const oneLine = source.replace(/\s+/g, " ").trim();
  // Drop the Typst math delimiters so the name is just the expression.
  const unwrapped = oneLine.replace(/^\$+\s*/, "").replace(/\s*\$+$/, "").trim();
  return (unwrapped || oneLine).slice(0, options.maxSourceChars);
}
