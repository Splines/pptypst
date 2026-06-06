import type { Page } from "@playwright/test";
import path from "node:path";
import { compileBrowserMock } from "./transpile-browser-mock";

export type TypstMockCalls = {
  addSourceCalls: { path: string; source: string }[];
  compileCalls: { mainFilePath: string }[];
  renderSvgCalls: {
    format: string;
    artifactContent: number[];
    data_selection: Record<string, boolean>;
  }[];
};

const stateModuleUrl = "/pptypst/__test__/typst-state.js";

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
    await this.routeModule("**/__test__/typst-state.js", "typst-state.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts.js*", "typst.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts_dist_esm_options__init__mjs.js*", "typst-options.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts_dist_esm_fs_package__node__mjs.js*", "typst-package-registry.ts");
    await this.routeModule("**/@myriaddreamin_typst__ts_dist_esm_fs_memory__mjs.js*", "typst-memory-access-model.ts");
    await this.routeModule("**/typst_ts_web_compiler_bg.wasm?*", "typst-wasm-url.ts");
    await this.routeModule("**/typst_ts_renderer_bg.wasm?*", "typst-wasm-url.ts");
  }

  /** Waits for the mocked renderer init call, which means the Typst wrapper initialized. */
  async waitUntilReady() {
    await this.page.waitForFunction(async (moduleUrl) => {
      const stateModule = await import(moduleUrl) as {
        typstMockReady: () => boolean;
      };
      return stateModule.typstMockReady();
    }, stateModuleUrl);
  }

  /** Returns the Typst compiler and renderer calls recorded in the browser. */
  async calls(): Promise<TypstMockCalls> {
    return this.page.evaluate(async (moduleUrl) => {
      const stateModule = await import(moduleUrl) as {
        typstMockCalls: () => TypstMockCalls;
      };
      return stateModule.typstMockCalls();
    }, stateModuleUrl);
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
