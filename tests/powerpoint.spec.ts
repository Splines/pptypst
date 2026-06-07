import { expect } from "@playwright/test";
import { test } from "./_support/fixtures";
import {
  type ShapeSnapshot,
  type TypstShapeSeed,
  typstShapeMetadata,
  typstShapeTags,
} from "./pages/powerpoint-page";

const slideId = "slide-1";

function typstShape(seed: TypstShapeSeed): TypstShapeSeed {
  const { tags, typstSource, ...rest } = seed;
  return {
    ...rest,
    altTextTitle: typstShapeMetadata.altTextTitle,
    altTextDescription: typstShapeMetadata.altTextDescription,
    name: typstShapeMetadata.name,
    tags: {
      [typstShapeTags.kind]: "typst",
      [typstShapeTags.fontSize]: "28",
      [typstShapeTags.fillColor]: "#000000",
      [typstShapeTags.mathMode]: "true",
      ...tags,
    },
    typstSource: {
      preamble: "",
      body: "x",
      ...typstSource,
    },
  };
}

function expectTypstShape(shape: ShapeSnapshot, expected: {
  body: string;
  preamble: string;
  fontSize: string;
  fillColor: string;
}) {
  expect(shape.name).toBe(typstShapeMetadata.name);
  expect(shape.altTextTitle).toBe(typstShapeMetadata.altTextTitle);
  expect(shape.altTextDescription).toBe(typstShapeMetadata.altTextDescription);
  expect(shape.tags[typstShapeTags.kind]).toBe("typst");
  expect(shape.tags[typstShapeTags.fontSize]).toBe(expected.fontSize);
  expect(shape.tags[typstShapeTags.fillColor]).toBe(expected.fillColor);
  expect(shape.customXml).toHaveLength(1);
  if (expected.preamble) {
    expect(shape.customXml[0]).toContain(`<pptypst:preamble>${expected.preamble}</pptypst:preamble>`);
  } else {
    expect(shape.customXml[0]).toMatch(/<pptypst:preamble\s*\/>|<pptypst:preamble><\/pptypst:preamble>/);
  }
  expect(shape.customXml[0]).toContain(`<pptypst:body>${expected.body}</pptypst:body>`);
}

test("inserts a Typst shape into the selected PowerPoint slide", async ({ powerPointPage }) => {
  await powerPointPage.gotoWithOffice({ slides: [{ id: slideId }] });

  await powerPointPage.previewExpression("integral_a^b f(x) dif x");
  await powerPointPage.insertOrUpdate();

  await powerPointPage.expectStatus("Inserted Typst SVG.");
  const snapshot = await powerPointPage.snapshot();
  const insertedShape = snapshot.slides[0].shapes[0];

  expect(snapshot.insertedSvgCalls).toHaveLength(1);
  expect(snapshot.selectedShapeIds).toEqual([insertedShape.id]);
  expectTypstShape(insertedShape, {
    body: "integral_a^b f(x) dif x",
    preamble: "",
    fontSize: "28",
    fillColor: "#000000",
  });
});

test("updates the selected Typst shape in place semantically", async ({ powerPointPage }) => {
  await powerPointPage.gotoWithOffice({
    slides: [{
      id: slideId,
      shapes: [typstShape({
        id: "old-shape",
        left: 120,
        top: 80,
        width: 240,
        height: 60,
        rotation: 15,
        tags: {
          [typstShapeTags.fontSize]: "20",
          [typstShapeTags.fillColor]: "#336699",
        },
        typstSource: { preamble: "#let old = 1", body: "old_body" },
      })],
    }],
    selectedSlideIds: [slideId],
    selectedShapeIds: ["old-shape"],
  });

  await powerPointPage.expectUpdateMode();
  await powerPointPage.expectTypstCode("old_body");
  await powerPointPage.expectPreamble("#let old = 1");
  await powerPointPage.expectFontSize("20");
  await powerPointPage.expectFillColor("#336699");

  await powerPointPage.previewExpression("new_body");
  await powerPointPage.setPreamble("#let local = 2");
  await powerPointPage.setFontSize("36");
  await powerPointPage.setFillColor("#cc5500");
  await powerPointPage.insertOrUpdate();

  await powerPointPage.expectStatus("Updated Typst SVG.");
  const snapshot = await powerPointPage.snapshot();
  const updatedShape = snapshot.slides[0].shapes[0];

  expect(snapshot.slides[0].shapes).toHaveLength(1);
  expect(updatedShape.id).not.toBe("old-shape");
  expect(updatedShape.rotation).toBe(15);
  expectTypstShape(updatedShape, {
    body: "new_body",
    preamble: "#let local = 2",
    fontSize: "36",
    fillColor: "#cc5500",
  });
});

test("bulk-updates the font size of multiple selected Typst shapes", async ({ powerPointPage }) => {
  await powerPointPage.gotoWithOffice({
    slides: [{
      id: slideId,
      shapes: [
        typstShape({
          id: "shape-a",
          tags: { [typstShapeTags.fontSize]: "18", [typstShapeTags.fillColor]: "#112233" },
          typstSource: { preamble: "#let a = 1", body: "a" },
        }),
        typstShape({
          id: "shape-b",
          tags: { [typstShapeTags.fontSize]: "24", [typstShapeTags.fillColor]: "disabled" },
          typstSource: { preamble: "#let b = 2", body: "b" },
        }),
      ],
    }],
    selectedSlideIds: [slideId],
    selectedShapeIds: ["shape-a", "shape-b"],
  });

  await powerPointPage.expectBulkUpdateVisible();
  await powerPointPage.setFontSize("42");
  await powerPointPage.bulkUpdateFontSize();

  await powerPointPage.expectStatus("Updated 2 of 2 Typst shapes with font size 42.");
  const snapshot = await powerPointPage.snapshot();
  const shapes = snapshot.slides[0].shapes;

  expect(shapes).toHaveLength(2);
  expect(shapes.map(shape => shape.id)).not.toContain("shape-a");
  expect(shapes.map(shape => shape.id)).not.toContain("shape-b");
  expectTypstShape(shapes[0], {
    body: "a",
    preamble: "#let a = 1",
    fontSize: "42",
    fillColor: "#112233",
  });
  expectTypstShape(shapes[1], {
    body: "b",
    preamble: "#let b = 2",
    fontSize: "42",
    fillColor: "disabled",
  });
});

test("keeps global preamble separate from a selected shape preamble", async ({ powerPointPage }) => {
  await powerPointPage.gotoWithOffice({
    slides: [{
      id: slideId,
      shapes: [typstShape({
        id: "local-shape",
        typstSource: { preamble: "#let local = 1", body: "local_body" },
      })],
    }],
    selectedSlideIds: [slideId],
  });

  await powerPointPage.setPreamble("#let global = 1");
  await powerPointPage.previewExpression("global_body");
  await powerPointPage.insertOrUpdate();
  await powerPointPage.expectStatus("Inserted Typst SVG.");

  await powerPointPage.selectShapes(slideId, ["local-shape"]);
  await powerPointPage.expectPreamble("#let local = 1");
  await powerPointPage.previewExpression("updated_local_body");
  await powerPointPage.setPreamble("#let local = 2");
  await powerPointPage.insertOrUpdate();
  await powerPointPage.expectStatus("Updated Typst SVG.");

  await powerPointPage.clearSelection(slideId);
  await powerPointPage.expectInsertMode();
  await powerPointPage.expectPreamble("#let global = 1");

  const snapshot = await powerPointPage.snapshot();
  const globalShape = snapshot.slides[0].shapes.find(shape => shape.customXml[0]?.includes("global_body"));
  const localShape = snapshot.slides[0].shapes.find(shape => shape.customXml[0]?.includes("updated_local_body"));

  expect(globalShape).toBeDefined();
  expect(localShape).toBeDefined();
  expectTypstShape(globalShape as ShapeSnapshot, {
    body: "global_body",
    preamble: "#let global = 1",
    fontSize: "28",
    fillColor: "#000000",
  });
  expectTypstShape(localShape as ShapeSnapshot, {
    body: "updated_local_body",
    preamble: "#let local = 2",
    fontSize: "28",
    fillColor: "#000000",
  });
});
