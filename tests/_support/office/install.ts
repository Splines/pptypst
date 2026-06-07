// Browser global installation.
const mockGlobals = globalThis as unknown as MockGlobals;
const documentModel = new MockPowerPointDocument(mockGlobals.__pptypstOfficeSeed);

mockGlobals.Office = createOfficeHost(documentModel);
mockGlobals.PowerPoint = createPowerPointHost(documentModel);
mockGlobals.__pptypstOfficeMock = createTestHarness(documentModel);
