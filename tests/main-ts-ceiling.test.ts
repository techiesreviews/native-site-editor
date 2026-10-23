import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, ts, walk, type TS } from "./support/source-guard.ts";

const CEILING = 4070;

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

// The setup host's members are consts destructured part way down main.ts, not hoisted
// functions: above that line they may only be used inside a function that runs later, and
// a hoisted function that reaches one may not be called there.
function calledOnTheSpot(fn: TS.Node): boolean {
  let callee: TS.Node = fn;
  while (ts.isParenthesizedExpression(callee.parent)) callee = callee.parent;
  return ts.isCallExpression(callee.parent) && callee.parent.expression === callee;
}

function setupMembersUsedEarly(source: string): string[] {
  const tree = parse(source, "src/main.ts");
  const destructures = (item: TS.VariableDeclaration) => ts.isObjectBindingPattern(item.name) && item.initializer !== undefined && ts.isIdentifier(item.initializer) && item.initializer.text === "setup";
  const statement = tree.statements.find((at): at is TS.VariableStatement => ts.isVariableStatement(at) && at.declarationList.declarations.some(destructures));
  const binding = statement?.declarationList.declarations.find(destructures)?.name;
  assert.ok(statement && binding && ts.isObjectBindingPattern(binding), "main.ts destructures the setup host (const { … } = setup)");
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
  const reaches = new Map<string, string>([["setup", "setup"], ...binding.elements.map((element) => [element.name.getText(tree), element.name.getText(tree)] as [string, string])]);
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

test("setup host members are used before their destructuring only inside functions", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.deepEqual(setupMembersUsedEarly(source), []);
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
  assert.deepEqual(setupMembersUsedEarly(source), ["showGetStarted (line 1)", "startSitePanel (line 2)", "takeStartingPoint (line 3)", "writeStartingPoint via early() (line 4)"]);
});
