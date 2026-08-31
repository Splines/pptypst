import type { Page } from "@playwright/test";
import path from "node:path";
import { compileBrowserMock } from "./transpile-browser-mock";
import type { TypstMockState } from "./browser-mocks/typst";

export type TypstMockCalls = Pick<
  TypstMockState,
  "addSourceCalls" | "compileCalls" | "renderSvgCalls"
>;

function browserMockPath(fileName: string) {
  return path.join(process.cwd(), "tests", "_support", "browser-mocks", fileName);
}

/** Installs route-level mocks for the Typst dependencies used by the preview path. */
export class TypstMock {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Routes only the Typst modules that web/src/typst.ts and font-cache.ts import. */
  async install() {
    await this.routeModule("**/@myriaddreamin_typst__ts.js*", "typst.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts_dist_esm_options__init__mjs.js*", "typst-options.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts_dist_esm_fs_package__node__mjs.js*", "typst-package-registry.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts_dist_esm_fs_memory__mjs.js*", "typst-memory-access-model.ts");
    await this.routeModule("**/typst_ts_web_compiler_bg.wasm?*", "typst-wasm-url.ts");
    await this.routeModule("**/typst_ts_renderer_bg.wasm?*", "typst-wasm-url.ts");
  }

  /** Resolves once the app has initialized the mocked renderer. */
  async waitUntilReady() {
    await this.page.waitForFunction(
      () => window.__typstMock?.rendererInitOptions.length === 1,
    );
  }

  /** Snapshot of the compiler/renderer calls recorded so far. */
  async calls(): Promise<TypstMockCalls> {
    return this.page.evaluate(() => {
      const state = window.__typstMock;
      if (!state) {
        throw new Error("Typst mock has not been initialized yet.");
      }
      const { addSourceCalls, compileCalls, renderSvgCalls } = state;
      return { addSourceCalls, compileCalls, renderSvgCalls };
    });
  }

  /** Overrides the SVG the mocked renderer returns for subsequent preview renders. */
  async setPreviewSvg(svg: string) {
    await this.page.evaluate((value) => {
      const state = window.__typstMock;
      if (!state) {
        throw new Error("Typst mock has not been initialized yet.");
      }
      state.previewSvg = value;
    }, svg);
  }

  private async routeModule(url: string, fileName: string) {
    await this.page.route(url, async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: await compileBrowserMock(browserMockPath(fileName)),
      });
    });
  }
}
