import css from "@eslint/css";
import eslint from "@eslint/js";
import html from "@html-eslint/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

const customGlobals = {
  PowerPoint: "readonly",
  Office: "readonly",
};

export default defineConfig([
    {
        // Globally ignore the following paths
        ignores: [
            "node_modules/",
            "web/pkg/",
            "tmp/",
        ],
    },
    {
        files: ["**/*.ts", "**/*.js"],
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
                "indent": 2,
                "jsx": false,
                "semi": true,
                "braceStyle": "1tbs",
            }).rules,
            "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...customGlobals,
                ...globals.browser,
            },
            parserOptions: {
                // https://typescript-eslint.io/blog/project-service
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // Disable type-checked linting
        // https://typescript-eslint.io/troubleshooting/typed-linting/#how-do-i-disable-type-checked-linting-for-a-file
        // https://typescript-eslint.io/troubleshooting/typed-linting/#i-get-errors-telling-me--was-not-found-by-the-project-service-consider-either-including-it-in-the-tsconfigjson-or-including-it-in-allowdefaultproject
        files: ["**/*.js", "**/*.mjs", "**/*.mts"],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        files: ["**/*.html"],
        ...html.configs["flat/recommended"],
        plugins: {
            "@html-eslint": html,
            "@stylistic": stylistic,
        },
        rules: {
            "@stylistic/eol-last": ["error", "always"],
            "@stylistic/no-trailing-spaces": "error",
            "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0 }],
            ...html.configs["flat/recommended"].rules,
            // 🎈 Best Practices
            "@html-eslint/no-extra-spacing-text": "error",
            "@html-eslint/no-script-style-type": "error",
            "@html-eslint/no-target-blank": "error",
            // 🎈 Accessibility
            "@html-eslint/no-abstract-roles": "error",
            "@html-eslint/no-accesskey-attrs": "error",
            "@html-eslint/no-aria-hidden-body": "error",
            "@html-eslint/no-non-scalable-viewport": "error",
            "@html-eslint/no-positive-tabindex": "error",
            "@html-eslint/no-skip-heading-levels": "error",
            // 🎈 Styles
            "@html-eslint/attrs-newline": ["error", {
                closeStyle: "newline",
                ifAttrsMoreThan: 5,
            }],
            "@html-eslint/element-newline": ["error", { "inline": ["$inline"] }],
            "@html-eslint/id-naming-convention": ["error", "camelCase"],
            "@html-eslint/indent": ["error", 2],
            "@html-eslint/sort-attrs": "error",
            "@html-eslint/no-extra-spacing-attrs": ["error", {
                enforceBeforeSelfClose: true,
                disallowMissing: true,
                disallowTabs: true,
                disallowInAssignment: true,
            }],
        },
    },
    {
        files: ["**/*.css"],
        plugins: { css },
        language: "css/css",
        extends: [css.configs.recommended],
        rules: {
            "css/use-baseline": ["error", {
                allowSelectors: ["nesting"],
                allowProperties: ["user-select", "zoom", "resize"]
            }],
            "css/no-invalid-properties": ["error", { allowUnknownVariables: true }]
        }
    },
]);
