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
  previewSvg: string;
};

const defaultPreviewSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40">',
  '<text x="0" y="20" fill="#000">integral preview</text>',
  "</svg>",
].join("");

function freshState(): TypstMockState {
  return {
    rendererInitOptions: [],
    addSourceCalls: [],
    compileCalls: [],
    renderSvgCalls: [],
    previewSvg: defaultPreviewSvg,
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

export function setTypstMockPreviewSvg(svg: string) {
  typstMockState.previewSvg = svg;
}
