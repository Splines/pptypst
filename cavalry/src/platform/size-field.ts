/**
 * The "Size" control, styled after Cavalry's own Attribute Editor fields: one
 * dark rounded rectangle with a grey caption on the left and the adjustable
 * number beside it, so the label and the input read as a single widget.
 *
 * `ui.HLayout` has no background of its own, so the rectangle is a
 * `ui.Container` wrapping the caption + `NumericField`; the field's background
 * is set to match so it blends into the container instead of sitting in its
 * own inset box.
 */

/** Field background and grey caption ink, to sit on Cavalry's dark interface. */
const FIELD_BG = "#2d2d2d";
const CAPTION_INK = "#8a8a8a";
/** Corner rounding and row height, in pixels, to match native fields. */
const RADIUS = 3;
const HEIGHT = 22;

export interface SizeFieldOptions {
  /** Caption shown in grey on the left, e.g. "Size". */
  readonly label: string;
  /** Value shown before the app sets a resolution-scaled default. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** Called whenever the user changes the number. */
  readonly onChange: () => void;
}

export interface SizeField {
  /** The widget to hand to `ui.add` (or an enclosing layout). */
  readonly widget: ui.Container;
  getValue: () => number;
  setValue: (value: number) => void;
}

export function createSizeField(options: SizeFieldOptions): SizeField {
  const field = new ui.NumericField(options.value);
  field.setType(0); // integer
  field.setMin(options.min);
  field.setMax(options.max);
  field.setStep(1);
  field.setBackgroundColor(FIELD_BG);
  field.setMaximumWidth(38);
  field.onValueChanged = () => {
    options.onChange();
  };

  const caption = new ui.Label(options.label);
  caption.setTextColor(CAPTION_INK);

  const row = new ui.HLayout();
  row.setMargins(7, 0, 3, 0);
  row.setSpaceBetween(4);
  row.add(caption, field);

  const container = new ui.Container();
  container.setBackgroundColor(FIELD_BG);
  container.setRadius(RADIUS, RADIUS, RADIUS, RADIUS);
  container.setFixedHeight(HEIGHT);
  container.setMaximumWidth(86);
  container.setLayout(row);

  return {
    widget: container,
    getValue: () => field.getValue(),
    setValue: (value: number) => {
      field.setValue(value);
    },
  };
}
