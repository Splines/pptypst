import fs from "fs/promises";
import * as ts from "typescript";

const compiledMocks = new Map<string, string>();

/** Transpiles a TypeScript browser mock into JavaScript for Playwright route fulfillment. */
export async function compileBrowserMock(filePath: string) {
  const cached = compiledMocks.get(filePath);
  if (cached) return cached;

  const source = await fs.readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    },
    fileName: filePath,
  }).outputText;

  compiledMocks.set(filePath, output);
  return output;
}
