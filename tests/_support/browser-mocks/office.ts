type OfficeReadyInfo = { host: "PowerPoint" };
type OfficeReadyCallback = (_info: OfficeReadyInfo) => void | Promise<void>;
type SelectionChangedHandler = () => void | Promise<void>;

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

type Loadable = { load: (_properties?: unknown) => void };

const SHAPE_XML_NAMESPACE = "https://splines.github.io/pptypst/shape/v1";
const DEFAULT_SLIDE_WIDTH = 960;
const DEFAULT_SLIDE_HEIGHT = 540;

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

class MockFill implements Loadable {
  foregroundColor: string | null;

  constructor(color: string | null) {
    this.foregroundColor = color;
  }

  load() {}
}

class MockTagItem implements Loadable {
  readonly key: string;
  readonly isNullObject: boolean;
  private readonly getValue: () => string;

  constructor(key: string, getValue: () => string, isNullObject = false) {
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
  private readonly onTagAdd: (_key: string, _value: string) => void;

  constructor(
    tagMap: Map<string, string>,
    onTagAdd: (_key: string, _value: string) => void,
  ) {
    this.tagMap = tagMap;
    this.onTagAdd = onTagAdd;
  }

  get items(): MockTagItem[] {
    return Array.from(this.tagMap.entries(), ([key, value]) => new MockTagItem(key, () => value));
  }

  add(key: string, value: string) {
    this.tagMap.set(key, value);
    this.onTagAdd(key, value);
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

class MockShape implements Loadable {
  readonly mock: MockPowerPointRuntime;
  readonly parentSlide: MockSlide;
  readonly id: string;
  altTextTitle = "";
  altTextDescription = "";
  name = "";
  left = 0;
  top = 0;
  width = 160;
  height = 40;
  rotation = 0;
  readonly fill: MockFill;
  readonly tags: MockTagCollection;
  readonly customXmlParts: MockCustomXmlPartCollection;
  svgContent: string | null = null;

  private readonly tagMap = new Map<string, string>();
  private readonly xmlParts: MockXmlPart[] = [];

  constructor(
    mock: MockPowerPointRuntime,
    parentSlide: MockSlide,
    id: string,
  ) {
    this.mock = mock;
    this.parentSlide = parentSlide;
    this.id = id;
    this.fill = new MockFill(null);
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
    this.mock.removeSelectedShape(this.id);
  }

  getParentSlide(): MockSlide {
    return this.parentSlide;
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

    if (seed.tags) {
      for (const [key, value] of Object.entries(seed.tags)) {
        this.tags.add(key, value);
      }
    }

    if (seed.typstSource) {
      this.customXmlParts.add(serializeTypstSource(seed.typstSource));
    }
  }

  private addCustomXmlPart(xml: string): MockXmlPart {
    const documentNode = new DOMParser().parseFromString(xml, "application/xml");
    const namespaceUri = documentNode.documentElement.namespaceURI;
    const part = new MockXmlPart(this.mock.nextXmlPartId(), xml, namespaceUri);
    this.xmlParts.push(part);
    return part;
  }
}

class MockShapeCollection extends MockCollection<MockShape> {
  private readonly getById: (_id: string) => MockShape | undefined;

  constructor(
    getItems: () => MockShape[],
    getById: (_id: string) => MockShape | undefined,
  ) {
    super(getItems);
    this.getById = getById;
  }

  getItem(id: string): MockShape {
    const shape = this.getById(id);
    if (!shape) {
      throw new Error(`Shape ${id} not found.`);
    }

    return shape;
  }
}

class MockSlide implements Loadable {
  readonly mock: MockPowerPointRuntime;
  readonly id: string;
  readonly shapes: MockShapeCollection;
  readonly isNullObject: boolean;

  private readonly shapeList: MockShape[] = [];

  constructor(
    mock: MockPowerPointRuntime,
    id: string,
    isNullObject = false,
  ) {
    this.mock = mock;
    this.id = id;
    this.isNullObject = isNullObject;
    this.shapes = new MockShapeCollection(
      () => this.shapeList,
      shapeId => this.shapeList.find(shape => shape.id === shapeId),
    );
  }

  load() {}

  addShape(seed: MockSeedShape = {}): MockShape {
    const shape = new MockShape(this.mock, this, seed.id ?? this.mock.nextShapeId());
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

class MockSlideCollection extends MockCollection<MockSlide> {
  private readonly getById: (_id: string) => MockSlide | undefined;
  private readonly mock: MockPowerPointRuntime;

  constructor(
    getItems: () => MockSlide[],
    getById: (_id: string) => MockSlide | undefined,
    mock: MockPowerPointRuntime,
  ) {
    super(getItems);
    this.getById = getById;
    this.mock = mock;
  }

  getItem(id: string): MockSlide {
    return this.getById(id) ?? new MockSlide(this.mock, id, true);
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

class MockPresentation {
  readonly slides: MockSlideCollection;
  readonly pageSetup: MockPageSetup;
  private readonly mock: MockPowerPointRuntime;

  constructor(mock: MockPowerPointRuntime) {
    this.mock = mock;
    this.slides = new MockSlideCollection(
      () => this.mock.slideList,
      slideId => this.mock.slideList.find(slide => slide.id === slideId),
      this.mock,
    );
    this.pageSetup = new MockPageSetup(this.mock.slideWidth, this.mock.slideHeight);
  }

  getSelectedShapes(): MockCollection<MockShape> {
    return new MockCollection(() => this.mock.getSelectedShapes());
  }

  getSelectedSlides(): MockCollection<MockSlide> {
    return new MockCollection(() => this.mock.getSelectedSlides());
  }
}

class MockRequestContext {
  readonly presentation: MockPresentation;

  constructor(mock: MockPowerPointRuntime) {
    this.presentation = new MockPresentation(mock);
  }

  async sync() {}
}

class MockPowerPointRuntime {
  slideWidth = DEFAULT_SLIDE_WIDTH;
  slideHeight = DEFAULT_SLIDE_HEIGHT;
  slideList: MockSlide[] = [];
  selectedSlideIds: string[] = [];
  selectedShapeIds: string[] = [];
  readonly insertedSvgCalls: { slideId: string | null; svg: string }[] = [];
  private readonly selectionHandlers: SelectionChangedHandler[] = [];
  private shapeCounter = 1;
  private xmlCounter = 1;

  constructor() {
    this.reset();
  }

  reset(seed: MockOfficeSeed = {}) {
    this.slideWidth = seed.slideWidth ?? DEFAULT_SLIDE_WIDTH;
    this.slideHeight = seed.slideHeight ?? DEFAULT_SLIDE_HEIGHT;
    this.slideList = [];
    this.selectedSlideIds = [];
    this.selectedShapeIds = [];
    this.insertedSvgCalls.length = 0;
    this.shapeCounter = 1;
    this.xmlCounter = 1;

    const slides = seed.slides && seed.slides.length > 0 ? seed.slides : [{ id: "slide-1", shapes: [] }];
    slides.forEach((slideSeed, index) => {
      const slide = new MockSlide(this, slideSeed.id ?? `slide-${String(index + 1)}`);
      this.slideList.push(slide);
      slideSeed.shapes?.forEach((shapeSeed) => {
        slide.addShape(shapeSeed);
      });
    });

    this.selectedSlideIds = seed.selectedSlideIds?.length
      ? [...seed.selectedSlideIds]
      : [this.slideList.at(0)?.id].filter((value): value is string => typeof value === "string");
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
      .map(slideId => this.slideList.find(slide => slide.id === slideId))
      .filter((slide): slide is MockSlide => Boolean(slide));
  }

  getSelectedShapes(): MockShape[] {
    return this.slideList
      .flatMap(slide => slide.shapes.items)
      .filter(shape => this.selectedShapeIds.includes(shape.id));
  }

  removeSelectedShape(shapeId: string) {
    this.selectedShapeIds = this.selectedShapeIds.filter(id => id !== shapeId);
  }

  async setSelection(slideId: string, shapeIds: string[] = []) {
    this.selectedSlideIds = [slideId];
    this.selectedShapeIds = [...shapeIds];
    await this.triggerSelectionChanged();
  }

  async clearSelection(slideId?: string) {
    const fallbackSlideId = slideId ?? this.selectedSlideIds.at(0) ?? this.slideList.at(0)?.id;
    this.selectedSlideIds = fallbackSlideId ? [fallbackSlideId] : [];
    this.selectedShapeIds = [];
    await this.triggerSelectionChanged();
  }

  insertSvg(svg: string) {
    const targetSlide = this.getSelectedSlides().at(0) ?? this.slideList.at(0) ?? null;
    this.insertedSvgCalls.push({ slideId: targetSlide?.id ?? null, svg });
    if (!targetSlide) {
      return { status: "failed", error: new Error("No target slide available.") };
    }

    const shape = targetSlide.addShape({ svgContent: svg });
    this.selectedSlideIds = [targetSlide.id];
    this.selectedShapeIds = [shape.id];
    return { status: "succeeded", shapeId: shape.id };
  }

  snapshot(): MockOfficeSnapshot {
    return {
      slideWidth: this.slideWidth,
      slideHeight: this.slideHeight,
      selectedSlideIds: [...this.selectedSlideIds],
      selectedShapeIds: [...this.selectedShapeIds],
      insertedSvgCalls: this.insertedSvgCalls.map(call => ({ ...call })),
      slides: this.slideList.map(slide => slide.snapshot()),
    };
  }

  private async triggerSelectionChanged() {
    for (const handler of this.selectionHandlers) {
      await handler();
    }
  }
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

type MockGlobals = {
  Office: {
    HostType: { PowerPoint: "PowerPoint" };
    EventType: { DocumentSelectionChanged: "DocumentSelectionChanged" };
    AsyncResultStatus: { Succeeded: "succeeded"; Failed: "failed" };
    CoercionType: { XmlSvg: "xmlSvg" };
    actions: { associate: (_name: string, _handler: unknown) => void };
    context: {
      document: {
        addHandlerAsync: (_eventType: string, _handler: SelectionChangedHandler) => void;
        setSelectedDataAsync: (
          _data: string,
          _options: { coercionType: string },
          _callback: (_result: { status: string; error?: Error }) => void,
        ) => void;
      };
    };
    onReady: (_callback: OfficeReadyCallback) => Promise<void>;
  };
  PowerPoint: {
    run: <T>(_callback: (_context: MockRequestContext) => Promise<T> | T) => Promise<T>;
  };
  __pptypstOfficeMock: {
    reset: (_seed?: MockOfficeSeed) => void;
    selectShapes: (_slideId: string, _shapeIds: string[]) => Promise<void>;
    clearSelection: (_slideId?: string) => Promise<void>;
    snapshot: () => MockOfficeSnapshot;
  };
  __pptypstOfficeSeed?: MockOfficeSeed;
};

const mockGlobals = globalThis as unknown as MockGlobals;
const runtime = new MockPowerPointRuntime();
runtime.reset(mockGlobals.__pptypstOfficeSeed);

mockGlobals.Office = {
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
        runtime.addSelectionHandler(handler);
      },
      setSelectedDataAsync(data, _options, callback) {
        const result = runtime.insertSvg(data);
        callback(result.status === "succeeded"
          ? { status: mockGlobals.Office.AsyncResultStatus.Succeeded }
          : { status: mockGlobals.Office.AsyncResultStatus.Failed, error: result.error });
      },
    },
  },
  async onReady(callback: OfficeReadyCallback) {
    await callback({ host: "PowerPoint" });
  },
};

mockGlobals.PowerPoint = {
  async run<T>(callback: (_context: MockRequestContext) => Promise<T> | T) {
    return callback(new MockRequestContext(runtime));
  },
};

mockGlobals.__pptypstOfficeMock = {
  reset(seed?: MockOfficeSeed) {
    runtime.reset(seed);
  },
  async selectShapes(slideId: string, shapeIds: string[]) {
    await runtime.setSelection(slideId, shapeIds);
  },
  async clearSelection(slideId?: string) {
    await runtime.clearSelection(slideId);
  },
  snapshot() {
    return runtime.snapshot();
  },
};
