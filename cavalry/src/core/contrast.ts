/**
 * Picking an ink color that reads against a given background.
 *
 * Used for the fill color's default: PPTypst seeds a fresh formula with white
 * on a dark composition and black on a light one, the same call the PowerPoint
 * add-in makes against the slide background.
 */

/** Matches "#rgb", "#rgba", "#rrggbb" and "#rrggbbaa" (case-insensitive). */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Whether `value` is a hex color string this module can read. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/**
 * The RGB channels of `hex` as 0..255 integers, alpha ignored, or `null` when
 * `hex` isn't a recognised hex color. "#rgb" / "#rgba" shorthand is expanded.
 */
export function parseHexRgb(hex: string): [number, number, number] | null {
  if (!isHexColor(hex)) {
    return null;
  }
  let body = hex.slice(1);
  if (body.length === 3 || body.length === 4) {
    body = body.split("").map(ch => ch + ch).join("");
  }
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Perceived brightness of `hex` on a 0..1 scale (Rec. 601 luma), or `null` for
 * an unreadable color.
 */
export function perceivedBrightness(hex: string): number | null {
  const rgb = parseHexRgb(hex);
  if (!rgb) {
    return null;
  }
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Whether white ink reads better than black on `bgHex`. An unknown or missing
 * color counts as dark -- Cavalry's default scene and interface are dark, so
 * white is the safer guess.
 */
export function isDarkBackground(bgHex: string | null): boolean {
  if (bgHex === null) {
    return true;
  }
  const brightness = perceivedBrightness(bgHex);
  return brightness === null ? true : brightness < 0.5;
}

/** `"#ffffff"` on a dark background, `"#000000"` on a light one. */
export function contrastInk(bgHex: string | null): string {
  return isDarkBackground(bgHex) ? "#ffffff" : "#000000";
}
