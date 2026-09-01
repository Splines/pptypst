/**
 * The "Only Math" affordance: two large "$" plates that bracket the editor,
 * shown only while the toggle is on.
 *
 * It is a pure visual cue, mirroring the PowerPoint add-in's
 * `#mathDelimiterTop` / `#mathDelimiterBottom` bars: it tells the user that
 * PPTypst will wrap their source in `$ ... $` before compiling, so they type
 * the maths without the delimiters. Nothing here feeds the compiler -- that is
 * `core/typst-document.ts`, driven by the checkbox value.
 */

/** Plate fill and "$" ink, to sit on Cavalry's dark interface (matches `size-field.ts`). */
const PLATE_BG = "#2d2d2d";
const SIGN_INK = "#8a8a8a";
/** Corner rounding (outer corners only) and plate height, in pixels. */
const RADIUS = 3;
const HEIGHT = 20;
/** "$" size, in pixels; large enough to read as a delimiter, not a caption. */
const SIGN_FONT_PX = 15;

export interface MathDelimiters {
  /** Place directly above the editor. */
  readonly top: ui.Container;
  /** Place directly below the editor. */
  readonly bottom: ui.Container;
  /** Shows both plates when `active`, hides them otherwise. */
  setActive: (active: boolean) => void;
}

/** Builds one centred "$" plate; `corners` rounds only the edge away from the editor. */
function createPlate(corners: readonly [number, number, number, number]): ui.Container {
  const sign = new ui.Label("$");
  sign.setTextColor(SIGN_INK);
  sign.setFontSize(SIGN_FONT_PX);
  sign.setAlignment(1); // centre

  const row = new ui.HLayout();
  row.setMargins(0, 0, 0, 0);
  row.addStretch();
  row.add(sign);
  row.addStretch();

  const plate = new ui.Container();
  plate.setBackgroundColor(PLATE_BG);
  plate.setRadius(corners[0], corners[1], corners[2], corners[3]);
  plate.setFixedHeight(HEIGHT);
  plate.setLayout(row);
  return plate;
}

export function createMathDelimiters(): MathDelimiters {
  const top = createPlate([RADIUS, RADIUS, 0, 0]);
  const bottom = createPlate([0, 0, RADIUS, RADIUS]);

  return {
    top,
    bottom,
    setActive: (active: boolean) => {
      top.setHidden(!active);
      bottom.setHidden(!active);
    },
  };
}
