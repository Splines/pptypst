import { typstMockState } from "/pptypst/__test__/typst-state.js";

type CompilerInitOptions = { beforeBuild: unknown[]; getModule: unknown };
type CompileOptions = { mainFilePath: string };
type RenderSvgOptions = {
  format: string;
  artifactContent: Uint8Array;
  data_selection: Record<string, boolean>;
};

const previewSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40">',
  '<text x="0" y="20" fill="#000">integral preview</text>',
  "</svg>",
].join("");

export function createTypstCompiler() {
  return {
    init(options: CompilerInitOptions) {
      if (typeof options.getModule !== "function") {
        return Promise.reject(
          new Error("Expected Typst compiler getModule option."),
        );
      }
      return Promise.resolve();
    },
    addSource(path: string, source: string) {
      typstMockState.addSourceCalls.push({ path, source });
    },
    compile(options: CompileOptions) {
      typstMockState.compileCalls.push(options);
      return Promise.resolve({ diagnostics: [], result: new Uint8Array([1, 2, 3]) });
    },
  };
}

export function createTypstRenderer() {
  return {
    init(options: { getModule: unknown }) {
      typstMockState.rendererInitOptions.push({ hasGetModule: typeof options.getModule === "function" });
      return Promise.resolve();
    },
    renderSvg(options: RenderSvgOptions) {
      typstMockState.renderSvgCalls.push({
        format: options.format,
        artifactContent: Array.from(options.artifactContent),
        data_selection: options.data_selection,
      });
      return Promise.resolve(previewSvg);
    },
  };
}
