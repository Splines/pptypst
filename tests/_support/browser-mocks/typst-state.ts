type AddSourceCall = { path: string; source: string };
type CompileCall = { mainFilePath: string };
type RenderSvgCall = {
  format: string;
  artifactContent: number[];
  data_selection: Record<string, boolean>;
};

type TypstMockState = {
  rendererInitOptions: { hasGetModule: boolean }[];
  addSourceCalls: AddSourceCall[];
  compileCalls: CompileCall[];
  renderSvgCalls: RenderSvgCall[];
};

function freshState(): TypstMockState {
  return {
    rendererInitOptions: [],
    addSourceCalls: [],
    compileCalls: [],
    renderSvgCalls: [],
  };
}

export const typstMockState = freshState();

export function typstMockReady() {
  return typstMockState.rendererInitOptions.length === 1;
}

export function typstMockCalls() {
  return {
    addSourceCalls: structuredClone(typstMockState.addSourceCalls),
    compileCalls: structuredClone(typstMockState.compileCalls),
    renderSvgCalls: structuredClone(typstMockState.renderSvgCalls),
  };
}
