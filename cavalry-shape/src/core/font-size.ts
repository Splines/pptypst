/**
 * Picks a default point size for a freshly inserted formula.
 *
 * Typst's `pt` maps roughly 1:1 onto scene units when the rendered SVG is
 * imported (see `platform/scene.ts`), so a size tuned for a Full HD
 * composition reads as tiny in a 4K one. Scaling the default by the active
 * composition's height keeps a formula's on-screen proportions roughly
 * constant across resolutions.
 */

/** A point size known to look right at a given composition height. */
export interface FontSizeReference {
  pt: number;
  heightPx: number;
}

/** Falls back to the reference size itself when `compHeightPx` is unusable. */
export function defaultFontSizePt(compHeightPx: number, reference: FontSizeReference): number {
  if (!(compHeightPx > 0)) {
    return reference.pt;
  }
  return Math.round((compHeightPx / reference.heightPx) * reference.pt);
}
