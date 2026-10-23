import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, ts, walk, type TS } from "./support/source-guard.ts";

const CEILING = 4810;

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
// functions: above that line they may only be used inside a function, which runs later.
function calledOnTheSpot(fn: TS.Node): boolean {
  let callee: TS.Node = fn;
  while (ts.isParenthesizedExpression(callee.parent)) callee = callee.parent;
  return ts.isCallExpression(callee.parent) && callee.parent.expression === callee;
}

function setupMembersUsedEarly(source: string): string[] {
  const tree = parse(source, "src/main.ts");
  const declaration = tree.statements.find((statement): statement is TS.VariableStatement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((item) => ts.isObjectBindingPattern(item.name) && item.initializer !== undefined && ts.isIdentifier(item.initializer) && item.initializer.text === "setup"));
  assert.ok(declaration, "main.ts destructures the setup host (const { … } = setup)");
  const pattern = declaration.declarationList.declarations[0].name as TS.ObjectBindingPattern;
  const names = new Set(["setup", ...pattern.elements.map((element) => element.name.getText(tree))]);
  const early: string[] = [];
  walk(tree, (node) => {
    if (!ts.isIdentifier(node) || !names.has(node.text) || node.getStart(tree) >= declaration.getStart(tree)) return;
    // A name being declared, or a property of that name, is not a use.
    const parent = node.parent;
    if ((ts.isVariableDeclaration(parent) || ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return;
    // A function runs later, unless it is called on the spot: `(() => …)()`.
    for (let at: TS.Node = node.parent; !ts.isSourceFile(at); at = at.parent) if (ts.isFunctionLike(at) && !calledOnTheSpot(at)) return;
    early.push(`${node.text} (line ${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1})`);
  });
  return early;
}

test("setup host members are used before their destructuring only inside functions", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.deepEqual(setupMembersUsedEarly(source), []);
});

test("a setup host member passed by value or called on the spot above its destructuring is named", () => {
  const source = [
    "const early = { show: showGetStarted, later: () => renderLogin() };",
    "(() => startSitePanel())();",
    "(function () { takeStartingPoint(); })();",
    "const setup = createSetupHost({});",
    "const { renderLogin, showGetStarted, startSitePanel, takeStartingPoint } = setup;",
  ].join("\n");
  assert.deepEqual(setupMembersUsedEarly(source), ["showGetStarted (line 1)", "startSitePanel (line 2)", "takeStartingPoint (line 3)"]);
});
