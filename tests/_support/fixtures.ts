import {
  expect,
  test as base,
  type TestInfo,
} from "@playwright/test";
import { PowerPointPage } from "../pages/powerpoint-page";
import { installOfficeMock } from "./office-mock";
import { TypstMock } from "./typst-mock";

export type PptypstFixtures = {
  _forEachTest: null;
  powerPointPage: PowerPointPage;
  typstMock: TypstMock;
};

export type PptypstTestFixtures = Pick<PptypstFixtures, "powerPointPage" | "typstMock">;
type PptypstTestCallback = (_fixtures: PptypstTestFixtures, _testInfo: TestInfo) => unknown;

export * from "@playwright/test";
export { expect };

const extendedTest = base.extend<PptypstFixtures>({
  // https://playwright.dev/docs/test-fixtures#adding-global-beforeeachaftereach-hooks
  _forEachTest: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        window.localStorage.clear();
      });

      await use(null);
    },
    { auto: true },
  ],

  /** Installs the Typst dependency mock and exposes recorded compiler calls. */
  typstMock: async ({ page }, use) => {
    const typstMock = new TypstMock(page);
    await typstMock.install();
    await use(typstMock);
  },

  /** Opens the PowerPoint task pane page after Office and Typst mocks are ready. */
  powerPointPage: async ({ page, typstMock }, use) => {
    await installOfficeMock(page);

    const powerPointPage = new PowerPointPage(page);
    await powerPointPage.goto();
    await typstMock.waitUntilReady();

    await use(powerPointPage);
  },
});

type PptypstTest = {
  (_title: string, _callback: PptypstTestCallback): void;
} & typeof extendedTest;

export const test = extendedTest as PptypstTest;
