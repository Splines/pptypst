import fs from "fs/promises";
import * as ts from "typescript";

const compiledMocks = new Map<string, string>();

/** Transpiles an in-memory TypeScript browser mock source into JavaScript. */
export function compileBrowserMockSource(cacheKey: string, source: string, fileName = cacheKey) {
  const cached = compiledMocks.get(cacheKey);
  if (cached) return cached;

  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    },
    fileName,
  }).outputText;

  compiledMocks.set(cacheKey, output);
  return output;
}

/** Transpiles a TypeScript browser mock into JavaScript for Playwright route fulfillment. */
export async function compileBrowserMock(filePath: string) {
  const source = await fs.readFile(filePath, "utf8");
  return compileBrowserMockSource(filePath, source, filePath);
}
