/**
 * The panel's cross-session user preferences, stored via Cavalry's own
 * `api.*PreferenceObject` bucket (the same place the app keeps its settings).
 *
 * The "Only Math" toggle, the fill color, the font size and the global
 * preamble (plus whether its editor is expanded) live here. They make the
 * panel sticky across launches: whatever the user last had (set by hand, or
 * loaded by selecting a formula) is what the next window opens with. The Reset
 * button is what returns Size / Color / "Only Math" to composition-derived
 * defaults; it leaves the preamble alone.
 */

/** `api.setPreferenceObject` keys; namespaced so they can't collide with Cavalry's. */
const ONLY_MATH_KEY = "pptypst.onlyMath";
const FILL_COLOR_KEY = "pptypst.fillColor";
const FONT_SIZE_KEY = "pptypst.fontSizePt";
const PREAMBLE_KEY = "pptypst.preamble";
const PREAMBLE_OPEN_KEY = "pptypst.preambleOpen";

/**
 * What "Only Math" starts as before the user has ever touched it. On, to match
 * the PowerPoint add-in (whose checkbox ships `checked`): most insertions are a
 * single expression, and typing the `$ ... $` by hand every time is friction.
 */
export const DEFAULT_ONLY_MATH = true;

/** The remembered "Only Math" choice, or {@link DEFAULT_ONLY_MATH} if unset. */
export function loadOnlyMathPreference(): boolean {
  if (!api.hasPreferenceObject(ONLY_MATH_KEY)) {
    return DEFAULT_ONLY_MATH;
  }
  const stored = api.getPreferenceObject(ONLY_MATH_KEY);
  return typeof stored === "boolean" ? stored : DEFAULT_ONLY_MATH;
}

/** Remembers `onlyMath` for future sessions. */
export function saveOnlyMathPreference(onlyMath: boolean): void {
  api.setPreferenceObject(ONLY_MATH_KEY, onlyMath);
}

/**
 * The remembered fill color as a hex string, or `null` when the user has
 * never set one -- the caller then derives a default from the active
 * composition's background (see `core/contrast.ts`).
 */
export function loadFillColorPreference(): string | null {
  if (!api.hasPreferenceObject(FILL_COLOR_KEY)) {
    return null;
  }
  const stored = api.getPreferenceObject(FILL_COLOR_KEY);
  return typeof stored === "string" ? stored : null;
}

/** Remembers `color` (a hex string) for future sessions. */
export function saveFillColorPreference(color: string): void {
  api.setPreferenceObject(FILL_COLOR_KEY, color);
}

/**
 * The remembered font size in points, or `null` when the user has never set
 * one -- the caller then derives a default from the active composition's height
 * (see `core/font-size.ts`).
 */
export function loadFontSizePreference(): number | null {
  if (!api.hasPreferenceObject(FONT_SIZE_KEY)) {
    return null;
  }
  const stored = api.getPreferenceObject(FONT_SIZE_KEY);
  return typeof stored === "number" ? stored : null;
}

/** Remembers `fontSizePt` for future sessions. */
export function saveFontSizePreference(fontSizePt: number): void {
  api.setPreferenceObject(FONT_SIZE_KEY, fontSizePt);
}

/** The preamble a brand-new formula starts with, before any global default is set. */
export const DEFAULT_PREAMBLE = "";

/**
 * The remembered global preamble -- the one applied to new formulas and shown
 * in the panel when nothing is being edited. {@link DEFAULT_PREAMBLE} until the
 * user sets one. A formula being edited shows its own stored preamble instead.
 */
export function loadPreamblePreference(): string {
  if (!api.hasPreferenceObject(PREAMBLE_KEY)) {
    return DEFAULT_PREAMBLE;
  }
  const stored = api.getPreferenceObject(PREAMBLE_KEY);
  return typeof stored === "string" ? stored : DEFAULT_PREAMBLE;
}

/** Remembers `preamble` as the global default for future formulas and sessions. */
export function savePreamblePreference(preamble: string): void {
  api.setPreferenceObject(PREAMBLE_KEY, preamble);
}

/** Whether the preamble editor was left expanded last session (collapsed by default). */
export function loadPreambleOpenPreference(): boolean {
  if (!api.hasPreferenceObject(PREAMBLE_OPEN_KEY)) {
    return false;
  }
  const stored = api.getPreferenceObject(PREAMBLE_OPEN_KEY);
  return typeof stored === "boolean" ? stored : false;
}

/** Remembers whether the preamble editor is expanded. */
export function savePreambleOpenPreference(open: boolean): void {
  api.setPreferenceObject(PREAMBLE_OPEN_KEY, open);
}
