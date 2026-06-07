import type { Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const officeMockDir = path.join(process.cwd(), "tests", "_support", "office");
const officeMockFiles = [
  "types.ts",
  "office-primitives.ts",
  "document-model.ts",
  "adapter.ts",
  "install.ts",
];

/** Replaces the hosted Office script with the minimal APIs needed for task pane startup. */
export async function installOfficeMock(page: Page) {
  await page.route("https://appsforoffice.microsoft.com/lib/1/hosted/office.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: await compileOfficeMock() });
  });
}

async function compileOfficeMock() {
  const { compileBrowserMockSource } = await import("./transpile-browser-mock");
  const sourceParts = await Promise.all(
    officeMockFiles.map(fileName => fs.readFile(path.join(officeMockDir, fileName), "utf8")),
  );

  return compileBrowserMockSource(
    officeMockDir,
    sourceParts.join("\n\n"),
    path.join(officeMockDir, "index.ts"),
  );
}
