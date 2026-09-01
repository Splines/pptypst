/**
 * The formula as PPTypst stores it on a Cavalry layer, and how that layer is
 * named.
 *
 * Everything about the persisted shape lives here so that adding per-formula
 * settings later (font size, colour, ...) is a contained change: bump
 * {@link FORMULA_VERSION}, extend {@link Formula}, and teach
 * {@link parseFormula} how to read the older shapes.
 */

/** Version stamped into every payload written to a layer. */
export const FORMULA_VERSION = 1;

/** What PPTypst knows about an inserted formula. */
export interface Formula {
  /** The raw Typst the user typed, exactly as typed. */
  source: string;
}

/** The on-layer representation. Kept structurally separate from {@link Formula}. */
interface StoredFormula {
  v: number;
  code: string;
}

export function serializeFormula(formula: Formula): unknown {
  return { v: FORMULA_VERSION, code: formula.source } satisfies StoredFormula;
}

/**
 * Reads a payload previously written by {@link serializeFormula}. Returns
 * `null` for anything unrecognisable, so a layer carrying foreign or corrupt
 * user data is simply treated as "not a PPTypst formula".
 */
export function parseFormula(raw: unknown): Formula | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { code } = raw as Partial<StoredFormula>;
  if (typeof code !== "string") {
    return null;
  }
  return { source: code };
}

export interface LayerNameOptions {
  prefix: string;
  /** Longest run of formula source kept in the name before it is ellipsised. */
  maxSourceChars: number;
}

/** e.g. `PPTypst: integral_0…` for the source `integral_0^1 x^2 dif x`. */
export function formulaLayerName(source: string, options: LayerNameOptions): string {
  const oneLine = source.replace(/\s+/g, " ").trim();
  const truncated = oneLine.length > options.maxSourceChars
    ? `${oneLine.slice(0, options.maxSourceChars)}…`
    : oneLine;
  return `${options.prefix}: ${truncated}`;
}
