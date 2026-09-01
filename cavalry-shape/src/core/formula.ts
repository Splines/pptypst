/**
 * What a formula is, and how the layer holding it is named.
 *
 * A formula now lives in the plug-in layer's own attributes (see
 * `platform/layer.ts`), so nothing here writes to a layer any more.
 * {@link parseFormula} remains to *read* the `api.setUserData` payload that
 * PPTypst wrote before the plug-in existed, so those scenes can still be opened
 * and their formulas re-typeset.
 */

/** What PPTypst knows about an inserted formula. */
export interface Formula {
  /** The raw Typst the user typed, exactly as typed. */
  source: string;
  /**
   * Point size it was rendered at. `undefined` only for layers written by
   * v1, before font size was tracked -- the caller decides what to show for
   * those (see `defaultFontSizePt`).
   */
  fontSizePt?: number;
}

/** The pre-plug-in on-layer representation, as `api.getUserDataKey` returns it. */
interface StoredFormula {
  v: number;
  code: string;
  fontSize?: number;
}

/**
 * Reads a pre-plug-in user-data payload. Returns `null` for anything
 * unrecognisable, so a layer carrying foreign or corrupt user data is simply
 * treated as "not a PPTypst formula".
 */
export function parseFormula(raw: unknown): Formula | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { code, fontSize } = raw as Partial<StoredFormula>;
  if (typeof code !== "string") {
    return null;
  }
  return { source: code, fontSizePt: typeof fontSize === "number" ? fontSize : undefined };
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
