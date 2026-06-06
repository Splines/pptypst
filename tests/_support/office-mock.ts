import type { Page } from "@playwright/test";
import path from "node:path";

const officeMockPath = path.join(process.cwd(), "tests", "_support", "browser-mocks", "office.ts");

/** Replaces the hosted Office script with the minimal APIs needed for task pane startup. */
export async function installOfficeMock(page: Page) {
  await page.route("https://appsforoffice.microsoft.com/lib/1/hosted/office.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: await compileOfficeMock() });
  });
}

async function compileOfficeMock() {
  const { compileBrowserMock } = await import("./transpile-browser-mock");
  return compileBrowserMock(officeMockPath);
}
