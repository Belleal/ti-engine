import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";

export default defineConfig( [ {
    ignores: [
        "**/*.min.js",
        "packages/*/bin/static/scripts/lib/**",
        "eslint.config.mjs",
        // Tooling scratch, not source, and neither is shipped by any package. `.claude` also holds agent git
        // worktrees -- each a full checkout carrying its own eslint.config.mjs, which ESLint discovers while
        // traversing and loads, so one stale worktree failed the whole run with an error from a config that is not
        // this one. `.superpowers` holds archived generated scripts, one of which does not even parse.
        ".claude/**",
        ".superpowers/**",
    ],
}, {
    // The flat-config form. This used to go through `FlatCompat`, whose entire job was translating the legacy string
    // "eslint:recommended" into the very object it was handed as `recommendedConfig` -- a shim around a no-op.
    extends: [ js.configs.recommended ],

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
            ti: "readonly",
            htmx: "readonly",
            Alpine: "readonly",
        },

        ecmaVersion: "latest",
        sourceType: "commonjs",
    },

    rules: {
        "no-unused-vars": [ "warn", { "args": "after-used" } ]
    },
} ] );