/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

// In-memory PowerPoint document model.
class MockShape implements Loadable, Identifiable {
  readonly id: string;
  altTextTitle = "";
  altTextDescription = "";
  name = "";
  left = 0;
  top = 0;
  width = 160;
  height = 40;
  rotation = 0;
  svgContent: string | null = null;

  readonly fill = new MockFill(null);
  readonly tags: MockTagCollection;
  readonly customXmlParts: MockCustomXmlPartCollection;

  private readonly tagMap = new Map<string, string>();
  private readonly xmlParts: MockXmlPart[] = [];
  private readonly documentModel: MockPowerPointDocument;
  private readonly parentSlide: MockSlide;

  constructor(
    documentModel: MockPowerPointDocument,
    parentSlide: MockSlide,
    id: string,
  ) {
    this.documentModel = documentModel;
    this.parentSlide = parentSlide;
    this.id = id;
    this.tags = new MockTagCollection(this.tagMap, (key, value) => {
      if (key === "TypstFillColor") {
        this.fill.foregroundColor = value === "disabled" ? null : value;
      }
    });
    this.customXmlParts = new MockCustomXmlPartCollection(
      () => this.xmlParts,
      xml => this.addCustomXmlPart(xml),
    );
  }

  load() {}

  delete() {
    this.parentSlide.removeShape(this.id);
    this.documentModel.removeSelectedShape(this.id);
  }

  getParentSlide(): MockSlide {
    return this.parentSlide;
  }

  applySeed(seed: MockSeedShape) {
    this.left = seed.left ?? this.left;
    this.top = seed.top ?? this.top;
    this.width = seed.width ?? this.width;
    this.height = seed.height ?? this.height;
    this.rotation = seed.rotation ?? this.rotation;
    this.altTextTitle = seed.altTextTitle ?? this.altTextTitle;
    this.altTextDescription = seed.altTextDescription ?? this.altTextDescription;
    this.name = seed.name ?? this.name;
    this.fill.foregroundColor = seed.fillColor ?? null;
    this.svgContent = seed.svgContent ?? null;

    for (const [key, value] of Object.entries(seed.tags ?? {})) {
      this.tags.add(key, value);
    }

    if (seed.typstSource) {
      this.customXmlParts.add(serializeTypstSource(seed.typstSource));
    }
  }

  snapshot(): MockShapeSnapshot {
    return {
      id: this.id,
      left: this.left,
      top: this.top,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      altTextTitle: this.altTextTitle,
      altTextDescription: this.altTextDescription,
      name: this.name,
      fillColor: this.fill.foregroundColor,
      tags: Object.fromEntries(this.tagMap.entries()),
      customXml: this.xmlParts.map(part => part.xml),
      svgContent: this.svgContent,
    };
  }

  private addCustomXmlPart(xml: string): MockXmlPart {
    const documentNode = new DOMParser().parseFromString(xml, "application/xml");
    const part = new MockXmlPart(
      this.documentModel.nextXmlPartId(),
      xml,
      documentNode.documentElement.namespaceURI,
    );

    this.xmlParts.push(part);
    return part;
  }
}

class MockSlide implements Loadable, Identifiable {
  readonly id: string;
  readonly isNullObject: boolean;
  readonly shapes: MockItemCollection<MockShape>;

  private readonly shapeList: MockShape[] = [];
  private readonly documentModel: MockPowerPointDocument;

  constructor(
    documentModel: MockPowerPointDocument,
    id: string,
    isNullObject = false,
  ) {
    this.documentModel = documentModel;
    this.id = id;
    this.isNullObject = isNullObject;
    this.shapes = new MockItemCollection(() => this.shapeList);
  }

  load() {}

  addShape(seed: MockSeedShape = {}): MockShape {
    const shape = new MockShape(
      this.documentModel,
      this,
      seed.id ?? this.documentModel.nextShapeId(),
    );

    shape.applySeed(seed);
    this.shapeList.push(shape);
    return shape;
  }

  removeShape(shapeId: string) {
    const index = this.shapeList.findIndex(shape => shape.id === shapeId);
    if (index >= 0) {
      this.shapeList.splice(index, 1);
    }
  }

  snapshot(): MockSlideSnapshot {
    return {
      id: this.id,
      shapes: this.shapeList.map(shape => shape.snapshot()),
    };
  }
}

class MockPageSetup implements Loadable {
  readonly slideWidth: number;
  readonly slideHeight: number;

  constructor(
    slideWidth: number,
    slideHeight: number,
  ) {
    this.slideWidth = slideWidth;
    this.slideHeight = slideHeight;
  }

  load() {}
}

class MockPowerPointDocument {
  slideWidth = DEFAULT_SLIDE_WIDTH;
  slideHeight = DEFAULT_SLIDE_HEIGHT;
  slides: MockSlide[] = [];
  selectedSlideIds: string[] = [];
  selectedShapeIds: string[] = [];
  readonly insertedSvgCalls: { slideId: string | null; svg: string }[] = [];

  private readonly selectionHandlers: SelectionChangedHandler[] = [];
  private shapeCounter = 1;
  private xmlCounter = 1;

  constructor(seed: MockOfficeSeed = {}) {
    this.reset(seed);
  }

  reset(seed: MockOfficeSeed = {}) {
    this.slideWidth = seed.slideWidth ?? DEFAULT_SLIDE_WIDTH;
    this.slideHeight = seed.slideHeight ?? DEFAULT_SLIDE_HEIGHT;
    this.slides = [];
    this.selectedSlideIds = [];
    this.selectedShapeIds = [];
    this.insertedSvgCalls.length = 0;
    this.shapeCounter = 1;
    this.xmlCounter = 1;

    const slideSeeds = seed.slides?.length ? seed.slides : [{ id: "slide-1", shapes: [] }];
    slideSeeds.forEach((slideSeed, index) => {
      const slide = new MockSlide(this, slideSeed.id ?? `slide-${String(index + 1)}`);
      this.slides.push(slide);
      slideSeed.shapes?.forEach(shapeSeed => slide.addShape(shapeSeed));
    });

    this.selectedSlideIds = seed.selectedSlideIds?.length
      ? [...seed.selectedSlideIds]
      : [this.slides.at(0)?.id].filter((value): value is string => typeof value === "string");
    this.selectedShapeIds = seed.selectedShapeIds ? [...seed.selectedShapeIds] : [];
  }

  nextShapeId(): string {
    const id = `shape-${String(this.shapeCounter)}`;
    this.shapeCounter += 1;
    return id;
  }

  nextXmlPartId(): string {
    const id = `xml-${String(this.xmlCounter)}`;
    this.xmlCounter += 1;
    return id;
  }

  addSelectionHandler(handler: SelectionChangedHandler) {
    this.selectionHandlers.push(handler);
  }

  getSelectedSlides(): MockSlide[] {
    return this.selectedSlideIds
      .map(slideId => this.slides.find(slide => slide.id === slideId))
      .filter((slide): slide is MockSlide => Boolean(slide));
  }

  getSelectedShapes(): MockShape[] {
    return this.slides
      .flatMap(slide => slide.shapes.items)
      .filter(shape => this.selectedShapeIds.includes(shape.id));
  }

  removeSelectedShape(shapeId: string) {
    this.selectedShapeIds = this.selectedShapeIds.filter(id => id !== shapeId);
  }

  async selectShapes(slideId: string, shapeIds: string[] = []) {
    this.selectedSlideIds = [slideId];
    this.selectedShapeIds = [...shapeIds];
    await this.triggerSelectionChanged();
  }

  async clearSelection(slideId?: string) {
    const fallbackSlideId = slideId ?? this.selectedSlideIds.at(0) ?? this.slides.at(0)?.id;
    this.selectedSlideIds = fallbackSlideId ? [fallbackSlideId] : [];
    this.selectedShapeIds = [];
    await this.triggerSelectionChanged();
  }

  insertSvg(svg: string): OfficeAsyncResult {
    const targetSlide = this.getSelectedSlides().at(0) ?? this.slides.at(0) ?? null;
    this.insertedSvgCalls.push({ slideId: targetSlide?.id ?? null, svg });

    if (!targetSlide) {
      return { status: "failed", error: new Error("No target slide available.") };
    }

    const shape = targetSlide.addShape({ svgContent: svg });
    this.selectedSlideIds = [targetSlide.id];
    this.selectedShapeIds = [shape.id];
    return { status: "succeeded" };
  }

  snapshot(): MockOfficeSnapshot {
    return {
      slideWidth: this.slideWidth,
      slideHeight: this.slideHeight,
      selectedSlideIds: [...this.selectedSlideIds],
      selectedShapeIds: [...this.selectedShapeIds],
      insertedSvgCalls: this.insertedSvgCalls.map(call => ({ ...call })),
      slides: this.slides.map(slide => slide.snapshot()),
    };
  }

  private async triggerSelectionChanged() {
    for (const handler of this.selectionHandlers) {
      await handler();
    }
  }
}
