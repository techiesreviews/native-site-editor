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
  // An import left in would be a SyntaxError in a classic script. Run in a
  // context with no DOM, it gets as far as its first DOM read.
  assert.throws(() => new Script(runtime.code).runInNewContext({}), (error: Error) => error.name === "ReferenceError" && !/import|export/.test(error.message));
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
  // Edits dated in the past, each earlier than the last: an mtime that changes, never one during a build.
  const later = (path: string, seconds: number) => utimesSync(path, new Date(Date.now() + seconds * 1000), new Date(Date.now() + seconds * 1000));
  const [first, again] = await Promise.all([bundle(), bundle()]);
  assert.equal(first, again);
  assert.equal(run(first, 1), 2);
  assert.equal(await bundle(), first);
  // Asked again and again while one build runs, they all wait for that one.
  later(write("rule.ts", "export const rule = (n: number): number => n + 5;\n"), -90);
  const during = await Promise.all([bundle(), bundle(), bundle()]);
  assert.equal(new Set(during).size, 1);
  assert.equal(run(during[0], 1), 6);
  // An edit to the imported rule, not the entry, rebuilds.
  later(write("rule.ts", "export const rule = (n: number): number => n + 2;\n"), -60);
  assert.equal(run(await bundle(), 1), 3);
  later(write("rule.ts", "export const rule = (n: number): number => ;\n"), -30);
  await assert.rejects(bundle());
  await assert.rejects(bundle());
  later(write("rule.ts", "export const rule = (n: number): number => n + 3;\n"), -10);
  assert.equal(run(await bundle(), 1), 4);
  // A bundled file that is gone is never fresh.
  rmSync(join(entry, "../rule.ts"));
  await assert.rejects(bundle());
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

test("the page picture is its own classic script with the asePicture global, left out of the runtime", async () => {
  const picture = await bundlePreviewRuntime({ entry: join(root, "src/agent-picture.ts"), minify: true, sourcemap: "external", target, globalName: "asePicture" });
  const context: { asePicture?: { paintPicture?: unknown } } = {};
  new Script(picture.code).runInNewContext(context);
  assert.equal(typeof context.asePicture?.paintPicture, "function");
  assert.match(immutableRuntimeAsset(picture, "agent-picture").fileName, /^agent-picture-[\da-f]{12}\.js$/);
  // Boot loads the runtime in every preview; the painter only loads in a picture's measuring frame.
  const runtime = await bundlePreviewRuntime({ entry, minify: true, sourcemap: "external", target });
  assert.ok(!runtime.inputs.includes(join(root, "src/agent-picture.ts")));
});

test("the Vite dev server answers the picture's URL with its bundle", async () => {
  const vite = await createServer({ configFile: false, root, logLevel: "silent", plugins: [previewRuntime()], server: { middlewareMode: true, ws: false } });
  const http = createHttpServer(vite.middlewares);
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  try {
    const response = await fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/src/agent-picture.ts`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/javascript/);
    const context: { asePicture?: { paintPicture?: unknown } } = {};
    new Script(await response.text()).runInNewContext(context);
    assert.equal(typeof context.asePicture?.paintPicture, "function");
  } finally {
    await new Promise((done) => http.close(done));
    await vite.close();
  }
});

test("the editor's page loads the early reads (src/boot-early.ts) first, as a classic script the dev server bundles", async () => {
  const vite = await createServer({ configFile: false, root, logLevel: "silent", plugins: [previewRuntime()], server: { middlewareMode: true, ws: false } });
  const http = createHttpServer(vite.middlewares);
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  try {
    const page = await vite.transformIndexHtml("/index.html", readFileSync(join(root, "index.html"), "utf8"));
    // The page asks for the session and the listing first, ahead of the editor's own files; the early script takes them.
    assert.match(page, /<head>\s*<link rel="preload" as="fetch" crossorigin="use-credentials" href="\/api\/session">\s*<link rel="preload" as="fetch" crossorigin="use-credentials" href="\/api\/repositories">\s*<script src="\/src\/boot-early\.ts" async fetchpriority="high" data-runtime="\/src\/components\/native-preview-runtime\.js"><\/script>/);
    for (const other of ["live.html", "preview-visit.html"])
      assert.doesNotMatch(await vite.transformIndexHtml(`/${other}`, readFileSync(join(root, other), "utf8")), /boot-early/, other);
    const response = await fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/src/boot-early.ts`);
    assert.equal(response.status, 200);
    const code = await response.text();
    assert.doesNotMatch(code, /^\s*import /m, "no module imports: one classic script");
    // Run where the boot has already claimed the reads: it asks for nothing.
    const context = { aseEarlyReads: {}, fetch: () => { throw new Error("asked"); } };
    new Script(code).runInNewContext(context);
    assert.deepEqual(context.aseEarlyReads, {});
  } finally {
    await new Promise((done) => http.close(done));
    await vite.close();
  }
});

test("the build's early reads script asks the session, the listing, the address's snapshot and the preview runtime", async () => {
  const bundle = await bundlePreviewRuntime({ entry: join(root, "src/boot-early.ts"), minify: true, sourcemap: "external", target });
  const asked: string[] = [];
  const context: Record<string, unknown> = {
    location: { hash: "#repo=501&branch=main" },
    localStorage: { getItem: () => JSON.stringify({ login: "lex", repoId: 501, fullName: "lex/site", branch: "main", commit: "a".repeat(40), files: [] }), removeItem: () => {} },
    fetch: (url: string) => { asked.push(url); return new Promise(() => {}); },
    URLSearchParams, AbortController, Promise, JSON, Array, Number,
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms), clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  };
  const head: { rel: string; as: string; href: string }[] = [];
  context.document = {
    currentScript: { dataset: { runtime: "/assets/native-preview-runtime-0.js" } },
    head: { append: (link: { rel: string; as: string; href: string }) => head.push(link) },
    createElement: () => ({}),
  };
  context.Object = Object;
  context.globalThis = context;
  new Script(bundle.code).runInNewContext(context);
  assert.deepEqual(asked, ["/api/session", "/api/repositories", "/api/snapshot?repo=lex%2Fsite&branch=main"]);
  assert.deepEqual(head.map(({ rel, as, href }) => ({ rel, as, href })), [{ rel: "preload", as: "script", href: "/assets/native-preview-runtime-0.js" }], "the preview runtime its tag names");
  assert.match(immutableRuntimeAsset(bundle, "boot-early").fileName, /^boot-early-[\da-f]{12}\.js$/);
});
