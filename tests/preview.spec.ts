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

  await powerPointPage.recordClipboardWrites();
  await powerPointPage.copyPreviewSvg();
  await expect.poll(() => powerPointPage.readClipboardText()).toContain('fill="#000000"');
  const copiedSvg = await powerPointPage.readClipboardText();
  await expect.poll(() => powerPointPage.clipboardWriteTypes()).toEqual([
    "image/svg+xml",
    "text/plain",
  ]);
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

test("copies preview SVGs with alpha fills normalized for compatibility",
  async ({ powerPointPage, typstMock }) => {
    await typstMock.setPreviewSvg([
      '<svg xmlns="http://www.w3.org/2000/svg" width="196.39001" height="93.14115">',
      '<path fill="#ff000032" stroke="#000" d="M 0 0 L 10 0 L 10 10 Z"/>',
      '<path fill="#0000ff32" stroke="#000" d="M 20 0 L 30 0 L 30 10 Z"/>',
      '<path style="fill: #00ff0080; stroke: #00000080" d="M 40 0 L 50 0 L 50 10 Z"/>',
      "</svg>",
    ].join(""));

    await powerPointPage.setFillColor(null);
    await powerPointPage.setPreviewTypstFillEnabled(true);
    await powerPointPage.previewExpression("compatibility check");
    await powerPointPage.expectPreviewVisible();

    await powerPointPage.copyPreviewSvg();
    await expect.poll(() => powerPointPage.readClipboardText())
      .toContain('fill-opacity="0.19607843137254902"');

    const copiedSvg = await powerPointPage.readClipboardText();
    expect(copiedSvg).toContain('fill="#ff0000"');
    expect(copiedSvg).toContain('fill="#0000ff"');
    expect(copiedSvg).toContain('fill-opacity="0.19607843137254902"');
    expect(copiedSvg).toContain("fill: rgb(0, 255, 0);");
    expect(copiedSvg).toContain("fill-opacity: 0.5;");
    expect(copiedSvg).toContain("stroke-opacity: 0.5;");
    expect(copiedSvg).not.toContain("#ff000032");
    expect(copiedSvg).not.toContain("#0000ff32");
    expect(copiedSvg).not.toContain("#00ff0080");
    expect(copiedSvg).not.toContain("#00000080");
  });
