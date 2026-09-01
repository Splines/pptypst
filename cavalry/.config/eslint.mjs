import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

/** Shared style rules, so sources and tests are formatted identically. */
const style = {
  ...stylistic.configs.customize({
    indent: 2,
    jsx: false,
    semi: true,
    braceStyle: "1tbs",
  }).rules,
  "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
  // The base rule flags parameter names in type signatures; the TS-aware
  // version understands them.
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
};

const typeChecked = [
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.strictTypeChecked,
];

export default defineConfig([
  {
    ignores: [
      "node_modules/",
      "dist/",
      "assets/",
      "**/*.d.ts",
    ],
  },
  {
    // The Cavalry script itself: no Node, no DOM -- only the globals Cavalry
    // provides (declared by @scenery/cavalry-types).
    files: ["src/**/*.ts"],
    plugins: { "@stylistic": stylistic },
    extends: typeChecked,
    rules: style,
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname + "/..",
      },
    },
  },
  {
    // Tests run on Node, against the pure `src/core` modules.
    files: ["test/**/*.ts"],
    plugins: { "@stylistic": stylistic },
    extends: typeChecked,
    rules: {
      ...style,
      // `node --test` collects the promises that `test()` returns.
      "@typescript-eslint/no-floating-promises": "off",
      // Assertions on deliberately malformed input need loose types.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // SVG fixtures are full of double quotes; backticks keep them readable.
      "@stylistic/quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: "always" }],
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname + "/..",
      },
    },
  },
  {
    // Build tooling: plain Node ESM, no type-checked linting.
    files: ["build.mjs", "scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
]);
