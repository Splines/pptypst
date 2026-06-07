/*
 * Browser replacement for Office.js used by the PowerPoint Playwright tests.
 *
 * Keep this file import-free. It is served as the classic `office.js` script,
 * so the browser will not evaluate ES module imports here.
 *
 * The mock has three layers:
 * 1. Seed and snapshot DTOs used by tests.
 * 2. A small in-memory PowerPoint document model.
 * 3. Office.js-shaped facades exposed on globalThis.
 */

type OfficeReadyInfo = { host: "PowerPoint" };
type OfficeReadyCallback = (_info: OfficeReadyInfo) => void | Promise<void>;
type SelectionChangedHandler = () => void | Promise<void>;

// Test-facing seed and snapshot data.
type MockTypstSource = {
  preamble: string;
  body: string;
};

type MockSeedShape = {
  id?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotation?: number;
  fillColor?: string | null;
  altTextTitle?: string;
  altTextDescription?: string;
  name?: string;
  tags?: Record<string, string>;
  typstSource?: MockTypstSource;
  svgContent?: string;
};

type MockSeedSlide = {
  id?: string;
  shapes?: MockSeedShape[];
};

type MockOfficeSeed = {
  slides?: MockSeedSlide[];
  selectedSlideIds?: string[];
  selectedShapeIds?: string[];
  slideWidth?: number;
  slideHeight?: number;
};

type MockShapeSnapshot = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  altTextTitle: string;
  altTextDescription: string;
  name: string;
  fillColor: string | null;
  tags: Record<string, string>;
  customXml: string[];
  svgContent: string | null;
};

type MockSlideSnapshot = {
  id: string;
  shapes: MockShapeSnapshot[];
};

type MockOfficeSnapshot = {
  slideWidth: number;
  slideHeight: number;
  selectedSlideIds: string[];
  selectedShapeIds: string[];
  insertedSvgCalls: { slideId: string | null; svg: string }[];
  slides: MockSlideSnapshot[];
};

// Global APIs installed for the browser app.
type OfficeAsyncResult = { status: string; error?: Error };

type MockOfficeDocument = {
  addHandlerAsync: (_eventType: string, _handler: SelectionChangedHandler) => void;
  setSelectedDataAsync: (
    _data: string,
    _options: { coercionType: string },
    _callback: (_result: OfficeAsyncResult) => void,
  ) => void;
};

type MockOfficeHost = {
  HostType: { PowerPoint: "PowerPoint" };
  EventType: { DocumentSelectionChanged: "DocumentSelectionChanged" };
  AsyncResultStatus: { Succeeded: "succeeded"; Failed: "failed" };
  CoercionType: { XmlSvg: "xmlSvg" };
  actions: { associate: (_name: string, _handler: unknown) => void };
  context: { document: MockOfficeDocument };
  onReady: (_callback: OfficeReadyCallback) => Promise<void>;
};

type MockPowerPointHost = {
  run: <T>(_callback: (_context: MockRequestContext) => Promise<T> | T) => Promise<T>;
};

type MockOfficeTestHarness = {
  reset: (_seed?: MockOfficeSeed) => void;
  selectShapes: (_slideId: string, _shapeIds: string[]) => Promise<void>;
  clearSelection: (_slideId?: string) => Promise<void>;
  snapshot: () => MockOfficeSnapshot;
};

type MockGlobals = {
  Office: MockOfficeHost;
  PowerPoint: MockPowerPointHost;
  __pptypstOfficeMock: MockOfficeTestHarness;
  __pptypstOfficeSeed?: MockOfficeSeed;
};

type Loadable = { load: (_properties?: unknown) => void };
type Identifiable = { id: string };

const SHAPE_XML_NAMESPACE = "https://splines.github.io/pptypst/shape/v1";
const DEFAULT_SLIDE_WIDTH = 960;
const DEFAULT_SLIDE_HEIGHT = 540;

// Small Office.js collection/value objects used by app code.
class MockCollection<T> implements Loadable {
  private readonly getItems: () => T[];

  constructor(getItems: () => T[]) {
    this.getItems = getItems;
  }

  get items(): T[] {
    return this.getItems();
  }

  load() {}
}

class MockItemCollection<T extends Identifiable> extends MockCollection<T> {
  private readonly missingItem?: (_id: string) => T;

  constructor(
    getItems: () => T[],
    missingItem?: (_id: string) => T,
  ) {
    super(getItems);
    this.missingItem = missingItem;
  }

  getItem(id: string): T {
    const item = this.items.find(candidate => candidate.id === id);
    if (item) return item;
    if (this.missingItem) return this.missingItem(id);

    throw new Error(`Item ${id} not found.`);
  }
}

class MockFill implements Loadable {
  foregroundColor: string | null;

  constructor(foregroundColor: string | null) {
    this.foregroundColor = foregroundColor;
  }

  load() {}
}

class MockTagItem implements Loadable {
  readonly key: string;
  readonly isNullObject: boolean;
  private readonly getValue: () => string;

  constructor(
    key: string,
    getValue: () => string,
    isNullObject = false,
  ) {
    this.key = key;
    this.getValue = getValue;
    this.isNullObject = isNullObject;
  }

  get value(): string {
    return this.getValue();
  }

  load() {}
}

class MockTagCollection implements Loadable {
  private readonly tagMap: Map<string, string>;
  private readonly onAdd: (_key: string, _value: string) => void;

  constructor(
    tagMap: Map<string, string>,
    onAdd: (_key: string, _value: string) => void,
  ) {
    this.tagMap = tagMap;
    this.onAdd = onAdd;
  }

  get items(): MockTagItem[] {
    return Array.from(
      this.tagMap.entries(),
      ([key, value]) => new MockTagItem(key, () => value),
    );
  }

  add(key: string, value: string) {
    this.tagMap.set(key, value);
    this.onAdd(key, value);
  }

  getItemOrNullObject(key: string): MockTagItem {
    if (!this.tagMap.has(key)) {
      return new MockTagItem(key, () => "", true);
    }

    return new MockTagItem(key, () => this.tagMap.get(key) ?? "");
  }

  load() {}
}

class MockXmlPart implements Loadable {
  readonly id: string;
  readonly xml: string;
  readonly namespaceUri: string | null;

  constructor(
    id: string,
    xml: string,
    namespaceUri: string | null,
  ) {
    this.id = id;
    this.xml = xml;
    this.namespaceUri = namespaceUri;
  }

  getXml() {
    return { value: this.xml };
  }

  load() {}
}

class MockCustomXmlPartCollection implements Loadable {
  private readonly getParts: () => MockXmlPart[];
  private readonly addPart: (_xml: string) => MockXmlPart;

  constructor(
    getParts: () => MockXmlPart[],
    addPart: (_xml: string) => MockXmlPart,
  ) {
    this.getParts = getParts;
    this.addPart = addPart;
  }

  get items(): MockXmlPart[] {
    return this.getParts();
  }

  add(xml: string): MockXmlPart {
    return this.addPart(xml);
  }

  getByNamespace(namespaceUri: string): MockCollection<MockXmlPart> {
    return new MockCollection(() => this.getParts().filter(part => part.namespaceUri === namespaceUri));
  }

  load() {}
}

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

// Office.js-shaped adapter around the document model.
class MockPresentation {
  readonly slides: MockItemCollection<MockSlide>;
  readonly pageSetup: MockPageSetup;
  private readonly documentModel: MockPowerPointDocument;

  constructor(documentModel: MockPowerPointDocument) {
    this.documentModel = documentModel;
    this.slides = new MockItemCollection(
      () => this.documentModel.slides,
      slideId => new MockSlide(this.documentModel, slideId, true),
    );
    this.pageSetup = new MockPageSetup(
      this.documentModel.slideWidth,
      this.documentModel.slideHeight,
    );
  }

  getSelectedShapes(): MockCollection<MockShape> {
    return new MockCollection(() => this.documentModel.getSelectedShapes());
  }

  getSelectedSlides(): MockCollection<MockSlide> {
    return new MockCollection(() => this.documentModel.getSelectedSlides());
  }
}

class MockRequestContext {
  readonly presentation: MockPresentation;

  constructor(documentModel: MockPowerPointDocument) {
    this.presentation = new MockPresentation(documentModel);
  }

  async sync() {}
}

function serializeTypstSource(source: MockTypstSource): string {
  const documentNode = document.implementation.createDocument(
    SHAPE_XML_NAMESPACE,
    "pptypst:content",
    null,
  );
  const root = documentNode.documentElement;

  const preambleNode = documentNode.createElementNS(SHAPE_XML_NAMESPACE, "pptypst:preamble");
  preambleNode.textContent = source.preamble;

  const bodyNode = documentNode.createElementNS(SHAPE_XML_NAMESPACE, "pptypst:body");
  bodyNode.textContent = source.body;

  root.appendChild(preambleNode);
  root.appendChild(bodyNode);
  return new XMLSerializer().serializeToString(documentNode);
}

// Browser global installation.
function createOfficeHost(documentModel: MockPowerPointDocument): MockOfficeHost {
  return {
    HostType: { PowerPoint: "PowerPoint" },
    EventType: { DocumentSelectionChanged: "DocumentSelectionChanged" },
    AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
    CoercionType: { XmlSvg: "xmlSvg" },
    actions: {
      associate() {},
    },
    context: {
      document: {
        addHandlerAsync(_eventType: string, handler: SelectionChangedHandler) {
          documentModel.addSelectionHandler(handler);
        },
        setSelectedDataAsync(data, _options, callback) {
          const result = documentModel.insertSvg(data);
          callback(result.status === "succeeded"
            ? { status: "succeeded" }
            : { status: "failed", error: result.error });
        },
      },
    },
    async onReady(callback: OfficeReadyCallback) {
      await callback({ host: "PowerPoint" });
    },
  };
}

function createPowerPointHost(documentModel: MockPowerPointDocument): MockPowerPointHost {
  return {
    async run<T>(callback: (_context: MockRequestContext) => Promise<T> | T) {
      return callback(new MockRequestContext(documentModel));
    },
  };
}

function createTestHarness(documentModel: MockPowerPointDocument): MockOfficeTestHarness {
  return {
    reset(seed?: MockOfficeSeed) {
      documentModel.reset(seed);
    },
    async selectShapes(slideId: string, shapeIds: string[]) {
      await documentModel.selectShapes(slideId, shapeIds);
    },
    async clearSelection(slideId?: string) {
      await documentModel.clearSelection(slideId);
    },
    snapshot() {
      return documentModel.snapshot();
    },
  };
}

const mockGlobals = globalThis as unknown as MockGlobals;
const documentModel = new MockPowerPointDocument(mockGlobals.__pptypstOfficeSeed);

mockGlobals.Office = createOfficeHost(documentModel);
mockGlobals.PowerPoint = createPowerPointHost(documentModel);
mockGlobals.__pptypstOfficeMock = createTestHarness(documentModel);
