import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, ts, walk, type TS } from "./support/source-guard.ts";

const CEILING = 1720;

function checkCeiling(count: number, ceiling: number): void {
  assert.ok(count <= ceiling, `src/main.ts has ${count} lines, above the ceiling of ${ceiling}`);
  assert.ok(ceiling - count < 50, `src/main.ts has ${count} lines; lower the ceiling to ${Math.ceil(count / 10) * 10}`);
}

test("src/main.ts stays within its line ceiling and records shrinking progress", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const count = source.split("\n").length - Number(source.endsWith("\n"));
  checkCeiling(count, CEILING);
});

test("a count above the ceiling fails naming the count and ceiling", () => {
  assert.throws(() => checkCeiling(1001, 1000), {
    message: "src/main.ts has 1001 lines, above the ceiling of 1000",
  });
});

test("the ceiling and counts up to 49 lines under pass", () => {
  for (const count of [1000, 999, 951]) assert.doesNotThrow(() => checkCeiling(count, 1000));
});

test("a count exactly 50 lines under fails naming the suggested ceiling", () => {
  assert.throws(() => checkCeiling(950, 1000), {
    message: "src/main.ts has 950 lines; lower the ceiling to 950",
  });
});

test("larger reductions suggest the count rounded up to a multiple of 10", () => {
  for (const count of [949, 941, 940]) {
    assert.throws(() => checkCeiling(count, 1000), {
      message: `src/main.ts has ${count} lines; lower the ceiling to ${count === 940 ? 940 : 950}`,
    });
  }
});

// The setup, Pages & files and workspace hosts' members are consts destructured part way down main.ts, not hoisted
// functions: above that line they may only be used inside a function that runs later, and
// a hoisted function that reaches one may not be called there.
function calledOnTheSpot(fn: TS.Node): boolean {
  let callee: TS.Node = fn;
  while (ts.isParenthesizedExpression(callee.parent)) callee = callee.parent;
  return ts.isCallExpression(callee.parent) && callee.parent.expression === callee;
}

function hostMembersUsedEarly(source: string, host = "setup"): string[] {
  const tree = parse(source, "src/main.ts");
  const destructures = (item: TS.VariableDeclaration) => ts.isObjectBindingPattern(item.name) && item.initializer !== undefined && ts.isIdentifier(item.initializer) && item.initializer.text === host;
  const statement = tree.statements.find((at): at is TS.VariableStatement => ts.isVariableStatement(at) && at.declarationList.declarations.some(destructures));
  const binding = statement?.declarationList.declarations.find(destructures)?.name;
  assert.ok(statement && binding && ts.isObjectBindingPattern(binding), `main.ts destructures the ${host} host (const { … } = ${host})`);
  const line = (node: TS.Node) => tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  const before = (node: TS.Node) => node.getStart(tree) < statement.getStart(tree);
  // A name being declared, or a property of that name, is not a use.
  const declared = (node: TS.Identifier) => {
    const parent = node.parent;
    return (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node;
  };
  // The function a use waits in: a function runs later, unless it is called on the spot (`(() => …)()`).
  const waitsIn = (node: TS.Node) => {
    for (let at: TS.Node = node.parent; !ts.isSourceFile(at); at = at.parent) if (ts.isFunctionLike(at) && !calledOnTheSpot(at)) return at;
    return undefined;
  };
  // Each member, and each hoisted function that reaches one when called, by the member it reaches.
  const reaches = new Map<string, string>([[host, host], ...binding.elements.map((element) => [element.name.getText(tree), element.name.getText(tree)] as [string, string])]);
  const early = new Map<string, string>();
  for (let grew = true; grew;) {
    grew = false;
    walk(tree, (node) => {
      if (!ts.isIdentifier(node) || declared(node)) return;
      const member = reaches.get(node.text);
      if (member === undefined) return;
      const fn = waitsIn(node);
      if (fn) {
        if (ts.isFunctionDeclaration(fn) && fn.name && !reaches.has(fn.name.text)) { reaches.set(fn.name.text, member); grew = true; }
        return;
      }
      // A member (a const) may not be read at all; a hoisted function only not called.
      const called = ts.isCallExpression(node.parent) && node.parent.expression === node;
      if (before(node) && (node.text === member || called))
        early.set(`${node.text}:${line(node)}`, `${member}${node.text === member ? "" : ` via ${node.text}()`} (line ${line(node)})`);
    });
  }
  return [...early.values()];
}

test("setup, Pages & files and workspace host members are used before their destructuring only inside functions", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.deepEqual(hostMembersUsedEarly(source), []);
  assert.deepEqual(hostMembersUsedEarly(source, "pagesAndFiles"), []);
  assert.deepEqual(hostMembersUsedEarly(source, "workspace"), []);
});

test("a setup host member passed by value, called on the spot or reached through an early call above its destructuring is named", () => {
  const source = [
    "const early = { show: showGetStarted, later: () => renderLogin() };",
    "(() => startSitePanel())();",
    "(function () { takeStartingPoint(); })();",
    "function early() { inner(); } function inner() { writeStartingPoint(); } early();",
    "const later = { open: early };",
    "const setup = createSetupHost({});",
    "const answer = 1, { renderLogin, showGetStarted, startSitePanel, takeStartingPoint, writeStartingPoint } = setup;",
  ].join("\n");
  assert.deepEqual(hostMembersUsedEarly(source), ["showGetStarted (line 1)", "startSitePanel (line 2)", "takeStartingPoint (line 3)", "writeStartingPoint via early() (line 4)"]);
});

// The Pages & files and workspace hosts, the agent's commands, site loading and the text index read main.ts's `let` state when they run: such a value goes in
// as a getter (and a setter where the host writes it, as the Pages & files host's `fileGeneration` and the text index's
// `nativePreviewBehind`: a getter alone still type-checks, then throws on the first write), never as a
// copy taken when the host is made. A `const` declared after the call is not there yet when the host is made
// (CODING_STANDARDS "Module order holds"): it goes in as an arrow, never by name.
// The `let` state each factory writes through its ports, so needs a getter and a setter.
const WRITTEN: Record<string, string> = { createPagesAndFilesHost: "fileGeneration", createSiteTextIndex: "nativePreviewBehind" };
function letsHandedByValue(source: string, factory = "createPagesAndFilesHost"): string[] {
  const tree = parse(source, "src/main.ts");
  const lets = new Set<string>(), consts = new Map<string, number>();
  const bound = (name: TS.BindingName, at: number) => {
    if (ts.isIdentifier(name)) consts.set(name.text, at);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bound(element.name, at);
  };
  for (const statement of tree.statements)
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Let)
      for (const item of statement.declarationList.declarations) { if (ts.isIdentifier(item.name)) lets.add(item.name.text); }
    else if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const)
      for (const item of statement.declarationList.declarations) bound(item.name, item.getStart(tree));
  const found: string[] = [];
  let called = false;
  walk(tree, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== factory) return;
    called = true;
    const ports = node.arguments[0];
    assert.ok(ports && ts.isObjectLiteralExpression(ports), `main.ts hands ${factory} an object of ports`);
    const accessors = (kind: TS.SyntaxKind) => new Set(ports.properties.filter((item) => item.kind === kind).map((item) => item.name?.getText(tree)));
    const written = WRITTEN[factory];
    if (written && (!accessors(ts.SyntaxKind.GetAccessor).has(written) || !accessors(ts.SyntaxKind.SetAccessor).has(written))) found.push(`${written} (no getter and setter)`);
    // A group of ports (the workspace host's `site`, `builder`, …) is checked as the ports are.
    const check = (properties: TS.NodeArray<TS.ObjectLiteralElementLike>) => {
      for (const item of properties) {
        const value = ts.isShorthandPropertyAssignment(item) ? item.name : ts.isPropertyAssignment(item) ? item.initializer : undefined;
        if (value && ts.isObjectLiteralExpression(value)) check(value.properties);
        if (value && ts.isIdentifier(value) && lets.has(value.text)) found.push(`${item.name!.getText(tree)} (by value)`);
        if (value && ts.isIdentifier(value) && (consts.get(value.text) ?? -1) > node.getStart(tree)) found.push(`${item.name!.getText(tree)} (declared after)`);
      }
    };
    check(ports.properties);
  });
  assert.ok(called, `main.ts calls ${factory}`);
  return found;
}

test("main.ts hands the Pages & files and workspace hosts, the agent's commands, site loading and the text index their let state through accessors and later consts through arrows", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.deepEqual(letsHandedByValue(source), []);
  for (const factory of ["createWorkspaceMount", "createAgentCommands", "createSiteLoading", "createSiteTextIndex"]) assert.deepEqual(letsHandedByValue(source, factory), [], factory);
});

test("a const handed to the agent's commands by name before it is declared is named", () => {
  const source = [
    "const early = 1;",
    "const commands = createAgentCommands({ early, restoreFile, open: openEntry, later: (...args) => restoreFile(...args) });",
    "const { restoreFile, openEntry } = boot;",
  ].join("\n");
  assert.deepEqual(letsHandedByValue(source, "createAgentCommands"), ["restoreFile (declared after)", "open (declared after)"]);
});

test("a let or a later const handed by name inside a group of the workspace host's ports is named", () => {
  const source = [
    "let later;",
    "const workspace = createWorkspaceMount({ builder: { tools: later, drag: dragPageBlock, choose: () => after() }, site: { update: after } });",
    "function dragPageBlock() {}",
    "const after = () => {};",
  ].join("\n");
  assert.deepEqual(letsHandedByValue(source, "createWorkspaceMount"), ["tools (by value)", "update (declared after)"]);
});

test("a let handed to the agent's commands by value is named", () => {
  const source = [
    "let info = {}, componentTools, pageStructure, nativePreview;",
    "const commands = createAgentCommands({ info, tools: componentTools, get pageStructure() { return pageStructure; }, get nativePreview() { return nativePreview; } });",
  ].join("\n");
  assert.deepEqual(letsHandedByValue(source, "createAgentCommands"), ["info (by value)", "tools (by value)"]);
});

test("a let handed to the Pages & files host by value, or fileGeneration without its setter, is named", () => {
  const source = [
    "let fileGeneration = 0, files = 1, explorerDropdown = 2;",
    "const host = createPagesAndFilesHost({ fileGeneration, dropdown: explorerDropdown, get files() { return files; } });",
  ].join("\n");
  assert.deepEqual(letsHandedByValue(source), ["fileGeneration (no getter and setter)", "fileGeneration (by value)", "dropdown (by value)"]);
});

test("nativePreviewBehind handed to the text index with a getter and no setter is named", () => {
  const source = [
    "let nativePreviewBehind = false;",
    "const index = createSiteTextIndex({ get nativePreviewBehind() { return nativePreviewBehind; } });",
  ].join("\n");
  assert.deepEqual(letsHandedByValue(source, "createSiteTextIndex"), ["nativePreviewBehind (no getter and setter)"]);
  const both = source.replace("} });", "}, set nativePreviewBehind(value) { nativePreviewBehind = value; } });");
  assert.deepEqual(letsHandedByValue(both, "createSiteTextIndex"), []);
});
