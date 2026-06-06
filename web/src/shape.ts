import { SHAPE_CONFIG, FILL_COLOR_DISABLED } from "./constants.js";
import {
  getLegacyTypstSource,
  isLegacyTypstPayload,
  parseTypstSource,
  serializeTypstSource,
  TypstSource,
} from "./payload.js";
import { debug } from "./utils/logger.js";

export type TypstShapeId = {
  slideId: string | null;
  shapeId: string;
};

export let lastTypstShapeId: TypstShapeId | null;

/**
 * Updates the last Typst shape identifier.
 */
export function setLastTypstId(info: TypstShapeId | null) {
  lastTypstShapeId = info;
}

export type TypstShapeInfo = {
  source: TypstSource;
  fontSize: string;
  fillColor: string | null;
  mathMode: boolean;
  position?: { left: number; top: number };
  rotation?: number;
  size: { width: number; height: number };
};

/**
 * Writes shape properties and Typst metadata to a given shape.
 */
export async function writeShapeProperties(
  shape: PowerPoint.Shape,
  info: TypstShapeInfo,
  context: PowerPoint.RequestContext,
) {
  shape.altTextTitle = SHAPE_CONFIG.ALT_TEXT_TITLE;
  shape.altTextDescription = SHAPE_CONFIG.ALT_TEXT_DESCRIPTION;
  shape.name = SHAPE_CONFIG.NAME;
  shape.tags.add(SHAPE_CONFIG.TAGS.KIND, SHAPE_CONFIG.TAG_VALUES.KIND);
  shape.tags.add(SHAPE_CONFIG.TAGS.FONT_SIZE, info.fontSize);
  shape.tags.add(SHAPE_CONFIG.TAGS.FILL_COLOR,
    info.fillColor === null ? FILL_COLOR_DISABLED : info.fillColor);
  shape.tags.add(SHAPE_CONFIG.TAGS.MATH_MODE, info.mathMode.toString());

  // There can't be leftover XML parts here, as we always create
  // a new shape when updating
  const serializedSource = serializeTypstSource(info.source);
  shape.customXmlParts.add(serializedSource);

  if (info.size.height > 0 && info.size.width > 0) {
    shape.height = info.size.height;
    shape.width = info.size.width;
  }

  if (info.position) {
    shape.left = info.position.left;
    shape.top = info.position.top;
  }

  if (info.rotation) {
    shape.rotation = info.rotation;
  }

  await context.sync();
}

/**
 * Reads a tag value from a shape.
 */
export async function readShapeTag(
  shape: PowerPoint.Shape,
  tagName: string,
  context: PowerPoint.RequestContext,
): Promise<string | null> {
  try {
    const tag = shape.tags.getItemOrNullObject(tagName);
    tag.load("value");
    await context.sync();
    return tag.isNullObject ? null : tag.value;
  } catch (error) {
    debug(`Error reading tag ${tagName}:`, error);
    return null;
  }
}

/**
 * Checks whether a loaded shape belongs to PPTypst.
 */
export function isLoadedTypstShape(shape: PowerPoint.Shape): boolean {
  const hasMarkerTag = shape.tags.items.some(tag =>
    tag.key.toLowerCase() === SHAPE_CONFIG.TAGS.KIND.toLowerCase()
    && tag.value === SHAPE_CONFIG.TAG_VALUES.KIND,
  );

  return hasMarkerTag || isLegacyTypstPayload(shape.altTextDescription);
}

/**
 * Reads stored Typst source from a shape.
 */
export async function readTypstSource(
  shape: PowerPoint.Shape,
  context: PowerPoint.RequestContext,
): Promise<TypstSource | null> {
  try {
    const xmlParts = shape.customXmlParts.getByNamespace(SHAPE_CONFIG.CUSTOM_XML.NAMESPACE);
    xmlParts.load("items/id");
    await context.sync();

    if (xmlParts.items.length > 0) {
      const latestPart = xmlParts.items[xmlParts.items.length - 1];
      const xmlResult = latestPart.getXml();
      await context.sync();
      return parseTypstSource(xmlResult.value);
    }
  } catch (error) {
    debug("Error reading Typst custom XML part:", error);
  }

  if (isLegacyTypstPayload(shape.altTextDescription)) {
    return getLegacyTypstSource(shape.altTextDescription);
  }

  return null;
}
