declare module "*__test__/typst-state.js" {
  export const typstMockState: {
    rendererInitOptions: { hasGetModule: boolean }[];
    addSourceCalls: { path: string; source: string }[];
    compileCalls: { mainFilePath: string }[];
    renderSvgCalls: {
      format: string;
      artifactContent: number[];
      data_selection: Record<string, boolean>;
    }[];
  };

  export function typstMockReady(): boolean;

  export function typstMockCalls(): {
    addSourceCalls: { path: string; source: string }[];
    compileCalls: { mainFilePath: string }[];
    renderSvgCalls: {
      format: string;
      artifactContent: number[];
      data_selection: Record<string, boolean>;
    }[];
  };
}
