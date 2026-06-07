import { expect } from "@playwright/test";
import { test } from "./_support/fixtures";

test("previews Typst math expressions", async ({ powerPointPage, typstMock }) => {
  await powerPointPage.previewExpression("integral_a^b f(x) dif x");

  await powerPointPage.expectPreviewVisible();

  const calls = await typstMock.calls();
  expect(calls.addSourceCalls).toEqual([
    {
      path: "/main.typ",
      source: "#set page(margin: 3pt, background: none, width: auto, fill: none, height: auto)\n"
        + "#set text(size: 28pt)\n"
        + "$\n"
        + "integral_a^b f(x) dif x\n"
        + "$",
    },
  ]);
  expect(calls.compileCalls).toEqual([{ mainFilePath: "/main.typ" }]);
  expect(calls.renderSvgCalls).toEqual([
    {
      format: "vector",
      artifactContent: [1, 2, 3],
      data_selection: {
        body: true,
        defs: true,
        css: true,
        js: false,
      },
    },
  ]);
});

test("copies the preview SVG with optional inverted colors", async ({ powerPointPage }) => {
  await powerPointPage.previewExpression("integral_a^b f(x) dif x");
  await powerPointPage.expectPreviewVisible();

  await powerPointPage.copyPreviewSvg();
  await expect.poll(() => powerPointPage.readClipboardText()).toContain('fill="#000000"');
  const copiedSvg = await powerPointPage.readClipboardText();
  expect(copiedSvg).toContain("<svg");
  expect(copiedSvg).toContain("integral preview");
  expect(copiedSvg).toContain('fill="#000000"');
  expect(copiedSvg).not.toContain('style="width: 100%');

  await powerPointPage.copyPreviewSvg({ invertColors: true });
  await expect.poll(() => powerPointPage.readClipboardText()).toContain('fill="#ffffff"');
  const invertedSvg = await powerPointPage.readClipboardText();
  expect(invertedSvg).toContain("integral preview");
  expect(invertedSvg).toContain('fill="#ffffff"');
  expect(invertedSvg).not.toContain('fill="#000000"');
});
