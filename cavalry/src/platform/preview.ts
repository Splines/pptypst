/**
 * The live preview swatch: a `ui.Draw` widget that paints the flattened Typst
 * SVG as `cavalry.Path`s, scaled to fit. No scene layers, no files -- it is
 * driven straight from an SVG string as the user types.
 *
 * All `ui.Draw` / `cavalry.Path` construction lives here; `panel.ts` places the
 * widget, forwards SVG to {@link Preview.show}, and calls {@link Preview.setWidth}
 * from `ui.onResize` so the swatch always spans the panel.
 */

import { flattenTypstSvg } from "../core/svg-flatten.ts";
import { parsePathData, type PathVerb } from "../core/svg-path.ts";

/** Height of the preview strip, in pixels; the width tracks the panel. */
const HEIGHT = 190;
/** Fallback width until `ui.onResize` reports the real panel width. */
const MIN_WIDTH = 320;
/** Inset so glyphs never touch the widget edge, in pixels. */
const PADDING = 14;
/** Black backdrop with white ink, to sit on Cavalry's dark interface. */
const BACKGROUND = "#000000";
const INK = "#ffffff";

export interface Preview {
  /** The widget to hand to `ui.add`. */
  readonly widget: ui.Draw;
  /** Repaints the swatch from `svg` (raw typst.ts output), scaled to fit. */
  show: (svg: string) => void;
  /** Empties the swatch. */
  clear: () => void;
  /** Stretches the swatch to `width` px (height is fixed) and repaints. */
  setWidth: (width: number) => void;
}

export function createPreview(): Preview {
  const draw = new ui.Draw();
  let width = MIN_WIDTH;
  /** The last SVG handed to {@link show}, replayed on every resize. */
  let lastSvg: string | null = null;

  draw.setSize(width, HEIGHT);
  draw.setBackgroundColor(BACKGROUND);

  function render(): void {
    draw.clearPaths();
    if (lastSvg !== null) {
      paint(lastSvg);
    }
    draw.redraw();
  }

  function paint(svg: string): void {
    const flat = flattenTypstSvg(svg);
    if (flat.width <= 0 || flat.height <= 0 || flat.paths.length === 0) {
      return;
    }

    // Fit the SVG viewBox into the padded strip, preserving aspect ratio.
    // `ui.Draw`'s path space has its origin at the widget's bottom-left with
    // +x right and +y up. SVG is top-left origin and y-down, so `feed` flips y;
    // the origin passed in places the scaled viewBox's middle at the widget
    // centre.
    const scale = Math.min(
      (width - PADDING * 2) / flat.width,
      (HEIGHT - PADDING * 2) / flat.height,
    );
    const originX = width / 2 - (flat.width / 2) * scale;
    const originY = HEIGHT / 2 + (flat.height / 2) * scale;

    for (const { d, style } of flat.paths) {
      if (style.fill === "none" && style.stroke === "none") {
        continue; // invisible in the source (e.g. the page rect) -- skip it
      }
      const path = new cavalry.Path();
      feed(path, parsePathData(d), scale, originX, originY);
      const asStroke = style.fill === "none";
      draw.addPath(path.toObject(), asStroke ? { color: INK, stroke: true, strokeWidth: 1 } : { color: INK });
    }
  }

  function show(svg: string): void {
    lastSvg = svg;
    render();
  }

  function clear(): void {
    lastSvg = null;
    render();
  }

  function setWidth(next: number): void {
    const rounded = Math.max(MIN_WIDTH, Math.round(next));
    if (rounded === width) {
      return;
    }
    width = rounded;
    draw.setSize(width, HEIGHT);
    render();
  }

  return { widget: draw, show, clear, setWidth };
}

/**
 * Replays `verbs` onto `path`, mapping SVG coords (top-left origin, y-down) into
 * `ui.Draw`'s path space (bottom-left origin, y-up): scale to fit, then place
 * relative to `originX` / `originY` -- the pixel position of the SVG's (0, 0)
 * corner -- adding along x and subtracting along y so the drawing stays upright.
 */
function feed(
  path: cavalry.Path,
  verbs: readonly PathVerb[],
  scale: number,
  originX: number,
  originY: number,
): void {
  const x = (value: number): number => originX + value * scale;
  const y = (value: number): number => originY - value * scale;

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
