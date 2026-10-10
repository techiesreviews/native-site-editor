import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Script } from "node:vm";
import { createServer } from "vite";
import { bundlePreviewRuntime, devRuntimeBundle, immutableRuntimeAsset, previewRuntime } from "../vite-preview-runtime.ts";

const target = ["chrome111", "edge111", "firefox114", "safari16.4"];
const root = new URL("..", import.meta.url).pathname;
const entry = join(root, "src/components/native-preview-runtime.js");
const source = readFileSync(entry, "utf8");
const scratch = mkdtempSync(join(tmpdir(), "ase-runtime-bundle-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

let fixtures = 0;
/** A runtime of its own in a fresh folder: `runtime.js` importing `rule.ts`. */
function fixture(runtime: string, rule = "export const rule = (n: number): number => n + 1;\n") {
  const dir = join(scratch, String(fixtures++));
  mkdirSync(dir);
  const write = (name: string, text: string) => {
    writeFileSync(join(dir, name), text);
    return join(dir, name);
  };
  write("rule.ts", rule);
  return { entry: write("runtime.js", runtime), write };
}
const usesRule = 'import { rule } from "./rule.ts";\n(function () { globalThis.output = rule(globalThis.input); })();\n';
const run = (code: string, input?: unknown) => {
  const context: { input?: unknown; output?: unknown } = { input };
  new Script(code).runInNewContext(context);
  return context.output;
};

test("the build bundles the runtime and its imports as one minified classic script with an external map", async () => {
  const bundle = await bundlePreviewRuntime({ entry, minify: true, sourcemap: "external", target });
  const runtime = immutableRuntimeAsset(bundle);
  // An import left in would be a SyntaxError in a classic script.
  assert.doesNotThrow(() => new Script(runtime.code));
  assert.ok(Buffer.byteLength(runtime.code) < Buffer.byteLength(source));
  assert.ok(runtime.code.endsWith(`//# sourceMappingURL=${runtime.fileName}.map\n`));
  const map = JSON.parse(runtime.map) as { sources: string[]; sourcesContent: string[]; mappings: string };
  assert.ok(map.sources.includes("../page-builder/rules/canvas-gesture.ts"));
  assert.equal(map.sourcesContent[map.sources.indexOf("native-preview-runtime.js")], source);
  assert.ok(map.mappings.length > 0);
  assert.ok(bundle.inputs.includes(entry));
  assert.ok(bundle.inputs.includes(join(root, "src/page-builder/rules/canvas-gesture.ts")));
});

test("dev serves the readable bundle with an inline map", async () => {
  const bundle = await bundlePreviewRuntime({ entry, minify: false, sourcemap: "inline", target });
  assert.doesNotThrow(() => new Script(bundle.code));
  assert.equal(bundle.map, "");
  assert.match(bundle.code, /function canvasGesture\(gesture, at\)/);
  assert.match(bundle.code, /\/\/# sourceMappingURL=data:application\/json;base64,[\w+/=]+\n$/);
});

test("an imported rule runs inside the bundle, and the target is respected", async () => {
  const { entry } = fixture(usesRule, "export const rule = (n?: { value?: number }): number => n?.value ?? 7;\n");
  for (const minify of [true, false]) {
    const bundle = await bundlePreviewRuntime({ entry, minify, sourcemap: "external", target: "es2015" });
    assert.equal(run(bundle.code, { value: 11 }), 11);
    assert.equal(run(bundle.code), 7);
    assert.ok(!bundle.code.includes("?."));
    assert.ok(!bundle.code.includes("??"));
  }
});

test("immutable names are deterministic and change with code or source-map bytes", async () => {
  const name = async (runtime: string) => immutableRuntimeAsset(await bundlePreviewRuntime({ entry: fixture(runtime).entry, minify: true, sourcemap: "external", target }));
  const runtime = "(function () { globalThis.output = 1; })();\n";
  const original = await name(runtime);
  assert.equal((await name(runtime)).fileName, original.fileName);
  const changedCode = await name(runtime.replace("= 1", "= 2"));
  assert.notEqual(changedCode.fileName, original.fileName);
  const changedMap = await name(`// readable comment\n${runtime}`);
  assert.equal(changedMap.code.split("//#")[0], original.code.split("//#")[0]);
  assert.notEqual(changedMap.fileName, original.fileName);
});

test("the dev bundle is kept until a bundled file changes, and a failed build is not kept", async () => {
  const { entry, write } = fixture(usesRule);
  const bundle = devRuntimeBundle(entry, target);
  const [first, again] = await Promise.all([bundle(), bundle()]);
  assert.equal(first, again);
  assert.equal(run(first, 1), 2);
  assert.equal(await bundle(), first);
  // An edit to the imported rule, not the entry, rebuilds.
  const later = (path: string, seconds: number) => utimesSync(path, new Date(Date.now() + seconds * 1000), new Date(Date.now() + seconds * 1000));
  later(write("rule.ts", "export const rule = (n: number): number => n + 2;\n"), -60);
  assert.equal(run(await bundle(), 1), 3);
  later(write("rule.ts", "export const rule = (n: number): number => ;\n"), -30);
  await assert.rejects(bundle());
  await assert.rejects(bundle());
  later(write("rule.ts", "export const rule = (n: number): number => n + 3;\n"), -10);
  assert.equal(run(await bundle(), 1), 4);
});

test("the Vite dev server answers the runtime's URL with the bundle, uncached", async () => {
  const vite = await createServer({ configFile: false, root, logLevel: "silent", plugins: [previewRuntime()], server: { middlewareMode: true, ws: false } });
  const http = createHttpServer(vite.middlewares);
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  try {
    const response = await fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/src/components/native-preview-runtime.js?v=1`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/javascript/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    const code = await response.text();
    assert.doesNotThrow(() => new Script(code));
    assert.match(code, /function canvasGesture\(gesture, at\)/);
  } finally {
    await new Promise((done) => http.close(done));
    await vite.close();
  }
});
