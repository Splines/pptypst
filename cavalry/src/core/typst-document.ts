/**
 * Builds the full Typst document that gets compiled, from the preamble and body
 * the user typed in the panel.
 *
 * Ported from `buildRawTypstString` in the PowerPoint add-in
 * (`web/src/typst.ts`). The page is sized to its content with no margins and no
 * fill so the rendered SVG is a tight bounding box around the formula.
 */

export interface DocumentOptions {
  /**
   * Typst prepended verbatim before the body -- `#import` / `#let` lines and
   * the like. Unlike the body it is never wrapped by {@link mathMode}; a
   * newline is inserted between it and the body when both are non-empty.
   */
  preamble: string;
  /** Point size passed to `#set text(size: ...)`. */
  fontSizePt: number;
  /**
   * Wrap the body in `$ ... $` display-math delimiters. Off means the body is
   * inserted as-is, so the user writes their own `$ ... $`. The preamble is
   * left alone either way.
   */
  mathMode: boolean;
  /**
   * Fill color for the text and maths, as a hex string like "#ffffff". Passed
   * to `#set text(fill: rgb(...))`, so fraction bars, roots and the like pick
   * it up too. A non-hex value falls back to black.
   */
  color: string;
}

/** Matches "#rgb", "#rgba", "#rrggbb", "#rrggbbaa"; anything else is untrusted. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function buildTypstDocument(body: string, options: DocumentOptions): string {
  const wrappedBody = options.mathMode ? `$\n${body}\n$` : body;
  const fill = HEX_COLOR.test(options.color) ? options.color : "#000000";
  // Same join as the add-in: a newline between preamble and body, but only when
  // both carry content and the preamble does not already end in one.
  const separator
    = options.preamble && wrappedBody && !options.preamble.endsWith("\n") ? "\n" : "";
  return (
    "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)\n"
    + `#set text(size: ${String(options.fontSizePt)}pt, fill: rgb("${fill}"))\n`
    + `${options.preamble}${separator}${wrappedBody}`
  );
}
