// The "Async writers" rule (CODING_STANDARDS.md) checked instead of remembered (TOOLS-331, sweep 2026-11-17 item 2):
// a module whose async function waits and then writes needs a test that imports it and calls `forEachAwait`
// (tests/support/await-race.ts), the standard race test. The check is per module: a new wait-then-write in a module
// that already has such a test passes here, and its own race test is the review's to ask for.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, posix } from "node:path";
import { test } from "node:test";
import type * as TS from "typescript-eslint-api/node_modules/typescript";

// Reuse the TS 6 parser already installed for lint and the guard tests.
const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");
const root = new URL("../", import.meta.url);

/** The calls that write, by the files they are made in. Anywhere: the editor's guarded edits and draft writes. In the
 * Inbox, also each port that changes the site, the editor or a row's state: Media's Decorative, a request to the agent
 * or letting one go, a fix's write, Page settings, Edit component mode, a selection, and a row's state. */
const writes: readonly { files: RegExp; call: RegExp; text: RegExp }[] = [
  { files: /^src\//, call: /(?:^|\.)edits\.(?:run|now)$/, text: /\bedits\b/ },
  { files: /^src\//, call: /(?:^|\.)(?:drafts\.store|draftStore)\.(?:save|remove|put|delete|write)$/, text: /\b(?:store|draftStore)\b/ },
  { files: /^src\/inbox\//, call: /(?:^|\.)(?:describe|ask|dismiss|write|pageDetails|editComponent|select|set)$/, text: /\w/ },
];

/** Modules that waited and then wrote with no race test when this check came in (2026-11-17), each with why it may
 * wait; an entry that gets its race test, or stops waiting before a write, fails until it is taken out. */
const known: Readonly<Record<string, string>> = {
  "src/page-builder/media-move-recheck.ts": "re-checks current() after each await and hands it to the edit as its guard; tested in tests/media-move-recheck.test.ts without forEachAwait",
};

interface Finding { file: string; line: number; wait: number; write: string; writeLine: number }

const isFunction = (node: TS.Node): node is TS.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
  || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node);
const isAsync = (node: TS.FunctionLikeDeclaration) => Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword));

/** Every async function in `text` that waits and then writes, at its first such write. A callback inside it counts as
 * its own code; an async function inside it is judged on its own. */
function waitThenWrite(file: string, text: string): Finding[] {
  // Only a file that waits and names a write is parsed (most of src does not).
  const kinds = writes.filter(write => write.files.test(file) && write.text.test(text)).map(write => write.call);
  if (!kinds.length || !/\bawait\b/.test(text)) return [];
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineOf = (at: number) => tree.getLineAndCharacterOfPosition(at).line + 1;
  const found: Finding[] = [];
  const judge = (fn: TS.FunctionLikeDeclaration) => {
    const waits: number[] = [];
    const calls: { at: number; name: string }[] = [];
    const visit = (node: TS.Node) => {
      if (node !== fn && isFunction(node) && isAsync(node)) return;
      if (ts.isAwaitExpression(node)) waits.push(node.getEnd());
      if (ts.isForOfStatement(node) && node.awaitModifier) waits.push(node.expression.getEnd());
      if (ts.isCallExpression(node)) calls.push({ at: node.getStart(tree), name: node.expression.getText(tree).replace(/\s+|\?/g, "") });
      ts.forEachChild(node, visit);
    };
    if (fn.body) ts.forEachChild(fn.body, visit);
    if (!waits.length) return;
    const first = Math.min(...waits);
    const write = calls.filter(call => call.at >= first && kinds.some(kind => kind.test(call.name))).sort((a, b) => a.at - b.at)[0];
    if (write) found.push({ file, line: lineOf(fn.getStart(tree)), wait: lineOf(first), write: write.name, writeLine: lineOf(write.at) });
  };
  const walk = (node: TS.Node) => {
    if (isFunction(node) && isAsync(node)) judge(node);
    ts.forEachChild(node, walk);
  };
  walk(tree);
  return found;
}

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(new URL(`${dir}/`, root), { recursive: true, encoding: "utf8" })
    .map(name => `${dir}/${name.replaceAll("\\", "/")}`)
    .filter(keep);
}

/** The modules a test imports (static, re-exported or `import("…")` with a plain string), as repo paths. */
function imported(test: string, text: string): string[] {
  const tree = ts.createSourceFile(test, text, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: TS.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return specifiers.filter(path => path.startsWith(".")).map(path => posix.normalize(posix.join(dirname(test), path)).replace(/\.(?:js|ts)$/, "") + ".ts");
}

test("the check finds an await before a write, in the function that waits", () => {
  const inbox = "src/inbox/example.ts";
  assert.deepEqual(waitThenWrite("src/x.ts", "async function save(ports) {\n  const text = await ports.read();\n  ports.edits.run(() => text);\n}"),
    [{ file: "src/x.ts", line: 1, wait: 2, write: "ports.edits.run", writeLine: 3 }]);
  // The write itself awaited, with nothing written after it, is no wait before a write.
  assert.deepEqual(waitThenWrite("src/x.ts", "async function save(ports) { await ports.edits.run(() => 1); }"), []);
  // A write before the first wait, a sync function and a write in a file outside the rule's folders are not either.
  assert.deepEqual(waitThenWrite("src/x.ts", "async function save(ports) { ports.edits.now(() => 1); await ports.later(); }"), []);
  assert.deepEqual(waitThenWrite("src/x.ts", "function save(ports) { ports.edits.now(() => 1); }"), []);
  assert.deepEqual(waitThenWrite("shared/x.ts", "async function save(ports) { await ports.read(); ports.edits.run(() => 1); }"), []);
  // A callback after the wait is the function's own code; a nested async function is judged on its own.
  assert.equal(waitThenWrite("src/x.ts", "async function save(ports) { await ports.read(); [1].forEach(() => ports.drafts.store.save(1)); }").length, 1);
  assert.deepEqual(waitThenWrite("src/x.ts", "async function outer(ports) { await ports.read(); return async () => { ports.edits.run(() => 1); }; }"), []);
  assert.equal(waitThenWrite("src/x.ts", "const save = async (ports) => { for await (const part of ports.parts()) ports.edits.run(() => part); };").length, 1);
  // The Inbox's own writes count only in the Inbox.
  assert.equal(waitThenWrite(inbox, "async function go(ports) { await ports.open(); ports.pageDetails(); }").length, 1);
  assert.deepEqual(waitThenWrite("src/x.ts", "async function go(ports) { await ports.open(); ports.pageDetails(); }"), []);
  assert.equal(waitThenWrite(inbox, "class A { async ask(link) { await link.ready(); states.set(1, 2); } }").length, 1);
});

test("every module that waits and then writes has the standard race test (forEachAwait)", () => {
  const sources = files("src", path => path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.endsWith(".d.ts"));
  const tests = [...files("tests", path => path.endsWith(".test.ts")), ...files("src", path => path.endsWith(".test.ts"))];
  const raced = new Set(tests.flatMap(test => {
    const text = readFileSync(new URL(test, root), "utf8");
    return /\bforEachAwait\s*\(/.test(text) ? imported(test, text) : [];
  }));
  const findings = sources.flatMap(file => waitThenWrite(file, readFileSync(new URL(file, root), "utf8")));
  const waiting = new Set(findings.map(finding => finding.file));
  const missing = findings.filter(finding => !raced.has(finding.file) && !Object.hasOwn(known, finding.file));
  assert.deepEqual(missing.map(finding => `${finding.file}:${finding.line}: waits (line ${finding.wait}) and then writes ${finding.write} (line ${finding.writeLine}) with no test that imports this module and calls forEachAwait (tests/support/await-race.ts; CODING_STANDARDS.md "Async writers")`), []);
  const stale = Object.keys(known).filter(file => raced.has(file) || !waiting.has(file));
  assert.deepEqual(stale.map(file => `${file}: take it out of \`known\` in tests/await-race-guard.test.ts (${raced.has(file) ? "it has its race test now" : "it no longer waits before a write"})`), []);
});
