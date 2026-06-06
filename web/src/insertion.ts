import { debug } from "./utils/logger.js";
import { applyFillColor, normalizeAlphaHexColors, parseAndApplySize } from "./svg.js";
import { typst } from "./typst.js";
import {
  setStatus,
  getFontSize,
  getFillColor,
  getMathModeEnabled,
  getTypstCode,
  getPreambleCode,
  getEditorMode,
} from "./ui.js";
import { TypstSource } from "./payload.js";
import { storeValue } from "./utils/storage.js";
import {
  lastTypstShapeId,
  TypstShapeInfo,
  writeShapeProperties,
  readShapeTag,
  readTypstSource,
  isLoadedTypstShape,
} from "./shape.js";
import { STORAGE_KEYS, SHAPE_CONFIG, FILL_COLOR_DISABLED } from "./constants.js";

type PreparedSvgResult = {
  svg: string;
  size: { width: number; height: number };
};

type SlideSize = {
  width: number;
  height: number;
};

/**
 * Compiles Typst code to SVG and prepares it for insertion.
 */
async function prepareTypstSvg(
  source: TypstSource,
  fontSize: string,
  fillColor: string | null,
  mathMode: boolean,
): Promise<PreparedSvgResult | null> {
  const result = await typst(source, fontSize, mathMode);
  if (!result.svg) {
    // diagnostics are only shown for preview, not insertion
    return null;
  }

  const { svgElement, size } = parseAndApplySize(result.svg);
  if (fillColor) {
    applyFillColor(svgElement, fillColor);
  }
  normalizeAlphaHexColors(svgElement);

  const serializer = new XMLSerializer();
  const svg = serializer.serializeToString(svgElement);

  return { svg, size };
}

/**
 * Inserts SVG into PowerPoint and tags it with Typst metadata.
 *
 * @returns the newly inserted shape or null if insertion fails.
 */
async function insertSvgAndTag(
  svg: string,
  info: TypstShapeInfo,
  targetSlideId: string,
  existingShapeIds: Set<string>,
): Promise<PowerPoint.Shape | null> {
  return new Promise<PowerPoint.Shape | null>((resolve) => {
    Office.context.document.setSelectedDataAsync(svg, { coercionType: Office.CoercionType.XmlSvg }, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        console.error("Insert failed:", result.error);
        resolve(null);
        return;
      }

      void PowerPoint.run(async (context) => {
        const shapeToTag = await findInsertedShape(targetSlideId, existingShapeIds, context);

        if (!shapeToTag) {
          console.warn("No shape found after insertion; cannot tag Typst payload.");
          resolve(null);
          return;
        }

        await writeShapeProperties(shapeToTag, info, context);
        resolve(shapeToTag);
      });
    });
  });
}

/**
 * Inserts or updates a Typst formula in PowerPoint.
 */
export async function insertOrUpdateFormula() {
  if (getEditorMode() === "multi-select") {
    setStatus(
      "Select a single Typst shape to update it, or clear the selection to insert a new one.", true);
    return;
  }

  const source: TypstSource = {
    body: getTypstCode(),
    preamble: getPreambleCode(),
  };
  const fontSize = getFontSize();
  const fillColor = getFillColor();
  const mathMode = getMathModeEnabled();
  storeValue(STORAGE_KEYS.FONT_SIZE, fontSize);
  storeValue(STORAGE_KEYS.FILL_COLOR, fillColor);
  if (getEditorMode() === "insert") {
    // overwrite global preamble only when inserting a new shape, not when
    // editing an existing shape
    storeValue(STORAGE_KEYS.PREAMBLE, source.preamble);
  }

  const prepared = await prepareTypstSvg(source, fontSize, fillColor, mathMode);
  if (!prepared) {
    setStatus("Typst compile failed.", true);
    return;
  }

  try {
    await PowerPoint.run(async (context) => {
      const selectedSlides = context.presentation.getSelectedSlides();
      const allSlides = context.presentation.slides;
      const pageSetup = context.presentation.pageSetup;

      selectedSlides.load("items");
      allSlides.load("items");
      pageSetup.load(["slideWidth", "slideHeight"]);
      await context.sync();

      const slideSize: SlideSize = {
        width: pageSetup.slideWidth,
        height: pageSetup.slideHeight,
      };

      const fittedSize = fitSizeWithinSlide(prepared.size, slideSize);

      const targetSlide: PowerPoint.Slide | undefined = selectedSlides.items[0] || allSlides.items[0];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!targetSlide || targetSlide.isNullObject) {
        setStatus("No slide available to insert SVG.", true);
        return;
      }
      targetSlide.load(["id", "shapes/items/id"]);
      await context.sync();

      let position: { left: number; top: number } | undefined;
      let rotation: number | undefined;
      let isReplacing = false;

      const typstShape = await findTypstShape(allSlides.items, context);
      if (typstShape) {
        position = calculateCenteredPosition(typstShape, fittedSize);
        position = clampPositionWithinSlide(position, fittedSize, slideSize);
        rotation = typstShape.rotation;
        typstShape.delete();
        isReplacing = true;
        await context.sync();
      } else {
        position = calcShapeTopLeftToBeCentered(fittedSize, slideSize);
      }

      const existingShapeIds = new Set(targetSlide.shapes.items.map(shape => shape.id));
      const insertedShape = await insertSvgAndTag(prepared.svg, {
        source,
        fontSize,
        fillColor: fillColor || null,
        mathMode,
        position,
        size: fittedSize,
        rotation,
      }, targetSlide.id, existingShapeIds);

      if (!insertedShape) {
        setStatus("Failed to insert SVG into the slide.", true);
        return;
      }

      setStatus(isReplacing ? "Updated Typst SVG." : "Inserted Typst SVG.");
    });
  } catch (error) {
    console.error("PowerPoint context error:", error);
    setStatus("PowerPoint API error. See console.", true);
  }
}

/**
 * Finds a Typst shape in the current selection or uses cached selection.
 */
async function findTypstShape(allSlides: PowerPoint.Slide[],
  context: PowerPoint.RequestContext): Promise<PowerPoint.Shape | undefined> {
  if (!lastTypstShapeId) return undefined;
  const id = lastTypstShapeId;

  try {
    const targetSlide = allSlides.find(slide => slide.id === id.slideId) || allSlides[0];
    if (targetSlide.isNullObject) return undefined;

    targetSlide.shapes.load("items");
    await context.sync();
    if (targetSlide.shapes.items.length === 0) return undefined;

    const cachedShape = targetSlide.shapes.items.find(shape => shape.id === id.shapeId);
    if (!cachedShape) {
      return undefined;
    }

    cachedShape.load(["id", "altTextDescription", "left", "top", "width", "height", "rotation"]);
    cachedShape.tags.load("items/key,items/value");
    await context.sync();
    return cachedShape;
  } catch (error) {
    debug("Fallback to last selection failed:", error);
    return undefined;
  }
}

/**
 * Finds the newly inserted shape on a slide.
 *
 * @param slideId Target slide ID
 * @param existingShapeIds IDs of shapes before insertion
 * @param context PowerPoint context
 * @returns The new shape or null
 */
async function findInsertedShape(slideId: string, existingShapeIds: Set<string>,
  context: PowerPoint.RequestContext): Promise<PowerPoint.Shape | null> {
  try {
    const slide = context.presentation.slides.getItem(slideId);
    slide.shapes.load("items/id");
    await context.sync();

    const newShapes = slide.shapes.items.filter(shape => !existingShapeIds.has(shape.id));
    if (newShapes.length > 0) {
      return newShapes[newShapes.length - 1];
    }

    if (slide.shapes.items.length > 0) {
      return slide.shapes.items[slide.shapes.items.length - 1];
    }
  } catch (error) {
    debug("Shape diff fallback failed", error);
  }

  const postShapes = context.presentation.getSelectedShapes();
  postShapes.load("items");
  await context.sync();

  return postShapes.items.length > 0 ? postShapes.items[postShapes.items.length - 1] : null;
}

/**
 * Updates font size for all selected Typst shapes.
 */
export async function bulkUpdateFontSize() {
  const newFontSize = getFontSize();
  storeValue(STORAGE_KEYS.FONT_SIZE, newFontSize);

  try {
    await PowerPoint.run(async (context) => {
      const selection = context.presentation.getSelectedShapes();
      selection.load("items");
      await context.sync();

      if (selection.items.length > 0) {
        selection.items.forEach((shape) => {
          shape.load(["id", "altTextDescription", "left", "top", "width", "height", "rotation"]);
          shape.tags.load("items/key,items/value");
        });
        await context.sync();
      }

      const typstShapes = selection.items.filter(isLoadedTypstShape);

      if (typstShapes.length === 0) {
        setStatus("No Typst shapes selected.", true);
        return;
      }

      const pageSetup = context.presentation.pageSetup;
      pageSetup.load(["slideWidth", "slideHeight"]);
      await context.sync();
      const slideSize: SlideSize = {
        width: pageSetup.slideWidth,
        height: pageSetup.slideHeight,
      };

      let successCount = 0;

      for (const shape of typstShapes) {
        try {
          const source = await readTypstSource(shape, context);
          if (!source) {
            debug(`No Typst source stored for shape ${shape.id}`);
            continue;
          }

          const storedFillColor = await readShapeTag(shape, SHAPE_CONFIG.TAGS.FILL_COLOR, context);

          const fillColor = !storedFillColor || storedFillColor === FILL_COLOR_DISABLED
            ? null
            : storedFillColor;

          const mathMode = getMathModeEnabled();
          const prepared = await prepareTypstSvg(source, newFontSize, fillColor, mathMode);
          if (!prepared) {
            debug(`Typst compile failed for shape ${shape.id}`);
            continue;
          }

          const fittedSize = fitSizeWithinSlide(prepared.size, slideSize);
          let position = calculateCenteredPosition(shape, fittedSize);
          position = clampPositionWithinSlide(
            position,
            fittedSize,
            slideSize,
          );
          const rotation = shape.rotation;

          // Capture slide and existing shapes before deletion
          const parentSlide = shape.getParentSlide();
          parentSlide.load("id");
          parentSlide.shapes.load("items/id");
          await context.sync();
          const existingShapeIds = new Set(parentSlide.shapes.items.map((s: PowerPoint.Shape) => s.id));
          const slideId = parentSlide.id;

          shape.delete();
          await context.sync();

          const insertedShape = await insertSvgAndTag(prepared.svg, {
            source,
            fontSize: newFontSize,
            fillColor,
            mathMode,
            position,
            size: fittedSize,
            rotation,
          }, slideId, existingShapeIds);

          if (insertedShape) {
            successCount++;
          }
        } catch (error) {
          debug(`Error updating shape ${shape.id}:`, error);
        }
      }

      setStatus(`Updated ${successCount.toString()} of ${typstShapes.length.toString()} Typst shapes with font size ${newFontSize}.`);
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    setStatus("Error updating Typst shapes. See console.", true);
  }
}

/**
 * Calculates the position to center a new shape on an old shape's center point.
 */
function calculateCenteredPosition(
  oldShape: { left: number; top: number; width: number; height: number },
  newSize: { width: number; height: number },
): { left: number; top: number } {
  const centerX = oldShape.left + oldShape.width / 2;
  const centerY = oldShape.top + oldShape.height / 2;
  return {
    left: centerX - newSize.width / 2,
    top: centerY - newSize.height / 2,
  };
}

/**
 * Scales a shape to fit the slide while preserving aspect ratio.
 *
 * The scale factor is computed as:
 * s = min(slideWidth / shapeWidth, slideHeight / shapeHeight, 1)
 */
function fitSizeWithinSlide(
  shapeSize: { width: number; height: number },
  slideSize: SlideSize,
): { width: number; height: number } {
  if (shapeSize.width <= 0 || shapeSize.height <= 0) {
    return shapeSize;
  }

  const widthScale = slideSize.width / shapeSize.width;
  const heightScale = slideSize.height / shapeSize.height;
  const scale = Math.min(widthScale, heightScale, 1);

  return {
    width: shapeSize.width * scale,
    height: shapeSize.height * scale,
  };
}

/**
 * Clamps a position so the full shape remains inside the slide.
 *
 * The placement is clamped to:
 * - left: [0, slideWidth - shapeWidth]
 * - top: [0, slideHeight - shapeHeight]
 */
function clampPositionWithinSlide(
  position: { left: number; top: number },
  shapeSize: { width: number; height: number },
  slideSize: SlideSize,
): { left: number; top: number } {
  const maxLeft = Math.max(0, slideSize.width - shapeSize.width);
  const maxTop = Math.max(0, slideSize.height - shapeSize.height);

  return {
    left: Math.min(Math.max(0, position.left), maxLeft),
    top: Math.min(Math.max(0, position.top), maxTop),
  };
}

/**
 * Calculates the top-left position for a shape to be centered on the slide.
 */
function calcShapeTopLeftToBeCentered(
  shapeSize: { width: number; height: number },
  slideSize: SlideSize,
) {
  const centerX = (slideSize.width - shapeSize.width) / 2;
  const centerY = (slideSize.height - shapeSize.height) / 2;

  return clampPositionWithinSlide({ left: centerX, top: centerY }, shapeSize, slideSize);
}
