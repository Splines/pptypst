/**
 * The live preview swatch: a `ui.Draw` widget that paints the flattened Typst
 * SVG as `cavalry.Path`s, scaled to fit. No scene layers, no files -- it is
 * driven straight from an SVG string as the user types.
 *
 * All `ui.Draw` / `cavalry.Path` construction lives here; `panel.ts` places the
 * widget, forwards SVG to {@link Preview.show}, and calls {@link Preview.setWidth}
 * from `ui.onResize` so the swatch always spans the panel.
 */

import { buildPath } from "../cavalry/mesh.ts";
import { flattenTypstSvg } from "../core/svg-flatten.ts";
import { boundingBox, parsePathData, type BoundingBox } from "../core/svg-path.ts";

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

    // Ignore the page rect and anything else invisible in the source, then
    // parse each remaining path once (`feed` below reuses the parsed verbs).
    const visible = flat.paths
      .filter(({ style }) => !(style.fill === "none" && style.stroke === "none"))
      .map(({ d, style }) => ({ verbs: parsePathData(d), style }));
    if (visible.length === 0) {
      return;
    }

    // Fit the *ink*, not typst's auto-sized page box, into the padded strip:
    // the page's declared width/height doesn't always cover ink that renders
    // outside its nominal frame (e.g. a superscript), which the fixed-size
    // canvas below would otherwise clip. Sizing off the ink also keeps the
    // formula filling the strip the same way at any font size, instead of
    // drifting with the page's fixed-size margin.
    let box: BoundingBox | null = null;
    for (const { verbs } of visible) {
      const verbBox = boundingBox(verbs);
      if (!verbBox) continue;
      box = box
        ? {
            minX: Math.min(box.minX, verbBox.minX),
            minY: Math.min(box.minY, verbBox.minY),
            maxX: Math.max(box.maxX, verbBox.maxX),
            maxY: Math.max(box.maxY, verbBox.maxY),
          }
        : verbBox;
    }
    if (!box || box.maxX <= box.minX || box.maxY <= box.minY) {
      return;
    }

    // `ui.Draw`'s path space has its origin at the widget's bottom-left with
    // +x right and +y up. SVG is top-left origin and y-down, so the transform
    // negates y; its translation places the ink box's middle at the widget
    // centre.
    const boxWidth = box.maxX - box.minX;
    const boxHeight = box.maxY - box.minY;
    const scale = Math.min(
      (width - PADDING * 2) / boxWidth,
      (HEIGHT - PADDING * 2) / boxHeight,
    );
    const originX = width / 2 - ((box.minX + box.maxX) / 2) * scale;
    const originY = HEIGHT / 2 + ((box.minY + box.maxY) / 2) * scale;

    const transform = { scaleX: scale, scaleY: -scale, translateX: originX, translateY: originY };

    for (const { verbs, style } of visible) {
      const path = buildPath(verbs, transform);
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
