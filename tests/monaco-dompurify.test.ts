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

const vendored = /monaco-editor[\\/]esm[\\/]vs[\\/]base[\\/]browser[\\/]dompurify[\\/]dompurify\.js$/;

test("a real build and the dev pre-bundle ship the installed DOMPurify, not Monaco's copy", async () => {
  const { rolldown } = await import("rolldown");
  const { build } = await import("vite");
  const output = await build({ configFile: false, logLevel: "silent", plugins: [config.plugins],
    build: { write: false, rolldownOptions: { input: sanitizer } } });
  const built = [output].flat().flatMap(result => "output" in result ? result.output : [])
    .flatMap(chunk => chunk.type === "chunk" ? chunk.moduleIds : []);
  const bundle = await rolldown({ input: sanitizer, plugins: config.optimizeDeps?.rolldownOptions?.plugins, logLevel: "silent" });
  const prebundled = (await bundle.generate()).output.flatMap(chunk => chunk.type === "chunk" ? chunk.moduleIds : []);
  await bundle.close();
  for (const [where, ids] of [["build", built], ["pre-bundle", prebundled]] as const) {
    assert.ok(ids.includes(dompurifyEntry), `${where} lacks ${dompurifyEntry}`);
    assert.ok(!ids.some(id => vendored.test(id)), `${where} still holds Monaco's vendored DOMPurify`);
  }
});

test("every locked MCP server SDK is past the high advisories", () => {
  // @modelcontextprotocol/server 2.0.0 - 2.2.0 is high (GHSA-jm63-cq47-j5jp, GHSA-46jr-4wx8-v453, GHSA-rvq5-wwqv-78pq).
  const lock = JSON.parse(readFileSync(fileURLToPath(new URL("../package-lock.json", import.meta.url)), "utf8")) as
    { packages: Record<string, { version?: string }> };
  const servers = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/@modelcontextprotocol\/server$/.test(path));
  assert.ok(servers.length > 0, "no @modelcontextprotocol/server in package-lock.json");
  for (const [path, { version = "" }] of servers) {
    const [major, minor] = version.split(".").map(Number);
    // A 2.3.0 pre-release sorts before the fix.
    assert.ok(major > 2 || (major === 2 && (minor > 3 || (minor === 3 && !version.includes("-")))), `${path} is ${version}; it must be 2.3.0 or later`);
  }
});
