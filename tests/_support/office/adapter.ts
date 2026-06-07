/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

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
