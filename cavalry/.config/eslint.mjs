import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "node_modules/",
      "dist/",
      "assets/",
      "src/vendor/",
      "**/*.d.ts",
    ],
  },
  {
    files: ["src/**/*.ts"],
    plugins: {
      "@stylistic": stylistic,
    },
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.strictTypeChecked,
    ],
    rules: {
      ...stylistic.configs.customize({
        indent: 2,
        jsx: false,
        semi: true,
        braceStyle: "1tbs",
      }).rules,
      "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
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
    // Build tooling: plain Node ESM, no type-checked linting.
    files: ["build.mjs", "scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
]);
