import { expect } from "@playwright/test";
import { test } from "./_support/fixtures";
import { makeTestFont } from "./_support/font-fixture";

const FAMILY = "PPTypst Test";

test("adds a custom font from an uploaded file", async ({ powerPointPage }) => {
  await powerPointPage.openFontsPanel();
  await powerPointPage.addFontFiles([
    { name: "PPTypstTest-Regular.ttf", buffer: makeTestFont(FAMILY, "Regular") },
  ]);

  await expect(powerPointPage.fontItems()).toHaveCount(1);
  await powerPointPage.expectFontFamilyCount(FAMILY, 1);
  await powerPointPage.expectFontStyleListed("Regular");
  await powerPointPage.expectStatus(`Added: ${FAMILY} Regular`);
});

test("keeps multiple weights of the same family as separate faces", async ({ powerPointPage }) => {
  await powerPointPage.openFontsPanel();
  await powerPointPage.addFontFiles([
    { name: "PPTypstTest-Regular.ttf", buffer: makeTestFont(FAMILY, "Regular") },
    { name: "PPTypstTest-Bold.ttf", buffer: makeTestFont(FAMILY, "Bold") },
  ]);

  // Both faces coexist (keyed per family+style) instead of overwriting each other.
  await expect(powerPointPage.fontItems()).toHaveCount(2);
  await powerPointPage.expectFontFamilyCount(FAMILY, 2);
  await powerPointPage.expectFontStyleListed("Regular");
  await powerPointPage.expectFontStyleListed("Bold");
});

test("removes a custom font", async ({ powerPointPage }) => {
  await powerPointPage.openFontsPanel();
  await powerPointPage.addFontFiles([
    { name: "PPTypstTest-Regular.ttf", buffer: makeTestFont(FAMILY, "Regular") },
  ]);
  await expect(powerPointPage.fontItems()).toHaveCount(1);

  await powerPointPage.removeFirstFont();

  await expect(powerPointPage.fontItems()).toHaveCount(0);
  await powerPointPage.expectNoCustomFonts();
});

test("persists custom fonts across a reload", async ({ powerPointPage }) => {
  await powerPointPage.openFontsPanel();
  await powerPointPage.addFontFiles([
    { name: "PPTypstTest-Regular.ttf", buffer: makeTestFont(FAMILY, "Regular") },
  ]);
  await expect(powerPointPage.fontItems()).toHaveCount(1);

  await powerPointPage.reload();
  await powerPointPage.openFontsPanel();

  // The font was restored from IndexedDB, not re-uploaded.
  await expect(powerPointPage.fontItems()).toHaveCount(1);
  await powerPointPage.expectFontFamilyCount(FAMILY, 1);
});
