import { expect, type Page } from "@playwright/test";

/** Page object for the PPTypst PowerPoint task pane. */
export class PowerPointPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Opens the task pane and waits until the add-in has finished its initial setup. */
  async goto() {
    await this.page.goto("powerpoint.html");
    await expect(this.page.locator("#insertBtn")).toContainText("Insert");
  }

  /** Types a Typst expression into the editor, triggering the preview update. */
  async previewExpression(expression: string) {
    await this.page.locator("#typstInput").fill(expression);
  }

  /** Asserts that the preview pane contains a rendered SVG. */
  async expectPreviewVisible() {
    await expect(this.page.locator("#previewContent svg")).toBeVisible();
  }
}
