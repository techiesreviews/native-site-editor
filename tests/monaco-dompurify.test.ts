import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dompurifyEntry, resolveMonacoDompurify } from "../vite-monaco-dompurify.ts";
import config from "../vite.config.ts";

const sanitizer = fileURLToPath(new URL("../node_modules/monaco-editor/esm/vs/base/browser/domSanitize.js", import.meta.url));

test("Monaco's vendored DOMPurify import resolves to the installed package", () => {
  assert.equal(resolveMonacoDompurify("./dompurify/dompurify.js", sanitizer), dompurifyEntry);
  assert.match(readFileSync(sanitizer, "utf8"), /^import purify from '\.\/dompurify\/dompurify\.js';$/m,
    "Monaco changed how it imports DOMPurify; update vite-monaco-dompurify.ts");
});

test("other imports keep their own resolution", () => {
  assert.equal(resolveMonacoDompurify("./dompurify/dompurify.js", "/project/src/other.js"), undefined);
  assert.equal(resolveMonacoDompurify("./dom.js", sanitizer), undefined);
  assert.equal(resolveMonacoDompurify("./dompurify/dompurify.js", undefined), undefined);
});

test("the redirected DOMPurify is past the critical advisories", () => {
  // dompurify <=3.4.16 is critical (GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr, GHSA-c6gr-qvv4-5v3f).
  const version = readFileSync(dompurifyEntry, "utf8").match(/@license DOMPurify (\d+)\.(\d+)\.(\d+)/);
  assert.ok(version, "no DOMPurify licence header in the package's ES build");
  const [major, minor, patch] = version.slice(1).map(Number);
  assert.ok(major > 3 || (major === 3 && (minor > 4 || (minor === 4 && patch >= 17))), `DOMPurify ${version.slice(1).join(".")} is still affected`);
});

test("the plugin runs in the build and in the dev server's pre-bundling", () => {
  const names = (plugins: unknown): string[] => [plugins].flat(Infinity as 1)
    .flatMap(plugin => plugin && typeof plugin === "object" && "name" in plugin ? [String(plugin.name)] : []);
  assert.ok(names(config.plugins).includes("monaco-dompurify"), "vite.config.ts plugins lack monaco-dompurify");
  assert.ok(names(config.optimizeDeps?.rolldownOptions?.plugins).includes("monaco-dompurify"),
    "vite.config.ts optimizeDeps.rolldownOptions.plugins lack monaco-dompurify");
});
