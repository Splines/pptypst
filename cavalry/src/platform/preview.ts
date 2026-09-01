/**
 * The live preview swatch: a `ui.Draw` widget that paints the flattened Typst
 * SVG as `cavalry.Path`s, scaled to fit. No scene layers, no files -- it is
 * driven straight from an SVG string as the user types.
 *
 * All `ui.Draw` / `cavalry.Path` construction lives here; `panel.ts` only places
 * the widget and forwards SVG to {@link Preview.show}.
 */

import { flattenTypstSvg } from "../core/svg-flatten.ts";
import { parsePathData, type PathVerb } from "../core/svg-path.ts";

/** Side length of the (square) preview widget, in pixels. */
const SIZE = 320;
/** Inset so glyphs never touch the widget edge, in pixels. */
const PADDING = 14;
/** Paper-like backdrop and ink, chosen to read on Cavalry's dark panel. */
const BACKGROUND = "#ededed";
const INK = "#111111";

export interface Preview {
  /** The widget to hand to `ui.add`. */
  readonly widget: ui.Draw;
  /** Repaints the swatch from `svg` (raw typst.ts output), scaled to fit. */
  show: (svg: string) => void;
  /** Empties the swatch. */
  clear: () => void;
}

export function createPreview(): Preview {
  const draw = new ui.Draw();
  draw.setSize(SIZE, SIZE);
  draw.setBackgroundColor(BACKGROUND);

  function clear(): void {
    draw.clearPaths();
    draw.redraw();
  }

  function show(svg: string): void {
    const flat = flattenTypstSvg(svg);
    draw.clearPaths();

    if (flat.width > 0 && flat.height > 0 && flat.paths.length > 0) {
      // Fit the SVG viewBox into the padded square, preserving aspect ratio.
      // `ui.Draw`'s path space has its origin at the widget's bottom-left with
      // +x right and +y up. SVG is top-left origin and y-down, so `feed` flips y
      // and shifts the scaled viewBox so its middle lands on the widget centre.
      const usable = SIZE - PADDING * 2;
      const scale = Math.min(usable / flat.width, usable / flat.height);
      const halfWidth = flat.width / 2;
      const halfHeight = flat.height / 2;

      for (const { d, style } of flat.paths) {
        if (style.fill === "none" && style.stroke === "none") {
          continue; // invisible in the source (e.g. the page rect) -- skip it
        }
        const path = new cavalry.Path();
        feed(path, parsePathData(d), scale, halfWidth, halfHeight);
        const asStroke = style.fill === "none";
        draw.addPath(path.toObject(), asStroke ? { color: INK, stroke: true, strokeWidth: 1 } : { color: INK });
      }
    }

    draw.redraw();
  }

  return { widget: draw, show, clear };
}

/**
 * Replays `verbs` onto `path`, mapping SVG coords (top-left origin, y-down) into
 * `ui.Draw`'s path space (bottom-left origin, y-up): centre each coord on the
 * SVG middle, flip y, scale to fit, then translate to the widget centre so the
 * drawing sits in the middle of the swatch.
 */
function feed(
  path: cavalry.Path,
  verbs: readonly PathVerb[],
  scale: number,
  halfWidth: number,
  halfHeight: number,
): void {
  const centre = SIZE / 2;
  const x = (value: number): number => centre + (value - halfWidth) * scale;
  const y = (value: number): number => centre + (halfHeight - value) * scale;

  for (const { type, coords } of verbs) {
    if (type === "M") {
      path.moveTo(x(coords[0]), y(coords[1]));
    } else if (type === "L") {
      path.lineTo(x(coords[0]), y(coords[1]));
    } else if (type === "C") {
      path.cubicTo(x(coords[0]), y(coords[1]), x(coords[2]), y(coords[3]), x(coords[4]), y(coords[5]));
    } else if (type === "Q") {
      path.quadTo(x(coords[0]), y(coords[1]), x(coords[2]), y(coords[3]));
    } else {
      path.close();
    }
  }
}
