/**
 * The panel's cross-session user preferences, stored via Cavalry's own
 * `api.*PreferenceObject` bucket (the same place the app keeps its settings).
 *
 * The "Only Math" toggle and the fill colour live here. Both mirror the
 * PowerPoint add-in, which remembers them in `localStorage` and seeds a fresh
 * formula from them; a formula opened for editing carries its own saved values
 * (see `core/formula.ts`) and takes precedence.
 */

/** `api.setPreferenceObject` keys; namespaced so they can't collide with Cavalry's. */
const ONLY_MATH_KEY = "pptypst.onlyMath";
const FILL_COLOR_KEY = "pptypst.fillColor";

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
 * The remembered fill colour as a hex string, or `null` when the user has
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
