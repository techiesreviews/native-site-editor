import assert from "node:assert/strict";
import { test } from "node:test";
import { ts, nameFindings, walk, strip, member, isFunction, finding, analyse, declarationOf, plansOf, isPlanMethod, bindingKey, referenceName, bindingReceiver, walkOutside, refers, unallowed, staleEntries, sourceFiles, readSource, type TS, type Finding, type AllowlistEntry, type Detector } from "./support/source-guard.ts";

type Rule = "move-engine" | "move-plan" | "template-choice";

const ENGINE_HOME = "src/page-builder/block-move-rules.ts";
const MOVE_HOME = "src/page-builder/block-move.ts";
const ENGINE = new Set(["nativeMoveEdit", "nativeElementMovePlan", "nativeElementKeyMove", "templateKeyMove"]);
// What makes a move plan, and everything that answers where or whether a block moves.
const PLANS = new Set([...ENGINE, "nativeElementSiblingMove", "nativeElementDepthMove", "pageRules", "templateRules"]);
const RULES = new Set([...PLANS, "templateMovePath", "templateMoveRefusal", "nativeMoveRefusal", "nativeMoveDestinationValid"]);
const READERS = new Set(["now"]);
const engineAllowlist: AllowlistEntry[] = [];
const planAllowlist: AllowlistEntry[] = [];
const choiceAllowlist: AllowlistEntry[] = [];

// Only the Edit component mode's receiver names this reader; clocks and other now ports do not.
// A same-file alias of the receiver (`const m = tools.mode`, `const { mode: m } = tools`) is one.
function modeReceiver(checker: TS.TypeChecker, node: TS.Node, depth = 0): boolean {
  node = strip(node);
  if (member(node)?.name === "mode") return true;
  if (!ts.isIdentifier(node) || depth > 8) return false;
  const declaration = declarationOf(checker, node);
  if (!declaration) return node.text === "mode";
  if (ts.isBindingElement(declaration)) return bindingKey(declaration) === "mode";
  if (ts.isVariableDeclaration(declaration)) return !!declaration.initializer && modeReceiver(checker, declaration.initializer, depth + 1);
  return node.text === "mode";
}
function namedReference(checker: TS.TypeChecker, node: TS.Node, names: Set<string>): boolean {
  if (names !== READERS) return names.has(referenceName(node) ?? "");
  const access = member(node);
  if (access) return access.name === "now" && modeReceiver(checker, access.receiver);
  if (!ts.isBindingElement(node) || bindingKey(node) !== "now") return false;
  const receiver = bindingReceiver(node);
  return !!receiver && modeReceiver(checker, receiver);
}

const moveEngine: Detector = (source, file) => {
  if (file === ENGINE_HOME) return [];
  return nameFindings(source, file, "move-engine", name => ENGINE.has(name));
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
        if (!seen.has(read) && refers(checker, read, PLANS, namedReference)) { seen.add(read); hits.push(finding(tree, read, "move-plan")); }
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
      reads ||= refers(checker, node, READERS, namedReference);
      if (!move && refers(checker, node, RULES, namedReference)) move = node;
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

const realHits = guards.map(({ detect }) => [...sourceFiles("src"), ...sourceFiles("shared")].flatMap(file =>
  detect(readSource(file), file)));
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
      `const { ${name}: move } = ops;`, `const { ["${name}"]: move } = ops;`,
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

test("move-plan rejects every plan-making name in inline, conditional and factory plans", () => {
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
    'const rules = pageRules(items); const { step } = rules; edits.run(r => step(r.source(path), from, "up"));',
    'function helper(rules = pageRules(items)) { return rules.step(source, from, "up"); } edits.run(r => helper());',
    'edits.run((r, rules = templateRules()) => rules.to(r.source(path), from, place));',
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
    'const { edits: { run: apply } } = ports; apply(r => pageRules(items));',
    'const { edits: { [`now`]: apply } } = deps; apply(r => templateRules());',
    'const { now: apply } = guardedEdits; apply(r => templateRules());',
    'const run = deps.edits.run; run(r => pageRules(items));',
    'const now = guardedEdits.now.bind(guardedEdits); now(r => templateRules());',
    'ports.edits["now"](r => pageRules(items));',
    '(ports.edits!.run as Function)(r => templateRules());',
    'const tx = ports.edits; tx.run(r => pageRules(items));',
    'const tx = ports.edits; const { now } = tx; now(r => pageRules(items));',
    'const first = edits.run; const second = first; second(r => templateRules());',
    'const { edits: tx } = ports; tx.run(r => pageRules(items));',
    'const tx = ports["edits"]; tx.now(r => pageRules(items));',
  ]) flags(movePlans, source, "move-plan");
  for (const source of ['const tx = ports.history; tx.run(r => pageRules(items));', 'const first = edits.stamp; first(r => pageRules(items));']) assert.deepEqual(movePlans(source, FAKE), [], source);
  const hits = movePlans('const plan = r => pageRules(items); edits.run(plan); edits.now(plan);', FAKE);
  assert.equal(hits.length, 1, "the same plan reference is counted once");
  assert.equal(hits[0].function, "plan");
});

test("template-choice rejects template reads with every move rule name, including nested closures", () => {
  for (const name of RULES) {
    for (const read of [
      'tools.mode.now()', 'componentTools?.mode.now()', 'anything.mode.now',
      'anything?.mode?.["now"]', 'mode.now()',
    ]) flags(templateChoices, `function choose() { const t = ${read}; return t ? ${name}() : other(); }`, "template-choice");
    flags(templateChoices, `function choose() { tools.mode.now(); const nested = () => ops.${name}(); }`, "template-choice");
    assert.deepEqual(templateChoices(`function choose() { return tools.mode.now() ? ${name}() : other(); }`, MOVE_HOME), []);
  }
  for (const source of [
    'function read() { return tools.mode.now(); }',
    'function move() { return templateRules(); }',
    'function choose() { Date.now(); performance.now(); return templateRules(); }',
    'function choose() { const { now } = Date; return now() ? templateRules() : pageRules(items); }',
    'function choose() { now(); return templateRules(); }',
    'function choose() { const mode = Date; return mode.now() ? templateRules() : pageRules(items); }',
    'function read() { return tools.mode.now(); } function move() { return pageRules(items); }',
    'function read() { return tools.mode.now(); } function paint() { return read() ? insertTarget() : removeTarget(); }',
    'function choose() { const text = "mode.now"; return templateRules(); }',
    'function choose() { tools.mode.now(); return nativeMoveEditor(); }',
  ]) assert.deepEqual(templateChoices(source, FAKE), [], source);
});

test("template-choice follows destructured reads, aliases and transitive same-file readers", () => {
  for (const source of [
    'function choose() { const { now } = tools.mode; return now() ? templateRules() : pageRules(items); }',
    'const { now: editing } = tools.mode; function choose() { return editing() ? templateRules() : pageRules(items); }',
    'const { mode: { now: editing } } = tools; function choose() { return editing() ? templateRules() : pageRules(items); }',
    'const { ["mode"]: { ["now"]: editing } } = tools; function choose() { return editing() ? templateRules() : pageRules(items); }',
    'const { [`mode`]: { [`now`]: editing } } = tools; function choose() { return editing() ? templateRules() : pageRules(items); }',
    'const read = tools.mode.now; const alias = read; function choose() { alias(); return templateRules(); }',
    'const t = () => tools.mode.now(); function choose() { return t() ? templateRules() : pageRules(items); }',
    'function t() { return read(); } const read = () => tools.mode.now(); function choose() { t(); return templateRules(); }',
    'const t = () => tools.mode.now(); const alias = t; function choose() { alias(); return templateRules(); }',
    'function read() { return read() || tools.mode.now(); } function choose() { read(); return templateRules(); }',
    'import { pageRules as rules } from "./moves"; function choose() { tools.mode.now(); return rules(items); }',
    'const rules = templateRules; function choose() { tools.mode.now(); return rules(); }',
    'function choose() { const nested = () => tools.mode.now(); return templateRules(); }',
    'const rules = tools.mode.now() ? templateRules() : pageRules(items);',
    'const template = tools.mode.now(); export const step = () => template ? templateRules() : pageRules(items);',
    'const template = tools.mode.now(); const rules = template ? templateRules() : pageRules(items); export const step = () => rules;',
    'function page() { return pageRules(items); } function template() { return templateRules(); } function choose() { return tools.mode.now() ? template() : page(); }',
    'function a() { b(); return pageRules(items); } function b() { return a(); } function choose() { tools.mode.now(); b(); }',
    'function read(t = tools.mode.now()) { return t; } function choose() { return read() ? templateRules() : pageRules(items); }',
    'function choose({ template } = tools.mode.now()) { return template ? templateRules() : pageRules(items); }',
    'function choose() { const m = tools.mode; return m.now() ? templateRules() : pageRules(items); }',
    'const { mode: m } = tools; function choose() { return m.now() ? templateRules() : pageRules(items); }',
    'function choose() { const { mode } = tools; return mode.now() ? templateRules() : pageRules(items); }',
    'const m = componentTools?.mode; const alias = m; function choose() { return alias?.now() ? templateRules() : pageRules(items); }',
  ]) flags(templateChoices, source, "template-choice");
  for (const source of [
    'const read = tools.mode.now; function choose(read) { read(); return templateRules(); }',
    'const t = () => tools.mode.now(); function choose() { const t = () => true; return t() ? templateRules() : pageRules(items); }',
    'const { now: reading } = tools.mode; function choose(reading) { reading(); return templateRules(); }',
    'const template = tools.mode.now(); export const step = () => pageRules(items);',
    'export const read = () => tools.mode.now(); const rules = pageRules(items);',
    'import { pageRules } from "./moves"; const template = tools.mode.now(); export function move() { return pageRules(items); }',
    'export { templateRules } from "./moves"; export const template = tools.mode.now();',
    'function a() { b(); return pageRules(items); } function b() { return a(); } function c() { return d(); } function d() { return c(); } function choose() { tools.mode.now(); d(); }',
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
