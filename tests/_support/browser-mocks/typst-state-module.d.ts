declare module "https://127.0.0.1:3157/pptypst/__test__/typst-state.js" {
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
