/**
 * The "Color" control: a grey caption next to a `ui.ColorChip`, wrapped in the
 * same dark rounded pill as `size-field.ts` so the Size and Color inputs read
 * as a matched pair. Double-clicking the chip opens Cavalry's Color Editor.
 */

/** Pill background and grey caption ink, matching `size-field.ts`. */
const FIELD_BG = "#2d2d2d";
const CAPTION_INK = "#8a8a8a";
/** Corner rounding and pill size, in pixels, to match the Size field. */
const RADIUS = 3;
const HEIGHT = 22;
const WIDTH = 94;
/** Caption column width; the swatch sits to its right at a fixed gap. */
const CAPTION_WIDTH = 42;
/** Swatch size, in pixels; sits inside the pill with a little breathing room. */
const CHIP_WIDTH = 26;
const CHIP_HEIGHT = 14;

export interface ColorFieldOptions {
  /** Caption shown in grey on the left, e.g. "Color". */
  readonly label: string;
  /** Swatch colour before the app seeds a real default, as "#rrggbb". */
  readonly value: string;
  /** Called whenever the user picks a different colour. */
  readonly onChange: () => void;
}

export interface ColorField {
  /** The widget to hand to `ui.add` (or an enclosing layout). */
  readonly widget: ui.Container;
  /** Current swatch colour as a hex string. */
  getValue: () => string;
  /** Sets the swatch colour; does not fire {@link ColorFieldOptions.onChange}. */
  setValue: (hex: string) => void;
}

export function createColorField(options: ColorFieldOptions): ColorField {
  const chip = new ui.ColorChip();
  chip.setColor(options.value);
  chip.setSize(CHIP_WIDTH, CHIP_HEIGHT);
  chip.setAcceptsDrops(true);
  chip.onValueChanged = () => {
    options.onChange();
  };

  const caption = new ui.Label(options.label);
  caption.setTextColor(CAPTION_INK);
  caption.setFixedWidth(CAPTION_WIDTH);

  const row = new ui.HLayout();
  row.setMargins(7, 0, 6, 0);
  row.setSpaceBetween(6);
  row.add(caption, chip);
  row.addStretch();

  const container = new ui.Container();
  container.setBackgroundColor(FIELD_BG);
  container.setRadius(RADIUS, RADIUS, RADIUS, RADIUS);
  container.setFixedHeight(HEIGHT);
  container.setFixedWidth(WIDTH);
  container.setLayout(row);
  container.setToolTip("Fill colour for the formula — double-click the swatch for the Color Editor");

  return {
    widget: container,
    getValue: () => chip.getColor(),
    setValue: (hex: string) => {
      chip.setColor(hex);
    },
  };
}
