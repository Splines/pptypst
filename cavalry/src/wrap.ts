/**
 * Builds the full Typst document from the user's editor content.
 *
 * Ported from `web/src/typst.ts` `buildRawTypstString` in the PowerPoint add-in,
 * minus the per-shape font-size / preamble UI knobs. The page is sized to its
 * content with no margins or fill so the resulting SVG is a tight bounding box.
 */

import { FONT_SIZE_PT, MATH_MODE } from "./config";

export function buildTypstDocument(editorText: string): string {
  // MATH_MODE is a compile-time config toggle; the branch is intentionally dead
  // when it is false.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const body = MATH_MODE ? `$\n${editorText}\n$` : editorText;
  return (
    "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)\n"
    + `#set text(size: ${String(FONT_SIZE_PT)}pt)\n`
    + body
  );
}
