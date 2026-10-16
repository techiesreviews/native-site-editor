// Type-aware lint for mistakes tsc does not catch. See docs/agents/guardrails.md.
import { registerHooks } from "node:module";

// typescript-eslint needs the TypeScript compiler API, which TypeScript 7 does not ship.
// Point its `typescript` imports at TypeScript 6, nested inside the local package
// tools/typescript-api (installed as typescript-eslint-api) so its tsc bin stays out of
// node_modules/.bin. Imports from inside that package resolve normally.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "typescript" && !/\/(typescript-eslint-api|tools\/typescript-api)\//.test(context.parentURL ?? "")) return next("typescript-eslint-api", context);
    return next(specifier, context);
  },
});
const RECEIVER_GLOBALS = [
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
  "fetch", "structuredClone", "atob", "btoa", "getComputedStyle", "matchMedia", "reportError",
].join("|");
const DOUBLE_UNKNOWN = {
  selector: "TSAsExpression > TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']",
  message: "Type the fake with satisfies or a declared type instead of casting through unknown. Escape only with eslint-disable-next-line no-restricted-syntax -- <reason>.",
};
const RECEIVER_RULE = {
  selector: `ObjectExpression > Property > Identifier.value[name=/^(${RECEIVER_GLOBALS})$/]`,
  message: 'Wrap this global in an arrow: called as a property it gets the wrong receiver and throws "Illegal invocation".',
};
const { default: tseslint } = await import("typescript-eslint");

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "public/**", "fixtures/**", ".scratch/**", ".wrangler/**"] },
  {
    files: ["src/**/*.ts", "shared/**/*.ts", "worker/**/*.ts", "tests/**/*.ts"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./worker/tsconfig.json", "./tests/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      // Passing a method without its receiver throws "Illegal invocation" (requestAnimationFrame, Phase 5).
      "@typescript-eslint/unbound-method": "error",
      // unbound-method skips bare globals. A browser or Workers global stored as an object
      // property and called as `ports.frame()` gets the wrong receiver (p5-21, milestone-01).
      "no-restricted-syntax": ["error", RECEIVER_RULE],
      // A promise nobody awaits or catches loses its rejection: the user never sees the error.
      // node:test's test() promise never rejects; the runner reports failures itself.
      "@typescript-eslint/no-floating-promises": ["error", {
        allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test", "it", "describe", "suite"] }],
      }],
      "@typescript-eslint/no-misused-promises": "error",
      // tsc covers unused code (scripts/check-types.mjs).
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", RECEIVER_RULE, DOUBLE_UNKNOWN] },
  },
);
