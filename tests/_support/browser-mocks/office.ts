type OfficeReadyInfo = { host: "PowerPoint" };
type OfficeReadyCallback = (_info: OfficeReadyInfo) => void | Promise<void>;
type LoadableCollection = { items: unknown[]; load: (_properties?: unknown) => void };

type PowerPointContext = {
  presentation: {
    getSelectedShapes: () => LoadableCollection;
    getSelectedSlides: () => LoadableCollection;
  };
  sync: () => Promise<void>;
};

type MockGlobals = {
  Office: {
    HostType: { PowerPoint: "PowerPoint" };
    EventType: { DocumentSelectionChanged: "DocumentSelectionChanged" };
    actions: { associate: (_name: string, _handler: unknown) => void };
    context: { document: { addHandlerAsync: (_eventType: string, _handler: unknown) => void } };
    onReady: (_callback: OfficeReadyCallback) => Promise<void>;
  };
  PowerPoint: {
    run: (_callback: (_context: PowerPointContext) => Promise<void> | void) => Promise<void>;
  };
};

function emptyCollection(): LoadableCollection {
  return { items: [], load() {} };
}

const mockGlobals = globalThis as unknown as MockGlobals;

mockGlobals.Office = {
  HostType: { PowerPoint: "PowerPoint" },
  EventType: { DocumentSelectionChanged: "DocumentSelectionChanged" },
  actions: {
    associate() {},
  },
  context: {
    document: {
      addHandlerAsync() {},
    },
  },
  async onReady(callback: OfficeReadyCallback) {
    await callback({ host: "PowerPoint" });
  },
};

mockGlobals.PowerPoint = {
  async run(callback: (_context: PowerPointContext) => Promise<void> | void) {
    await callback({
      presentation: {
        getSelectedShapes: emptyCollection,
        getSelectedSlides: emptyCollection,
      },
      async sync() {},
    });
  },
};
