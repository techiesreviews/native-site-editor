import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import type * as TS from "typescript-eslint-api/node_modules/typescript";

// TypeScript 7 has no JavaScript API; this package owns the TS 6 parser.
const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");
type Rule = "move-engine" | "move-plan" | "template-choice";
type Finding = { file: string; line: number; rule: Rule; function: string; text: string };
type AllowlistEntry = { file: string; match: string; reason: string; count?: number };
type Detector = (source: string, file: string) => Finding[];
type FunctionBody = TS.FunctionLikeDeclaration & { body: TS.ConciseBody };
const ENGINE_HOME = "src/page-builder/block-move-rules.ts";
const MOVE_HOME = "src/page-builder/block-move.ts";
const ENGINE = new Set(["nativeMoveEdit", "nativeElementMovePlan", "nativeElementKeyMove", "templateKeyMove"]);
// What makes a move plan, and everything that answers where or whether a block moves.
const PLANS = new Set([...ENGINE, "nativeElementSiblingMove", "nativeElementDepthMove", "pageRules", "templateRules"]);
const RULES = new Set([...PLANS, "templateMovePath", "templateMoveRefusal", "nativeMoveRefusal", "nativeMoveDestinationValid"]);
const READERS = new Set(["editModeTemplate"]);
const engineAllowlist: AllowlistEntry[] = [];
const planAllowlist: AllowlistEntry[] = [];
const choiceAllowlist: AllowlistEntry[] = [];

function parse(source: string, file: string) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function walk(node: TS.Node, visit: (node: TS.Node) => void) {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}
function strip(node: TS.Node): TS.Node {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node) || (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken)) node = ts.isPrefixUnaryExpression(node) ? node.operand : node.expression;
  return node;
}
function member(node: TS.Node): { name: string; receiver: TS.Expression } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { name: node.name.text, receiver: node.expression };
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const key = strip(node.argumentExpression);
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return { name: key.text, receiver: node.expression };
  }
  return undefined;
}
function isFunction(node: TS.Node): node is FunctionBody {
  return ts.isFunctionLike(node) && "body" in node && !!node.body;
}
function boundName(node: FunctionBody): string | undefined {
  let bound: TS.Node = node;
  while (bound.parent && strip(bound.parent) === node) bound = bound.parent;
  const parent = bound.parent;
  return parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) ? parent.name.getText() : undefined;
}
function functionName(node: FunctionBody) {
  return node.name?.getText() ?? boundName(node);
}
function finding(tree: TS.SourceFile, node: TS.Node, rule: Rule): Finding {
  let name = "<top-level>";
  for (let parent: TS.Node | undefined = node; parent; parent = parent.parent) {
    if (isFunction(parent) && functionName(parent)) { name = functionName(parent)!; break; }
  }
  return { file: tree.fileName, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, rule, function: name, text: node.getText(tree) };
}
// One file at a time, without imports or lib: the checker binds the file's own names, shadowing
// included, so plans, helpers and aliases resolve as the code reads; imported names stay unresolved.
type Analysis = { tree: TS.SourceFile; checker: TS.TypeChecker };
const analysed = new Map<string, Analysis>();
function analyse(source: string, file: string): Analysis {
  const key = `${file}\0${source}`;
  let analysis = analysed.get(key);
  if (!analysis) {
    const tree = parse(source, file);
    const host: TS.CompilerHost = {
      getSourceFile: name => name === file ? tree : undefined, fileExists: name => name === file, readFile: () => undefined, writeFile: () => {},
      getDefaultLibFileName: () => "lib.d.ts", getCurrentDirectory: () => "", getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
    };
    analysis = { tree, checker: ts.createProgram([file], { noLib: true, noResolve: true, allowJs: true, types: [] }, host).getTypeChecker() };
    analysed.set(key, analysis);
  }
  return analysis;
}
function declarationOf(checker: TS.TypeChecker, node: TS.Node): TS.Declaration | undefined {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
}
function functionOf(checker: TS.TypeChecker, expression: TS.Node, depth = 0): FunctionBody | undefined {
  expression = strip(expression);
  if (isFunction(expression)) return expression;
  if (!ts.isIdentifier(expression) || depth > 8) return undefined;
  const declaration = declarationOf(checker, expression);
  if (declaration && isFunction(declaration)) return declaration;
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? functionOf(checker, declaration.initializer, depth + 1) : undefined;
}
function returnsOf(factory: FunctionBody): TS.Expression[] {
  if (!ts.isBlock(factory.body)) return [factory.body];
  const returned: TS.Expression[] = [];
  const visit = (node: TS.Node): void => {
    if (isFunction(node)) return;
    if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(factory.body, visit);
  return returned;
}
// The plan functions an argument stands for: inline, a same-file name, either branch of a
// conditional, or what a same-file factory returns (its setup runs before the plan, so it is not one).
function plansOf(checker: TS.TypeChecker, expression: TS.Node, depth = 0): FunctionBody[] | undefined {
  expression = strip(expression);
  if (depth > 8) return undefined;
  if (ts.isConditionalExpression(expression)) {
    const branches = [plansOf(checker, expression.whenTrue, depth + 1), plansOf(checker, expression.whenFalse, depth + 1)];
    return branches.every(Boolean) ? branches.flat() as FunctionBody[] : undefined;
  }
  if (ts.isCallExpression(expression)) {
    const factory = functionOf(checker, expression.expression);
    const returned = factory ? returnsOf(factory).map(value => plansOf(checker, value, depth + 1)) : [];
    return returned.length && returned.every(Boolean) ? returned.flat() as FunctionBody[] : undefined;
  }
  if (isFunction(expression)) return [expression];
  const declaration = ts.isIdentifier(expression) ? declarationOf(checker, expression) : undefined;
  if (declaration && isFunction(declaration)) return [declaration];
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? plansOf(checker, declaration.initializer, depth + 1) : undefined;
}
// A guarded edit queue: `edits`, `ports.edits`, `guardedEdits`, or a same-file name bound to one.
function isEdits(checker: TS.TypeChecker, node: TS.Node, depth = 0): boolean {
  node = strip(node);
  if (/edits$/i.test(node.getText())) return true;
  if (!ts.isIdentifier(node) || depth > 8) return false;
  const declaration = declarationOf(checker, node);
  return !!declaration && ts.isVariableDeclaration(declaration) && !!declaration.initializer && isEdits(checker, declaration.initializer, depth + 1);
}
// `edits.run`, `guardedEdits["now"]`, `edits.run.bind(edits)`, and same-file names bound to them, destructured too.
function isPlanMethod(checker: TS.TypeChecker, node: TS.Node, depth = 0): boolean {
  node = strip(node);
  if (depth > 8) return false;
  const bind = ts.isCallExpression(node) ? member(strip(node.expression)) : undefined;
  if (bind?.name === "bind") return isPlanMethod(checker, bind.receiver, depth + 1);
  const access = member(node);
  if (access) return ["run", "now"].includes(access.name) && isEdits(checker, access.receiver);
  if (!ts.isIdentifier(node)) return false;
  const declaration = declarationOf(checker, node);
  if (declaration && ts.isBindingElement(declaration) && ts.isVariableDeclaration(declaration.parent.parent) && declaration.parent.parent.initializer) {
    return ["run", "now"].includes((declaration.propertyName ?? declaration.name).getText()) && isEdits(checker, declaration.parent.parent.initializer);
  }
  return !!declaration && ts.isVariableDeclaration(declaration) && !!declaration.initializer && isPlanMethod(checker, declaration.initializer, depth + 1);
}
// Member names and import/export source names are references; declaration names and text are not.
function referenceName(node: TS.Node): string | undefined {
  const access = member(node);
  if (access) return access.name;
  if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) return (node.propertyName ?? node.name).text;
  if (ts.isBindingElement(node)) return (node.propertyName ?? node.name).getText().replace(/^['"]|['"]$/g, "");
  if (!ts.isIdentifier(node)) return undefined;
  const parent = node.parent;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isBindingElement(parent)
    || ts.isPropertyAccessExpression(parent) && parent.name === node
    || ts.isPropertyAssignment(parent) && parent.name === node
    || (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionLike(parent)
      || ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
      || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node) return undefined;
  return node.text;
}
function refers(checker: TS.TypeChecker, node: TS.Node, names: Set<string>): boolean {
  const name = referenceName(node);
  if (!name) return false;
  if (names.has(name)) return true;
  const declaration = ts.isIdentifier(node) ? declarationOf(checker, node) : undefined;
  return !!declaration && referring(checker, node.getSourceFile(), names).has(declaration);
}
// The file's declarations that stand for a name: a renamed import or destructured name, a value
// made from one (`const rules = pageRules(items)`, `const t = tools.editModeTemplate()`), or a
// function whose body refers to one; transitively, through the same-file names they refer to.
const reached = new WeakMap<TS.SourceFile, Map<Set<string>, Set<TS.Node>>>();
function referring(checker: TS.TypeChecker, tree: TS.SourceFile, names: Set<string>): Set<TS.Node> {
  let byNames = reached.get(tree);
  if (!byNames) reached.set(tree, byNames = new Map());
  let found = byNames.get(names);
  if (found) return found;
  found = new Set();
  const users = new Map<TS.Node, TS.Node[]>(), queue: TS.Node[] = [];
  walk(tree, declaration => {
    if (ts.isImportSpecifier(declaration) || ts.isBindingElement(declaration)) {
      if (names.has(referenceName(declaration)!)) queue.push(declaration);
      return;
    }
    const value = isFunction(declaration) ? declaration.body : ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
    if (value) walk(value, inner => {
      const name = referenceName(inner);
      if (!name) return;
      if (names.has(name)) queue.push(declaration);
      const used = ts.isIdentifier(inner) ? declarationOf(checker, inner) : undefined;
      if (used) users.set(used, [...users.get(used) ?? [], declaration]);
    });
  });
  for (let declaration = queue.pop(); declaration; declaration = queue.pop()) {
    if (found.has(declaration)) continue;
    found.add(declaration);
    queue.push(...users.get(declaration) ?? []);
  }
  byNames.set(names, found);
  return found;
}
// Code outside any function (a closure is a scope of its own); imports and re-exports choose nothing.
function walkOutside(node: TS.Node, visit: (node: TS.Node) => void) {
  visit(node);
  ts.forEachChild(node, child => { if (!isFunction(child) && !ts.isImportDeclaration(child) && !ts.isExportDeclaration(child)) walkOutside(child, visit); });
}
const moveEngine: Detector = (source, file) => {
  if (file === ENGINE_HOME) return [];
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    if (ENGINE.has(referenceName(node) ?? "")) hits.push(finding(tree, node, "move-engine"));
  });
  return hits;
};
// Same-file helpers, aliases and values a plan refers to are followed by `refers`.
const movePlans: Detector = (source, file) => {
  if (file === MOVE_HOME) return [];
  const { tree, checker } = analyse(source, file), hits: Finding[] = [], seen = new Set<TS.Node>();
  walk(tree, node => {
    if (!ts.isCallExpression(node) || !node.arguments[0] || !isPlanMethod(checker, node.expression)) return;
    // Unresolved plans belong to guarded-edit-reads' plan-unresolved rule.
    for (const plan of plansOf(checker, node.arguments[0]) ?? []) {
      walk(plan.body, read => {
        if (!seen.has(read) && refers(checker, read, PLANS)) { seen.add(read); hits.push(finding(tree, read, "move-plan")); }
      });
    }
  });
  return hits;
};
// A scope (a function with its closures, or module-level code) that reads the template edited and reaches move rules.
const templateChoices: Detector = (source, file) => {
  if (file === MOVE_HOME) return [];
  const { tree, checker } = analyse(source, file), hits: Finding[] = [];
  const choice = (body: TS.Node, scan: typeof walk) => {
    let reads = false, move: TS.Node | undefined;
    scan(body, node => {
      reads ||= refers(checker, node, READERS);
      if (!move && refers(checker, node, RULES)) move = node;
    });
    return reads ? move : undefined;
  };
  walk(tree, node => {
    if (isFunction(node) && choice(node.body, walk)) hits.push(finding(tree, node, "template-choice"));
  });
  const move = choice(tree, walkOutside);
  if (move) hits.push(finding(tree, move, "template-choice"));
  return hits;
};
const guards = [
  { detect: moveEngine, allowlist: engineAllowlist },
  { detect: movePlans, allowlist: planAllowlist },
  { detect: templateChoices, allowlist: choiceAllowlist },
];
function matches(hit: Finding, entry: AllowlistEntry) {
  return hit.file === entry.file && (hit.function === entry.match || hit.text === entry.match);
}
function unallowed(hits: Finding[], entries: AllowlistEntry[]) {
  return hits.filter(hit => !entries.some(entry => matches(hit, entry)));
}
// Exact counts prevent a second finding from inheriting an exception in the same function.
function staleEntries(hits: Finding[], entries: AllowlistEntry[]) {
  return entries.filter(entry => !entry.reason.trim() || hits.filter(hit => matches(hit, entry)).length !== (entry.count ?? 1));
}
function sourceFiles(directory: string): string[] {
  return readdirSync(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:[cm]?[jt]s|tsx)$/.test(file) ? [file] : [];
  });
}
const realHits = guards.map(({ detect }) => [...sourceFiles("src"), ...sourceFiles("shared")].flatMap(file =>
  detect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), file)));
const FAKE = "src/controllers/fake.ts";
function flags(detect: Detector, source: string, rule: Rule) {
  const hits = detect(source, FAKE);
  assert.ok(hits.some(hit => hit.rule === rule), source);
  assert.ok(hits.every(hit => hit.file === FAKE && hit.line >= 1 && hit.text.length > 0));
}

test("move-engine rejects calls, aliases, imports, re-exports and member references for every engine", () => {
  for (const name of ENGINE) {
    for (const source of [
      `${name}();`, `const move = ${name};`,
      `import { ${name} } from "./moves";`, `import { ${name} as move } from "./moves";`,
      `export { ${name} } from "./moves";`, `export { ${name} as move } from "./moves";`,
      `ops.${name};`, `ops?.${name}();`, `ops["${name}"];`, `ops?.["${name}"]();`, `ops[\`${name}\`]();`,
      `const { ${name}: move } = ops;`,
    ]) flags(moveEngine, source, "move-engine");
    assert.deepEqual(moveEngine(`import { ${name} as move } from "./moves"; move();`, ENGINE_HOME), []);
    assert.deepEqual(moveEngine(`export function ${name}() { return true; }`, FAKE), []);
  }
  for (const source of [
    '// nativeMoveEdit();\nconst text = "nativeMoveEdit";',
    'const text = `templateKeyMove`; nativeMoveEditor();',
    'const nativeMoveEdit = () => true;',
    'class Operations { nativeMoveEdit() {} }',
  ]) assert.deepEqual(moveEngine(source, FAKE), [], source);
});

test("move-plan rejects every plan-making name in inline, named, conditional and factory plans", () => {
  for (const name of PLANS) {
    for (const source of [
      `ports.edits.run(r => ${name}());`, `guardedEdits.now(r => ops["${name}"]());`,
      `const plan = r => ops.${name}(); deps.edits.now(plan);`,
      `function plan(r) { return ${name}(); } edits.run(plan);`,
      `const plan = function named(r) { return ${name}(); }; edits.now(plan);`,
      `const plan = ready ? r => r.source(path) : r => ${name}(); edits.run(plan);`,
      `function factory() { return r => ${name}(); } actions.edits.run(factory());`,
      `const factory = () => ready ? r => ${name}() : r => r.source(path); edits.now(factory());`,
      `edits.run(r => { const nested = () => ${name}(); });`,
    ]) flags(movePlans, source, "move-plan");
    assert.deepEqual(movePlans(`edits.run(r => ${name}());`, MOVE_HOME), []);
  }
  // Refusals and paths answer questions; a plan that asks one moves nothing (template-choice covers choosing them).
  for (const name of [...RULES].filter(name => !PLANS.has(name))) assert.deepEqual(movePlans(`edits.run(r => ${name}(r.source(path)) ? remove() : keep());`, FAKE), [], name);
});

test("move-plan follows move aliases, renamed imports, namespace members and transitive helpers", () => {
  for (const source of [
    'const move = pageRules; const alias = move; edits.run(r => alias(items));',
    'import { templateRules as rules } from "./moves"; edits.run(r => rules());',
    'import * as ops from "./moves"; edits.now(r => ops.templateKeyMove());',
    'const { pageRules: rules } = ops; edits.now(r => rules(items));',
    'function first() { return second(); } const second = () => templateRules(); edits.run(r => first());',
    'function helper() { return templateRules(); } const alias = helper; edits.run(r => alias());',
    'function helper() { return helper() || pageRules(items); } edits.run(r => helper());',
    'const rules = ready ? templateRules() : pageRules(items); edits.run(r => rules.step(r.source(path), from, "up"));',
    'function rules() { return pageRules(items); } const selected = rules(); edits.run(r => selected.step(r.source(path), from, "up"));',
    'function a() { b(); return pageRules(items); } function b() { return a(); } edits.run(r => b());',
  ]) flags(movePlans, source, "move-plan");
  for (const source of [
    'edits.run(r => r.source(path));',
    'pageRules(items); edits.run(r => r.source(path));',
    'function helper() { return templateRules(); } edits.run(r => r.source(path)); helper();',
    'other.run(r => pageRules(items));',
    'const move = pageRules; edits.now(move => move.source(path));',
    'import { pageRules as rules } from "./moves"; function act(rules) { edits.run(r => rules(r)); }',
    'function factory() { pageRules(items); return r => r.source(path); } edits.now(factory());',
    'edits.run(plans[kind]); ports.edits.now(this.plan); edits.run(importedPlan);',
  ]) assert.deepEqual(movePlans(source, FAKE), [], source);
});

test("move-plan recognises destructured, aliased, bound and string-access guarded edit methods", () => {
  for (const source of [
    'const { run } = ports.edits; run(r => pageRules(items));',
    'const { now: apply } = guardedEdits; apply(r => templateRules());',
    'const run = deps.edits.run; run(r => pageRules(items));',
    'const now = guardedEdits.now.bind(guardedEdits); now(r => templateRules());',
    'ports.edits["now"](r => pageRules(items));',
    '(ports.edits!.run as Function)(r => templateRules());',
    'const tx = ports.edits; tx.run(r => pageRules(items));',
    'const tx = ports.edits; const { now } = tx; now(r => pageRules(items));',
    'const first = edits.run; const second = first; second(r => templateRules());',
  ]) flags(movePlans, source, "move-plan");
  for (const source of ['const tx = ports.history; tx.run(r => pageRules(items));', 'const first = edits.stamp; first(r => pageRules(items));']) assert.deepEqual(movePlans(source, FAKE), [], source);
  const hits = movePlans('const plan = r => pageRules(items); edits.run(plan); edits.now(plan);', FAKE);
  assert.equal(hits.length, 1, "the same plan reference is counted once");
  assert.equal(hits[0].function, "plan");
});

test("template-choice rejects template reads with every move rule name, including nested closures", () => {
  for (const name of RULES) {
    for (const read of [
      'tools.editModeTemplate()', 'componentTools?.editModeTemplate()', 'anything.editModeTemplate',
      'anything?.["editModeTemplate"]', 'editModeTemplate()',
    ]) flags(templateChoices, `function choose() { const t = ${read}; return t ? ${name}() : other(); }`, "template-choice");
    flags(templateChoices, `function choose() { tools.editModeTemplate(); const nested = () => ops.${name}(); }`, "template-choice");
    assert.deepEqual(templateChoices(`function choose() { return tools.editModeTemplate() ? ${name}() : other(); }`, MOVE_HOME), []);
  }
  for (const source of [
    'function read() { return tools.editModeTemplate(); }',
    'function move() { return templateRules(); }',
    'function read() { return tools.editModeTemplate(); } function move() { return pageRules(items); }',
    'function read() { return tools.editModeTemplate(); } function paint() { return read() ? insertTarget() : removeTarget(); }',
    'function choose() { const text = "editModeTemplate"; return templateRules(); }',
    'function choose() { tools.editModeTemplate(); return nativeMoveEditor(); }',
  ]) assert.deepEqual(templateChoices(source, FAKE), [], source);
});

test("template-choice follows destructured reads, aliases and transitive same-file readers", () => {
  for (const source of [
    'function choose() { const { editModeTemplate } = tools; return editModeTemplate() ? templateRules() : pageRules(items); }',
    'const { editModeTemplate: editing } = tools; function choose() { return editing() ? templateRules() : pageRules(items); }',
    'const read = tools.editModeTemplate; const alias = read; function choose() { alias(); return templateRules(); }',
    'const t = () => tools.editModeTemplate(); function choose() { return t() ? templateRules() : pageRules(items); }',
    'function t() { return read(); } const read = () => tools.editModeTemplate(); function choose() { t(); return templateRules(); }',
    'const t = () => tools.editModeTemplate(); const alias = t; function choose() { alias(); return templateRules(); }',
    'function read() { return read() || tools.editModeTemplate(); } function choose() { read(); return templateRules(); }',
    'import { pageRules as rules } from "./moves"; function choose() { tools.editModeTemplate(); return rules(items); }',
    'const rules = templateRules; function choose() { tools.editModeTemplate(); return rules(); }',
    'function choose() { const nested = () => tools.editModeTemplate(); return templateRules(); }',
    'const rules = tools.editModeTemplate() ? templateRules() : pageRules(items);',
    'const template = tools.editModeTemplate(); export const step = () => template ? templateRules() : pageRules(items);',
    'const template = tools.editModeTemplate(); const rules = template ? templateRules() : pageRules(items); export const step = () => rules;',
    'function page() { return pageRules(items); } function template() { return templateRules(); } function choose() { return tools.editModeTemplate() ? template() : page(); }',
    'function a() { b(); return pageRules(items); } function b() { return a(); } function choose() { tools.editModeTemplate(); b(); }',
  ]) flags(templateChoices, source, "template-choice");
  for (const source of [
    'const read = tools.editModeTemplate; function choose(read) { read(); return templateRules(); }',
    'const t = () => tools.editModeTemplate(); function choose() { const t = () => true; return t() ? templateRules() : pageRules(items); }',
    'const { editModeTemplate: reading } = tools; function choose(reading) { reading(); return templateRules(); }',
    'const template = tools.editModeTemplate(); export const step = () => pageRules(items);',
    'export const read = () => tools.editModeTemplate(); const rules = pageRules(items);',
    'import { pageRules } from "./moves"; const template = tools.editModeTemplate(); export function move() { return pageRules(items); }',
    'export { templateRules } from "./moves"; export const template = tools.editModeTemplate();',
    'function a() { b(); return pageRules(items); } function b() { return a(); } function c() { return d(); } function d() { return c(); } function choose() { tools.editModeTemplate(); d(); }',
  ]) assert.deepEqual(templateChoices(source, FAKE), [], source);
});

test("real src and shared trees keep one engine and one guarded move/template choice", () => {
  const hits = guards.flatMap(({ allowlist }, index) => unallowed(realHits[index], allowlist));
  assert.equal(hits.length, 0, hits.map(hit => `${hit.file}:${hit.line} ${hit.rule} ${hit.function}: ${hit.text.slice(0, 150)}`).join("\n"));
});

test("allowlists need reasons and exact counts, and reject stale entries", () => {
  guards.forEach(({ allowlist }, index) => assert.deepEqual(staleEntries(realHits[index], allowlist), []));
  const entry: AllowlistEntry = { file: FAKE, match: "move", reason: "Fixture exception." };
  const once = moveEngine('function move() { nativeMoveEdit(); }', FAKE);
  const twice = moveEngine('function move() { nativeMoveEdit(); nativeMoveEdit(); }', FAKE);
  assert.deepEqual(unallowed(once, [entry]), []);
  assert.deepEqual(staleEntries(once, [entry]), []);
  assert.deepEqual(staleEntries([], [entry]), [entry]);
  assert.deepEqual(staleEntries(twice, [entry]), [entry]);
  assert.deepEqual(staleEntries(twice, [{ ...entry, count: 2 }]), []);
  const emptyReason = { ...entry, reason: "  " };
  assert.deepEqual(staleEntries(once, [emptyReason]), [emptyReason]);
  assert.deepEqual(staleEntries(once, [{ ...entry, match: "nativeMoveEdit" }]), []);
});
