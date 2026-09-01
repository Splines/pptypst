/**
 * Builds the full Typst document that gets compiled, from the source the user
 * typed in the panel.
 *
 * Ported from `buildRawTypstString` in the PowerPoint add-in
 * (`web/src/typst.ts`). The page is sized to its content with no margins and no
 * fill so the rendered SVG is a tight bounding box around the formula.
 */

export interface DocumentOptions {
  /** Point size passed to `#set text(size: ...)`. */
  fontSizePt: number;
  /**
   * Wrap the source in `$ ... $` display-math delimiters. Off means the source
   * is inserted as-is, so the user writes their own `$ ... $`.
   */
  mathMode: boolean;
}

export function buildTypstDocument(source: string, options: DocumentOptions): string {
  const body = options.mathMode ? `$\n${source}\n$` : source;
  return (
    "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)\n"
    + `#set text(size: ${String(options.fontSizePt)}pt)\n`
    + body
  );
}
