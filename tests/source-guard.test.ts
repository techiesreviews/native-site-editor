import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyse, bindingKey, finding, isPlanMethod, modulePath, moduleReferences, nameFindings,
  parse, plansOf, refers, staleEntries, ts, unallowed, walk, type AllowlistEntry,
} from "./support/source-guard.ts";

const FILE = "src/controllers/fixture.ts";
const protectedNames = new Set(["forbidden"]);
const names = (source: string) => nameFindings(source, FILE, "name", name => protectedNames.has(name));
const modules = (source: string) => moduleReferences(parse(source, FILE))
  .filter(ref => modulePath(ref.module, FILE) === "src/protected")
  .map(ref => finding(ref.node.getSourceFile(), ref.node, "module"));

const loopholes = {
  "renamed import": 'import { forbidden as alias } from "../protected"; alias();',
  "alias chain": 'const first = forbidden; const second = first; second();',
  "destructured name": 'const { forbidden: alias } = api; alias();',
  "computed destructured name": 'const { ["forbidden"]: alias } = api; alias();',
  "template destructured name": 'const { [`forbidden`]: alias } = api; alias();',
  "nested destructured name": 'const { nested: { forbidden: alias } } = api; alias();',
  "re-export": 'export { forbidden as alias } from "../protected";',
  "namespace member": 'import * as api from "../protected"; api.forbidden();',
  "computed member": 'api["forbidden"]();',
  "template member": 'api[`forbidden`]();',
  "optional member": 'api?.["forbidden"]?.();',
  "asserted member": '(api["forbidden"] as Function)!();',
  "bound method": 'const alias = api.forbidden.bind(api); alias();',
  "template interpolation code": 'const text = `result: ${forbidden()}`;',
};
for (const [loophole, source] of Object.entries(loopholes)) test(`source guard closes ${loophole}`, () => {
  const hits = names(source);
  assert.ok(hits.length, source);
  assert.ok(hits.every(hit => hit.file === FILE && hit.line === 1 && hit.text));
  if (source.includes("alias();")) assert.ok(hits.some(hit => hit.text === "alias"), "the aliased use also counts");
});
for (const [loophole, source] of Object.entries({
  "side-effect import": 'import "../protected";',
  "default import": 'import api from "../protected";',
  "namespace import": 'import * as api from "../protected";',
  "star re-export": 'export * from "../protected";',
  "namespace re-export": 'export * as api from "../protected";',
  "named re-export": 'export { value as alias } from "../protected";',
  "dynamic import": 'await import("../protected.ts");',
  "template import": 'await import(`../protected.js`);',
})) test(`source guard closes ${loophole}`, () => assert.equal(modules(source).length, 1));

test("source guard respects shadowing, type positions, declaration names and literal text", () => {
  const source = 'import { forbidden as alias } from "../protected"; function f(alias) { alias(); }';
  assert.equal(names(source).filter(hit => hit.text === "alias").length, 0);
  for (const safe of [
    'import type { forbidden } from "../protected"; type F = typeof forbidden;',
    'export { type forbidden } from "../protected";',
    'const object = { forbidden: true }; function forbidden() {}',
    '// forbidden();\nconst text = "forbidden"; const template = `forbidden()`;',
  ]) assert.deepEqual(names(safe), [], safe);
  for (const safe of ['import type * as api from "../protected";', 'export type * from "../protected";', 'import { type X } from "../protected";'])
    assert.deepEqual(modules(safe), []);
  assert.equal(names('const alias = forbidden(); consume(alias);').filter(hit => hit.text === "alias").length, 0, "returned values are not functions");
});

test("source guard follows transitive and recursive helpers without leaking between shadowed scopes", () => {
  const source = 'function a() { b(); return forbidden(); } function b() { a(); } function safe(b) { b(); } b();';
  const { tree, checker } = analyse(source, FILE);
  const hits: string[] = [];
  walk(tree, node => { if (refers(checker, node, protectedNames)) hits.push(node.getText(tree)); });
  assert.equal(hits.filter(text => text === "b").length, 2);
});

test("source guard resolves guarded methods and inline, conditional and factory plans once", () => {
  for (const method of [
    'edits.run', 'ports.edits[`now`]', '(edits.run as Function)', 'edits.run.bind(edits)',
  ]) {
    const { tree, checker } = analyse(`${method}(r => forbidden());`, FILE);
    let seen = false;
    walk(tree, node => { if (ts.isCallExpression(node) && isPlanMethod(checker, node.expression)) seen = true; });
    assert.ok(seen, method);
  }
  const source = 'const { edits: queue } = ports; const { ["now"]: first } = queue; const second = first; function factory() { return ready ? r => forbidden() : r => r.source(path); } second(factory());';
  const { tree, checker } = analyse(source, FILE);
  let plans = 0;
  walk(tree, node => {
    if (ts.isCallExpression(node) && isPlanMethod(checker, node.expression)) plans += plansOf(checker, node.arguments[0])?.length ?? 0;
  });
  assert.equal(plans, 2);
  walk(tree, node => { if (ts.isBindingElement(node) && node.name.getText(tree) === "first") assert.equal(bindingKey(node), "now"); });
});

test("source guard rejects unused, over-counted, invalid and unreasoned allowlist entries", () => {
  const hits = names("forbidden();");
  const entry: AllowlistEntry = { file: FILE, match: "forbidden", reason: "Fixture exception.", count: 1 };
  assert.deepEqual(unallowed(hits, [entry]), []);
  assert.deepEqual(staleEntries(hits, [entry]), []);
  for (const changed of [[], [...hits, ...hits]]) assert.deepEqual(staleEntries(changed, [entry]), [entry]);
  assert.deepEqual(staleEntries([...hits, ...hits], [{ ...entry, count: 2 }]), []);
  for (const count of [0, -1, 1.5]) assert.equal(staleEntries(hits, [{ ...entry, count }]).length, 1);
  assert.equal(staleEntries(hits, [{ ...entry, reason: " " }]).length, 1);
  assert.deepEqual(unallowed(hits, [{ ...entry, file: "src/other.ts" }]), hits);
  assert.deepEqual(unallowed(hits, [{ ...entry, match: { rule: "other", function: "<top-level>" } }]), hits);
});

test("source guard resolves creators from renamed, namespaced and dynamic module bindings", async () => {
  const { importedFrom } = await import("./support/source-guard.ts");
  for (const source of [
    'import { create as factory } from "../protected"; factory();',
    'import * as namespace from "../protected"; const alias = namespace; alias.create();',
    'const namespace = await import(`../protected`); namespace["create"]();',
    'const { create: factory } = await import("../protected"); factory();',
  ]) {
    const { tree, checker } = analyse(source, FILE);
    let found = false;
    walk(tree, node => { if (ts.isCallExpression(node) && importedFrom(checker, node.expression, "create", module => module === "../protected")) found = true; });
    assert.ok(found, source);
  }
  const { tree, checker } = analyse('import { create } from "../other"; function f(create) { create(); }', FILE);
  walk(tree, node => { if (ts.isCallExpression(node)) assert.equal(importedFrom(checker, node.expression, "create", module => module === "../protected"), false); });
});
