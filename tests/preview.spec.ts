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
