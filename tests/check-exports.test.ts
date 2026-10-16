import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { exportsInFiles, checkExports } from "../scripts/check-exports.mjs";

const globals = `
interface PromiseLike<T> { then<TResult>(onfulfilled: (value: T) => TResult | PromiseLike<TResult>): PromiseLike<TResult> }
interface Promise<T> extends PromiseLike<T> {}
declare const Promise: { all<T extends readonly unknown[]>(values: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> };
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
`;
const fixture = (files: Record<string, string>, roots?: string[]) => exportsInFiles({ "globals.d.ts": globals, ...files }, roots);

test("named and default imports and own-module production references count", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import greeting, { live as renamed } from "./values"; renamed(); greeting();',
    "src/values.ts": 'export function live() {}\nexport default function greeting() {}\nexport const dead = 1;\nconsole.log(dead);',
  }), []);
});

for (const { form, declaration, name } of [
  { form: "inline", declaration: "export const x = 1;", name: "x" },
  { form: "local clause", declaration: "const x = 1; export { x };", name: "x" },
  { form: "aliased local clause", declaration: "const x = 1; export { x as value };", name: "value" },
]) {
  test(`${form} exports count same-module uses`, () => {
    assert.deepEqual(fixture({ "src/main.ts": `${declaration} console.log(x);` }), []);
  });

  test(`${form} exports without same-module uses report findings`, () => {
    assert.deepEqual(fixture({ "src/main.ts": declaration }), [{ file: "src/main.ts", line: 1, name }]);
  });
}

test("tests-only and unreachable production imports do not count; unreachable files report once", () => {
  assert.deepEqual(fixture({
    "src/main.ts": "export {};",
    "src/values.ts": "export const seam = 1;",
    "tests/values.test.ts": 'import { seam } from "../src/values";',
    "src/orphan.ts": 'import { seam } from "./values"; export const orphan = seam;',
  }), [
    { file: "src/orphan.ts", line: 1, name: "(file unreachable)" },
    { file: "src/values.ts", line: 1, name: "(file unreachable)" },
  ]);
});

test("namespace access uses checker identity, including literal keys and shadowed names", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import * as module from "./values"; module.live; module["key"]; function other(module: { dead: number }) { return module.dead; }',
    "src/values.ts": "export const live = 1, key = 2, dead = 3;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("dynamic module members and destructuring count without consuming the whole module", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'const module = await import("./values"); module.live; (await import("./values")).direct; const { destructured: renamed } = await import("./values");',
    "src/values.ts": "export const live = 1, direct = 2, destructured = 3, dead = 4;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("inferred lazy loaders, Promise.all tuples and then callbacks preserve module identity", () => {
  assert.deepEqual(fixture({
    "src/main.ts": [
      'function lazy<T>(load: () => Promise<T>) { return load; }',
      'const load = lazy(() => import("./values")); (await load()).lazy;',
      'const [{ tuple: renamed }] = await Promise.all([import("./values")] as const);',
      'import("./values").then(module => module.callback);',
    ].join("\n"),
    "src/values.ts": "export const lazy = 1, tuple = 2, callback = 3, dead = 4;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("type-only namespaces and destructured module parameters consume exact names", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import type * as types from "./values"; type T = types.Named; function use({ value }: typeof import("./values")) { return value; }',
    "src/values.ts": "export interface Named {}\nexport const value = 1, dead = 2;",
  }), [{ file: "src/values.ts", line: 2, name: "dead" }]);
});

test("only consumed names propagate through named, star and local re-export chains", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import { renamed } from "./outer";',
    "src/outer.ts": 'export { live as renamed, dead } from "./middle";',
    "src/middle.ts": 'export * from "./inner";',
    "src/inner.ts": 'export { live, dead } from "./values";',
    "src/values.ts": "export const live = 1, dead = 2;",
  }), [
    { file: "src/inner.ts", line: 1, name: "dead" },
    { file: "src/outer.ts", line: 1, name: "dead" },
    { file: "src/values.ts", line: 1, name: "dead" },
  ]);
  assert.deepEqual(fixture({
    "src/main.ts": 'import { alias } from "./barrel";',
    "src/barrel.ts": 'import { value } from "./values"; export { value as alias };',
    "src/values.ts": "export const value = 1;",
  }), []);
});

test("unused re-export cycles do not count as users", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import "./a";',
    "src/a.ts": 'export { value } from "./b";',
    "src/b.ts": 'export * from "./a"; export { value } from "./values";',
    "src/values.ts": "export const value = 1;",
  }), [
    { file: "src/a.ts", line: 1, name: "value" },
    { file: "src/b.ts", line: 1, name: "value" },
    { file: "src/values.ts", line: 1, name: "value" },
  ]);
});

test("namespace re-exports and default re-export chains retain exact consumed names", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import * as barrel from "./barrel"; barrel.tools.live; barrel.default;',
    "src/barrel.ts": 'export * as tools from "./values"; export { default } from "./middle";',
    "src/middle.ts": 'export { default } from "./values";',
    "src/values.ts": "export default 1; export const live = 2, dead = 3;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("star barrels produce no per-name findings; declarations still report", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import "./barrel";',
    "src/barrel.ts": 'export * from "./a";\nexport * from "./b";',
    "src/a.ts": "export const first = 1;",
    "src/b.ts": "export const second = 2; export default 3;",
  }), [
    { file: "src/a.ts", line: 1, name: "first" },
    { file: "src/b.ts", line: 1, name: "default" },
    { file: "src/b.ts", line: 1, name: "second" },
  ]);
});

test("type imports, import queries, indexed access and Pick consume exact names", () => {
  assert.deepEqual(fixture({
    "src/main.ts": [
      'import type { Named } from "./types";',
      'type Query = import("./types").Query;',
      'type Value = typeof import("./types").value;',
      'type Indexed = typeof import("./types")["indexed"];',
      'type Selected = Pick<typeof import("./types"), "picked" | "alsoPicked">;',
    ].join("\n"),
    "src/types.ts": "export interface Named {}\nexport interface Query {}\nexport const value = 1, indexed = 2, picked = 3, alsoPicked = 4, dead = 5;",
  }), [{ file: "src/types.ts", line: 3, name: "dead" }]);
});

test("side-effect imports and bare typeof import do not consume exported names", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import "./values"; type Module = typeof import("./values");',
    "src/values.ts": "export default 1; export const dead = 2;",
  }), [
    { file: "src/values.ts", line: 1, name: "dead" },
    { file: "src/values.ts", line: 1, name: "default" },
  ]);
});

test("URL worker roots, JS URL targets and config inputs contribute production uses", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'new Worker(new URL("./background.ts", import.meta.url)); new URL("./runtime.js", import.meta.url);',
    "src/background.ts": 'import { workerUse } from "../shared/values";',
    "src/runtime.js": 'import { runtimeUse } from "../shared/values";',
    "vite.config.ts": 'import { plugin } from "./vite-plugin"; plugin();',
    "vite-plugin.ts": 'import { configUse } from "./shared/values"; export function plugin() { return configUse; }',
    "shared/values.ts": "export const workerUse = 1, runtimeUse = 2, configUse = 3, dead = 4;",
  }, ["src/main.ts", "vite.config.ts"]), [{ file: "shared/values.ts", line: 1, name: "dead" }]);
});

test("new URL targets must use import.meta.url; strings and other bases are ignored", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'new URL("./orphan.ts", location.href); const text = \'import("./orphan")\';',
    "src/orphan.ts": 'import { dead } from "./values";',
    "src/values.ts": "export const dead = 1;",
  }), [
    { file: "src/orphan.ts", line: 1, name: "(file unreachable)" },
    { file: "src/values.ts", line: 1, name: "(file unreachable)" },
  ]);
});

test("allow entries require a reason and match only the specified file and name", () => {
  const findings = [{ file: "src/a.ts", line: 1, name: "seam" }, { file: "src/b.ts", line: 1, name: "seam" }];
  assert.deepEqual(checkExports(findings, [{ file: "src/a.ts", name: "seam", reason: "Deliberate test seam." }]), [findings[1]]);
  for (const reason of [undefined, "", "  "]) {
    const failures = checkExports(findings, [{ file: "src/a.ts", name: "seam", reason }]);
    assert.match(failures[0].name, /requires file, name and reason/);
    assert.deepEqual(failures.slice(1), findings);
  }
  assert.match(checkExports([], {})[0].name, /must be an array/);
});

test("stale allow entries fail even when the module still exists", () => {
  for (const findings of [[], [{ file: "src/a.ts", line: 1, name: "different" }]]) {
    const failures = checkExports(findings, [{ file: "src/a.ts", name: "seam", reason: "Deliberate test seam." }]);
    assert.match(failures[0].name, /stale allow entry/);
  }
});


test("test-only callers do not rescue exports in reachable modules", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import "./values";',
    "src/values.ts": "export function onlyTests() {}",
    "tests/values.test.ts": 'import { onlyTests } from "../src/values"; onlyTests();',
  }), [{ file: "src/values.ts", line: 1, name: "onlyTests" }]);
});

test("recursive references and local export clauses do not count as use", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import "./values";',
    "src/values.ts": [
      "export function recursive() { recursive(); }",
      "const value = 1; export { value };",
      "function local() { local(); } export { local };",
      "function aliased() { aliased(); } export { aliased as renamed };",
    ].join("\n"),
  }), [
    { file: "src/values.ts", line: 1, name: "recursive" },
    { file: "src/values.ts", line: 2, name: "value" },
    { file: "src/values.ts", line: 3, name: "local" },
    { file: "src/values.ts", line: 4, name: "renamed" },
  ]);
});

test("dynamic imports through star barrels consume original declarations", () => {
  assert.deepEqual(fixture({
    "src/main.ts": '(await import("./code-editor")).foo();',
    "src/code-editor.ts": 'export * from "./source-editor";',
    "src/source-editor.ts": "export function foo() {} export const dead = 1;",
  }), [{ file: "src/source-editor.ts", line: 1, name: "dead" }]);
});

test("unreachable files without exports report once", () => {
  assert.deepEqual(fixture({
    "src/main.ts": "export {};",
    "src/orphan.ts": "console.log('orphan');",
  }), [{ file: "src/orphan.ts", line: 1, name: "(file unreachable)" }]);
});

test("module members passed through typed production ports count", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import * as api from "./values"; function use(port: { editor: { live(): void } }) { port.editor.live(); } use({ editor: api });',
    "src/values.ts": "export function live() {} export const dead = 1;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("local references include named defaults and shorthand properties", () => {
  assert.deepEqual(fixture({
    "src/main.ts": "export default function named() {} named(); export const value = 1; console.log({ value });",
  }), []);
});

test("optional controller getters consume only their typed module members", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import * as api from "./values"; function use(port: { editor(): { live(): void } | undefined }) { port.editor()?.live(); } use({ editor: () => api });',
    "src/values.ts": "export function live() {} export const dead = 1;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("passing a whole module with its own inferred type does not consume every export", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'import * as api from "./values"; function use(port: { editor: typeof api }) { port.editor.live(); } use({ editor: api });',
    "src/values.ts": "export function live() {} export const dead = 1;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});

test("async module loaders assigned to typed ports consume their required members", () => {
  assert.deepEqual(fixture({
    "src/main.ts": 'const load = () => import("./values"); function use(port: { load(): Promise<{ live(): void }> }) {} use({ load });',
    "src/values.ts": "export function live() {} export const dead = 1;",
  }), [{ file: "src/values.ts", line: 1, name: "dead" }]);
});
