/**
 * A slim grab bar that resizes the widget above it, the way a browser
 * `<textarea>` corner grip does.
 *
 * Cavalry's UI toolkit has no splitter, so this is a short `ui.Draw` strip that
 * paints a grip and turns vertical mouse drags into `setFixedHeight` calls on a
 * target widget. Pinning the target to a fixed height also stops it from
 * growing with the window -- a plain minimum height would let the layout
 * stretch it.
 */

/** The strip's own height, in pixels. */
const GRIP_HEIGHT = 12;
/** Half-width of the painted grip lines, in pixels. */
const GRIP_HALF_WIDTH = 16;
/** Strip backdrop and grip ink, to sit on Cavalry's dark interface. */
const TRACK = "#1e1e1e";
const INK = "#6a6a6a";

export interface ResizeGripOptions {
  /** Height applied to the target before the first drag, in pixels. */
  readonly defaultHeight: number;
  /** A drag cannot shrink the target below this, in pixels. */
  readonly minHeight: number;
  /** A drag cannot grow the target beyond this, in pixels. */
  readonly maxHeight: number;
  /** Called with the new height after each drag step (e.g. to repaint). */
  readonly onResize?: (height: number) => void;
}

/** The subset of `ui.Widget` the grip drives. */
export interface ResizableTarget {
  setFixedHeight: (height: number) => void;
}

export interface ResizeGrip {
  /** The widget to hand to `ui.add`, placed directly below the target. */
  readonly widget: ui.Draw;
  /** Stretches the strip to `width` px so the grip stays centred. */
  setWidth: (width: number) => void;
  /** The target's current height, in pixels. */
  height: () => number;
}

export function createResizeGrip(target: ResizableTarget, options: ResizeGripOptions): ResizeGrip {
  const { defaultHeight, minHeight, maxHeight, onResize } = options;

  const draw = new ui.Draw();
  let width = 320;
  let height = defaultHeight;

  // A drag is anchored in screen coordinates. `ui.Draw` reports `pos.y` y-up
  // from the strip's bottom edge, while `geometry().y` is y-down from the top
  // of the screen; `pointerScreenY` folds them into one y-down frame that a
  // stationary pointer keeps constant even as the strip slides down when the
  // target grows. Comparing the raw y-up `pos.y` between events instead would
  // feed the resize back on itself (and invert the drag direction).
  let dragging = false;
  let dragAnchorScreenY = 0;
  let dragStartHeight = 0;

  /** Pointer position in a top-down screen frame, from a y-up local `pos.y`. */
  function pointerScreenY(localY: number): number {
    return draw.geometry().y + (GRIP_HEIGHT - localY);
  }

  draw.setSize(width, GRIP_HEIGHT);
  draw.setBackgroundColor(TRACK);
  draw.setToolTip("Drag to resize the editor");
  target.setFixedHeight(height);

  function paint(): void {
    draw.clearPaths();
    const midX = width / 2;
    const midY = GRIP_HEIGHT / 2;
    for (const offset of [-3, 0, 3]) {
      const line = new cavalry.Path();
      line.moveTo(midX - GRIP_HALF_WIDTH, midY + offset);
      line.lineTo(midX + GRIP_HALF_WIDTH, midY + offset);
      draw.addPath(line.toObject(), { color: INK, stroke: true, strokeWidth: 1 });
    }
    draw.redraw();
  }

  function resizeTo(next: number): void {
    const clamped = Math.max(minHeight, Math.min(maxHeight, Math.round(next)));
    if (clamped === height) {
      return;
    }
    height = clamped;
    target.setFixedHeight(height);
    onResize?.(height);
  }

  draw.onMousePress = (pos) => {
    dragging = true;
    dragAnchorScreenY = pointerScreenY(pos.y);
    dragStartHeight = height;
  };
  draw.onMouseMove = (pos) => {
    if (!dragging) {
      return;
    }
    // Drag down (screen Y grows) => taller editor.
    resizeTo(dragStartHeight + (pointerScreenY(pos.y) - dragAnchorScreenY));
  };
  draw.onMouseRelease = () => {
    dragging = false;
  };

  paint();

  return {
    widget: draw,
    setWidth: (next: number) => {
      const rounded = Math.max(1, Math.round(next));
      if (rounded === width) {
        return;
      }
      width = rounded;
      draw.setSize(width, GRIP_HEIGHT);
      paint();
    },
    height: () => height,
  };
}
