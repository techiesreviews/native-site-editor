import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Script } from "node:vm";
import { minifyPreviewRuntime, previewRuntime } from "../vite-preview-runtime.ts";

const target = ["chrome111", "edge111", "firefox114", "safari16.4"];

test("runtime minifies as a classic script with its readable external source map", async () => {
  const source = readFileSync(new URL("../src/components/native-preview-runtime.js", import.meta.url), "utf8");
  const runtime = await minifyPreviewRuntime(source, target);
  assert.doesNotThrow(() => new Script(runtime.code));
  assert.ok(Buffer.byteLength(runtime.code) < Buffer.byteLength(source));
  assert.ok(runtime.code.endsWith(`//# sourceMappingURL=${runtime.fileName}.map\n`));
  const map = JSON.parse(runtime.map);
  assert.deepEqual(map.sources, ["native-preview-runtime.js"]);
  assert.deepEqual(map.sourcesContent, [source]);
  assert.ok(map.mappings.length > 0);
});

test("minification preserves classic-script execution and respects the target", async () => {
  const source = "(function () { var readableLocal = globalThis.input?.value ?? 7; globalThis.output = readableLocal + 1; })();";
  const runtime = await minifyPreviewRuntime(source, "es2015");
  const context = { input: { value: 11 }, output: 0 };
  new Script(runtime.code).runInNewContext(context);
  assert.equal(context.output, 12);
  assert.ok(!runtime.code.includes("?."));
  assert.ok(!runtime.code.includes("??"));
});

test("immutable names are deterministic and change with code or source-map bytes", async () => {
  const source = "(function () { globalThis.output = 1; })();";
  const original = await minifyPreviewRuntime(source, target);
  assert.deepEqual(await minifyPreviewRuntime(source, target), original);
  const changedCode = await minifyPreviewRuntime(source.replace("= 1", "= 2"), target);
  assert.notEqual(changedCode.fileName, original.fileName);
  const changedMap = await minifyPreviewRuntime(`// readable comment\n${source}`, target);
  assert.equal(changedMap.code.split("//#")[0], original.code.split("//#")[0]);
  assert.notEqual(changedMap.fileName, original.fileName);
});

test("runtime plugin applies only to production builds", () => {
  assert.equal(previewRuntime().apply, "build");
});
