/**
 * The panel's cross-session user preferences, stored via Cavalry's own
 * `api.*PreferenceObject` bucket (the same place the app keeps its settings).
 *
 * Only the "Only Math" toggle lives here for now. It mirrors the PowerPoint
 * add-in, which remembers the checkbox in `localStorage` and seeds a fresh
 * formula from it; a formula opened for editing carries its own saved value
 * (see `core/formula.ts`) and takes precedence.
 */

/** `api.setPreferenceObject` key; namespaced so it can't collide with Cavalry's. */
const ONLY_MATH_KEY = "pptypst.onlyMath";

/** What a fresh formula starts with when nothing has been saved yet. */
export const DEFAULT_ONLY_MATH = false;

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
