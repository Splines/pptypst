/*
 * Browser replacement for Office.js used by the PowerPoint Playwright tests.
 *
 * These files are concatenated and transpiled into one classic script because
 * the app loads hosted `office.js` without module support.
 */

/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

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
