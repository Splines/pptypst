import { SVG_CONFIG } from "./constants.js";

/**
 * Parses SVG string and extracts dimensions, ensuring content isn't clipped.
 *
 * @param svg SVG content as string
 * @returns SVG element and computed size
 */
export function parseAndApplySize(svg: string):
{ svgElement: SVGElement; size: { width: number; height: number } } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const svgElement = doc.documentElement as unknown as SVGGraphicsElement;

  // Temporarily insert into DOM to measure actual content bounds
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "absolute";
  tempContainer.style.visibility = "hidden";
  tempContainer.style.pointerEvents = "none";
  document.body.appendChild(tempContainer);
  tempContainer.appendChild(svgElement);

  let bbox;
  try {
    bbox = svgElement.getBBox();
  } catch {
    document.body.removeChild(tempContainer);
    return {
      svgElement,
      size: {
        width: parseFloat(svgElement.getAttribute("width") || String(SVG_CONFIG.FALLBACK_WIDTH)),
        height: parseFloat(svgElement.getAttribute("height") || String(SVG_CONFIG.FALLBACK_HEIGHT)),
      },
    };
  }

  document.body.removeChild(tempContainer);

  // Add some minor padding to avoid clipping
  const padding = Math.max(bbox.width, bbox.height) * SVG_CONFIG.PADDING_RATIO;
  const x = bbox.x - padding;
  const y = bbox.y - padding;
  const width = bbox.width + 2 * padding;
  const height = bbox.height + 2 * padding;

  // Set viewBox to actual content bounds with padding
  svgElement.setAttribute("viewBox", `${x.toString()} ${y.toString()} ${width.toString()} ${height.toString()}`);
  svgElement.setAttribute("width", width.toString());
  svgElement.setAttribute("height", height.toString());

  return { svgElement, size: { width, height } };
}

/**
 * Applies fill color to all elements in an SVG element.
 */
export function applyFillColor(svg: SVGElement, fillColor: string) {
  const elements = svg.querySelectorAll("*");
  elements.forEach((el) => {
    const fill = el.getAttribute("fill");
    if (fill && fill.toLowerCase() !== "none") {
      el.setAttribute("fill", fillColor);
    }
    const stroke = el.getAttribute("stroke");
    if (stroke && stroke.toLowerCase() !== "none") {
      el.setAttribute("stroke", fillColor);
    }
  });
}

/**
 * Serializes the displayed preview SVG for clipboard use.
 */
export function serializeSvgForClipboard(svg: SVGElement, invertColors = false): string {
  const clipboardSvg = svg.cloneNode(true) as SVGElement;
  removePreviewLayoutStyles(clipboardSvg);

  if (invertColors) {
    invertSvgColors(clipboardSvg);
  }

  return new XMLSerializer().serializeToString(clipboardSvg);
}

function removePreviewLayoutStyles(svg: SVGElement) {
  const inlineStyle = svg.getAttribute("style");
  if (!inlineStyle) {
    return;
  }

  const style = document.createElement("span").style;
  style.cssText = inlineStyle;
  style.removeProperty("width");
  style.removeProperty("height");
  style.removeProperty("max-height");

  if (style.cssText) {
    svg.setAttribute("style", style.cssText);
  } else {
    svg.removeAttribute("style");
  }
}

function invertSvgColors(svg: SVGElement) {
  const colorAttributes = [
    "color",
    "fill",
    "stroke",
    "stop-color",
    "flood-color",
    "lighting-color",
  ];
  const colorProperties = [
    "color",
    "fill",
    "stroke",
    "stop-color",
    "flood-color",
    "lighting-color",
  ];
  const elements: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];

  elements.forEach((el) => {
    colorAttributes.forEach((attribute) => {
      const color = el.getAttribute(attribute);
      const invertedColor = color ? invertCssColor(color) : null;
      if (invertedColor) {
        el.setAttribute(attribute, invertedColor);
      }
    });

    const inlineStyle = el.getAttribute("style");
    if (!inlineStyle) {
      return;
    }

    const style = document.createElement("span").style;
    style.cssText = inlineStyle;
    colorProperties.forEach((property) => {
      const color = style.getPropertyValue(property);
      const invertedColor = color ? invertCssColor(color) : null;
      if (invertedColor) {
        style.setProperty(property, invertedColor, style.getPropertyPriority(property));
      }
    });
    el.setAttribute("style", style.cssText);
  });
}

function invertCssColor(color: string): string | null {
  const value = color.trim();
  const normalizedValue = value.toLowerCase();
  if (!value || normalizedValue === "none" || normalizedValue.startsWith("url(")) {
    return null;
  }

  const parserElement = document.createElement("span");
  parserElement.style.color = value;
  if (!parserElement.style.color) {
    return null;
  }

  document.body.appendChild(parserElement);
  const computedColor = window.getComputedStyle(parserElement).color;
  document.body.removeChild(parserElement);

  const parsed = computedColor.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?|\d+(?:\.\d+)?%))?\s*\)$/,
  );
  if (!parsed) {
    return null;
  }

  const red = 255 - clampColorComponent(Number(parsed[1]));
  const green = 255 - clampColorComponent(Number(parsed[2]));
  const blue = 255 - clampColorComponent(Number(parsed[3]));
  const alpha = parseAlpha(parsed[4]);

  if (alpha === null || alpha >= 1) {
    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  }

  return `rgba(${red.toString()}, ${green.toString()}, ${blue.toString()}, ${alpha.toString()})`;
}

function clampColorComponent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseAlpha(alpha: string | undefined): number | null {
  if (!alpha) {
    return null;
  }

  if (alpha.endsWith("%")) {
    return Math.max(0, Math.min(1, Number(alpha.slice(0, -1)) / 100));
  }

  const parsedAlpha = Number(alpha);
  if (!Number.isFinite(parsedAlpha)) {
    return null;
  }
  return Math.max(0, Math.min(1, parsedAlpha));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

type ParsedHexAlpha = {
  rgbHex: string;
  alpha: number;
};

/**
 * Parses #RGBA or #RRGGBBAA colors into RGB + alpha.
 */
function parseHexWithAlpha(value: string): ParsedHexAlpha | null {
  const color = value.trim();
  if (!color.startsWith("#")) {
    return null;
  }

  const hex = color.slice(1);
  if (hex.length === 8) {
    const rgbHex = `#${hex.slice(0, 6)}`;
    const alphaByte = parseInt(hex.slice(6, 8), 16);
    if (!Number.isFinite(alphaByte)) {
      return null;
    }
    const alpha = alphaByte / 255;
    return { rgbHex, alpha };
  }

  if (hex.length === 4) {
    const rgbHex = `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    const alphaByte = parseInt(`${hex[3]}${hex[3]}`, 16);
    if (!Number.isFinite(alphaByte)) {
      return null;
    }
    const alpha = alphaByte / 255;
    return { rgbHex, alpha };
  }

  return null;
}

/**
 * Converts alpha hex colors to RGB + explicit opacity attributes.
 *
 * PowerPoint's SVG import can fail on #RRGGBBAA colors, so we normalize
 * these to maximize compatibility when inserting shapes.
 */
export function normalizeAlphaHexColors(svg: SVGElement) {
  const colorToOpacityAttr: Record<string, string> = {
    "fill": "fill-opacity",
    "stroke": "stroke-opacity",
    "stop-color": "stop-opacity",
  };

  const elements: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];
  elements.forEach((el) => {
    Object.entries(colorToOpacityAttr).forEach(([colorAttr, opacityAttr]) => {
      const value = el.getAttribute(colorAttr);
      if (!value) {
        return;
      }

      const parsed = parseHexWithAlpha(value);
      if (!parsed) {
        return;
      }

      el.setAttribute(colorAttr, parsed.rgbHex);

      const existingOpacity = parseFloat(el.getAttribute(opacityAttr) || "1");
      const safeOpacity = Number.isFinite(existingOpacity) ? existingOpacity : 1;
      const combinedOpacity = Math.max(0, Math.min(1, safeOpacity * parsed.alpha));
      el.setAttribute(opacityAttr, combinedOpacity.toString());
    });
  });
}
