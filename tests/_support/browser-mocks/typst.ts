/**
 * Browser mock for `@myriaddreamin/typst.ts`.
 *
 * `TypstMock` (see ../typst-mock.ts) serves this in place of the real
 * WASM-backed library. Recorded compiler/renderer calls and the SVG the
 * renderer returns live on `window.__typstMock` so the Node-side helper can
 * read and tweak them via `page.evaluate`.
 */

export type TypstMockState = {
  rendererInitOptions: { hasGetModule: boolean }[];
  addSourceCalls: { path: string; source: string }[];
  compileCalls: { mainFilePath: string }[];
  renderSvgCalls: {
    format: string;
    artifactContent: number[];
    data_selection: Record<string, boolean>;
  }[];
  previewSvg: string;
};

declare global {
  interface Window {
    __typstMock?: TypstMockState;
  }
}

const DEFAULT_PREVIEW_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40">',
  '<text x="0" y="20" fill="#000">integral preview</text>',
  "</svg>",
].join("");

const state: TypstMockState = {
  rendererInitOptions: [],
  addSourceCalls: [],
  compileCalls: [],
  renderSvgCalls: [],
  previewSvg: DEFAULT_PREVIEW_SVG,
};

window.__typstMock = state;

type CompilerInitOptions = { beforeBuild: unknown[]; getModule: unknown };
type CompileOptions = { mainFilePath: string };
type RenderSvgOptions = {
  format: string;
  artifactContent: Uint8Array;
  data_selection: Record<string, boolean>;
};

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
      state.addSourceCalls.push({ path, source });
    },
    compile(options: CompileOptions) {
      state.compileCalls.push(options);
      return Promise.resolve({ diagnostics: [], result: new Uint8Array([1, 2, 3]) });
    },
  };
}

export function createTypstRenderer() {
  return {
    init(options: { getModule: unknown }) {
      state.rendererInitOptions.push({ hasGetModule: typeof options.getModule === "function" });
      return Promise.resolve();
    },
    renderSvg(options: RenderSvgOptions) {
      state.renderSvgCalls.push({
        format: options.format,
        artifactContent: Array.from(options.artifactContent),
        data_selection: options.data_selection,
      });
      return Promise.resolve(state.previewSvg);
    },
  };
}
