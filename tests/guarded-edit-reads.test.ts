import assert from "node:assert/strict";
import { test } from "node:test";
import { ts, parse, walk, strip, member, isFunction, functionName, finding, analyse, referenceName, standsFor, bindingReceiver, functionOf, plansOf, isPlanMethod, matches, staleEntries, sourceFiles, readSource, type TS, type Finding, type AllowlistEntry, type Detector } from "./support/source-guard.ts";

type Rule = "plan-read" | "plan-unresolved" | "plan-wait" | "reads-helper" | "plan-default" | "stale-compare";

// Exact counts keep a new compare in the same function from inheriting an exception.
const FILE_SELECTION = "Not edit staleness: `fileGeneration` counts file selections within one load (moved from src/main.ts in ticket 81).";
const allowlist: AllowlistEntry[] = [
  { file: "src/controllers/source-pane-controller.ts", match: { rule: "stale-compare", function: "openEntry" }, reason: FILE_SELECTION, count: 3 },
  { file: "src/controllers/source-pane-controller.ts", match: { rule: "stale-compare", function: "mountSource" }, reason: FILE_SELECTION, count: 2 },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "stale-compare", function: "editableTemplatePath" }, reason: "Follow-up (ticket 22, outside its files): preview selection compares the workspace load number it began on (`generation: currentLoad`); it should hold a session stamp." },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "stale-compare", function: "select" }, reason: "Follow-up (ticket 22, outside its files): preview selection compares the workspace load number it began on (`generation: currentLoad`); it should hold a session stamp.", count: 2 },
  { file: "src/controllers/preview-selection-controller.ts", match: { rule: "stale-compare", function: "replayPending" }, reason: "Follow-up (ticket 22, outside its files): preview selection compares the workspace load number it began on (`generation: currentLoad`); it should hold a session stamp." },
];
// Same-file helpers a plan calls are scanned too, except these waits: the module re-proves
// every read after them, and the plan reads what it uses through `r` once they settle.
const waits: AllowlistEntry[] = [
];

function readsParameter(parameter: TS.ParameterDeclaration) {
  return !!parameter.type && ts.isTypeReferenceNode(parameter.type) && parameter.type.typeName.getText() === "Reads";
}
function peekDefault(parameter: TS.ParameterDeclaration) {
  return readsParameter(parameter) && !!parameter.initializer && member(strip(parameter.initializer))?.name === "peek";
}
// Defaults are UI adapters at declaration time; omitting one in a plan is checked separately.
function inPeekDefault(node: TS.Node) {
  for (let parent: TS.Node | undefined = node; parent; parent = parent.parent) {
    if (ts.isParameter(parent)) return peekDefault(parent);
  }
  return false;
}
// `reads !== peek` compares readers; it reads no bytes.
function identityCompare(node: TS.Node) {
  let operand = node;
  while (operand.parent && strip(operand.parent) === operand) operand = operand.parent;
  const parent = operand.parent;
  return !!parent && ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind);
}

// nativePictureSources parses supplied bytes only; these readers reach host file bytes.
const nativeReaders = new Set(["nativeEffectiveSource", "nativeEditableSource", "nativeSources", "nativeBaseSources", "nativePreviewSources", "nativePageShownSources", "nativeRouteShownSources", "nativeAssetSources", "nativeLinkSources"]);
function untracked(checker: TS.TypeChecker, node: TS.Node): boolean {
  if (inPeekDefault(node) || identityCompare(node) || !referenceName(node)) return false;
  return standsFor(checker, node, value => {
    const name = referenceName(value);
    if (name === "peek" || nativeReaders.has(name ?? "")) return true;
    const access = member(value);
    const receiver = access?.receiver ?? (ts.isBindingElement(value) ? bindingReceiver(value) : undefined);
    if (!receiver) return false;
    const from = strip(receiver);
    if (name === "source" && standsFor(checker, from, value => ts.isIdentifier(value) && ["ports", "deps"].includes(value.text))) return true;
    return name === "get" && ts.isCallExpression(from) && strip(from.expression).getText() === "draftStore";
  });
}

const planReads: Detector = (source, file) => {
  const { tree, checker } = analyse(source, file), hits: Finding[] = [];
  const seen = new Set<string>();
  const report = (node: TS.Node, rule: Rule, name?: string) => {
    const key = `${rule}:${name ?? node.pos}`;
    if (!seen.has(key)) { seen.add(key); hits.push({ ...finding(tree, node, rule), ...name ? { function: name } : {} }); }
  };
  walk(tree, node => {
    if (!ts.isCallExpression(node) || !node.arguments[0] || !isPlanMethod(checker, node.expression)) return;
    const plans = plansOf(checker, node.arguments[0]);
    if (!plans) return report(node.arguments[0], "plan-unresolved");
    // Same-file helpers the plan calls run inside it: scanned too, transitively.
    const bodies = [...plans], scanned = new Set<TS.Node>();
    for (let body = bodies.pop(); body; body = bodies.pop()) {
      if (scanned.has(body)) continue;
      scanned.add(body);
      walk(body.body, read => {
        if (untracked(checker, read)) report(read, "plan-read");
        if (!ts.isCallExpression(read)) return;
        const helper = functionOf(checker, read.expression), name = helper && functionName(helper);
        if (name && waits.some(wait => wait.file === file && typeof wait.match !== "string" && wait.match.function === name)) report(read, "plan-wait", name);
        else if (helper) bodies.push(helper);
        helper?.parameters.forEach((parameter, index) => {
          if (peekDefault(parameter) && (!read.arguments[index] || strip(read.arguments[index]).getText() === "undefined")) report(read, "plan-default");
        });
      });
    }
  });
  return hits;
};
const readsHelpers: Detector = (source, file) => {
  const { tree, checker } = analyse(source, file), hits: Finding[] = [], seen = new Set<number>();
  walk(tree, node => {
    if (!isFunction(node) || !node.parameters.some(readsParameter)) return;
    walk(node.body, read => {
      if (untracked(checker, read) && !seen.has(read.pos)) { seen.add(read.pos); hits.push(finding(tree, read, "reads-helper")); }
    });
  });
  return hits;
};
function staleOperand(node: TS.Node): boolean {
  node = strip(node);
  if (ts.isCallExpression(node)) return staleOperand(node.expression);
  const name = ts.isIdentifier(node) ? node.text : member(node)?.name;
  return !!name && /generation|setupScope|revision/i.test(name);
}
const staleCompares: Detector = (source, file) => {
  if (!/^src\/(controllers|page-builder)\//.test(file)) return [];
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)
      && (staleOperand(node.left) || staleOperand(node.right))) hits.push(finding(tree, node, "stale-compare"));
  });
  return hits;
};
const guards = [planReads, readsHelpers, staleCompares];

const realHits = [...sourceFiles("src"), ...sourceFiles("shared")].flatMap(file => {
  const source = readSource(file);
  return guards.flatMap(detect => detect(source, file));
});
const FAKE = "src/controllers/fake.ts";
function flags(detect: Detector, source: string, rule: Rule) {
  const hits = detect(source, FAKE);
  assert.ok(hits.some(hit => hit.rule === rule), source);
  assert.ok(hits.every(hit => hit.file === FAKE && hit.line >= 1 && hit.text.length > 0));
}

test("plans reject untracked readers in inline, named and factory plans, including nested closures", () => {
  for (const reader of ["edits.peek.source(path)", "nativeEffectiveSource(path)", "nativeSources()", "nativeEditableSource(path)", "nativeBaseSources.get(path)", "nativePreviewSources()", "nativePageShownSources(site, path)", "nativeRouteShownSources(route)", "nativeAssetSources()", "draftStore().get(scope, path)", "deps.source(path)", "ports.source", "ports.nativeSources"]) {
    for (const plan of [`ports.edits.run(r => { const nested = () => ${reader}; });`, `const plan = r => ${reader}; guardedEdits.now(plan);`, `function plan(r) { return ${reader}; } deps.edits.now(plan);`, `const plan = function named(r) { return ${reader}; }; edits.now(plan);`, `function textPlan() { return function(r) { return ${reader}; }; } actions.edits.run(textPlan());`]) flags(planReads, plan, "plan-read");
  }
  for (const source of ["edits.run(r => r.source(path)); edits.peek.source(path);", "const plan = r => r.template(tag); edits.now(plan);", "other.run(() => ports.source(path));", "function textPlan() { return r => r.source(path); } deps.edits.run(textPlan());", "function a() { const plan = r => ports.source(path); } function b() { const plan = r => r.source(path); edits.now(plan); }"]) assert.deepEqual(planReads(source, FAKE), [], source);
});

test("plans reject untracked readers in same-file helpers they call and plans the guard cannot see", () => {
  flags(planReads, "function pageOf(path) { return label(path); } function label(path) { return ports.source(path); } edits.run(r => pageOf(path));", "plan-read");
  for (const source of ["edits.run(plans[kind]);", "ports.edits.now(this.plan);", "edits.run(plan);"]) flags(planReads, source, "plan-unresolved");
  assert.deepEqual(planReads("function paint(path) { return ports.source(path); } edits.run(r => r.source(path)); paint(path);", FAKE), []);
  assert.deepEqual(planReads("function gridFor(reads: Reads) { return reads !== edits.peek ? reads.source(path) : cached; } edits.run(r => gridFor(r));", FAKE), [], "a reader identity compare reads no bytes");
  // A listed wait is reported once (its allowlist entry) and not scanned; unlisted, its reads are flagged.
  // No real wait is listed today (open404's index wait is a port of src/native-settings.ts), so the test lists one.
  const wait = "async function ensureNativeTextIndex() { return nativeBaseSources.get(path); } edits.run(async r => { await ensureNativeTextIndex(); await ensureNativeTextIndex(); return r.source(path); });";
  waits.push({ file: "src/wait-example.ts", match: { rule: "plan-wait", function: "ensureNativeTextIndex" }, reason: "Test-only example of a listed wait." });
  try { assert.deepEqual(planReads(wait, "src/wait-example.ts").map(hit => [hit.rule, hit.function]), [["plan-wait", "ensureNativeTextIndex"]]); }
  finally { waits.pop(); }
  flags(planReads, wait, "plan-read");
});

test("plans reject aliased and destructured readers and plan calls, and resolve names as the code binds them", () => {
  for (const source of [
    "const reads = deps.edits.peek; edits.run(r => reads.source(path));",
    "const read = ports.source; edits.run(r => read(path));",
    "const { source } = ports; edits.run(r => source(path));",
    "const { peek: shown } = ports.edits; edits.run(r => shown.source(path));",
    "const { run } = ports.edits; run(r => ports.source(path));",
    "const { edits: { run: apply } } = ports; apply(r => ports.source(path));",
    'const { edits: { ["now"]: apply } } = deps; apply(r => deps.source(path));',
    "const now = guardedEdits.now.bind(guardedEdits); now(r => nativeSources());",
    "const plan = ready ? r => r.source(path) : r => ports.source(path); edits.run(plan);",
  ]) flags(planReads, source, "plan-read");
  for (const source of [
    'import { importedPlan } from "./plans"; function factory() { return importedPlan; } edits.run(factory());',
    "function plan(r) { return ports.source(path); } function act(plan) { edits.run(plan); }",
  ]) flags(planReads, source, "plan-unresolved");
  for (const source of [
    "const reads = deps.edits.peek; edits.run(reads => reads.source(path));",
    "function textPlan() { const shown = ports.source(path); return r => r.source(path) === shown ? { stayed: \"\" } : { refuse: \"\" }; } edits.run(textPlan());",
    "function plan(r) { return r.source(path); } function act() { const ports = { source: () => \"\" }; edits.run(plan); }",
  ]) assert.deepEqual(planReads(source, FAKE), [], source);
});

test("untracked source reads follow receiver aliases without crossing shadowed bindings", () => {
  for (const receiver of ["ports", "deps"]) {
    for (const read of ['host.source(path)', 'second["source"](path)', 'source(path)']) {
      const aliases = `const host = ${receiver}; const second = host; const { source } = second;`;
      flags(planReads, `${aliases} edits.run(r => ${read});`, "plan-read");
      flags(readsHelpers, `${aliases} function plan(r: Reads) { return ${read}; }`, "reads-helper");
    }
  }
  for (const source of [
    "const host = ports; function plan(host, r: Reads) { return host.source(path); }",
    "const host = deps; function act(host) { edits.run(r => host.source(path)); }",
    "const host = ports; edits.run(host => host.source(path));",
    "const host = r; edits.run(r => host.source(path));",
    "const host = second; const second = host; edits.run(r => host.source(path));",
  ]) {
    assert.deepEqual(planReads(source, FAKE), [], source);
    assert.deepEqual(readsHelpers(source, FAKE), [], source);
  }
});

test("findings use the innermost named function and count shared plans once", () => {
  const source = "function outer() { const plan = r => { const nested = () => ports.source(path); }; edits.now(plan); edits.run(plan); }";
  const hits = planReads(source, FAKE);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].function, "nested");
  assert.equal(readsHelpers("class Settings { apply(r: Reads) { return ports.source(path); } }", FAKE)[0].function, "apply");
});

test("Reads helpers reject untracked readers but permit UI defaults at declaration", () => {
  for (const source of ["function insertPlan(r: Reads) { return ports.source(path); }", "const slotChipPlan = (reads: Reads) => () => edits.peek.source(path);", "class Settings { apply(values, r: Reads) { return nativeSources(); } }"]) flags(readsHelpers, source, "reads-helper");
  for (const source of ["function insertPlan(r: Reads = ports.edits.peek) { return r.source(path); }", "function paint() { return ports.edits.peek.source(path); }"]) assert.deepEqual(readsHelpers(source, FAKE), [], source);
});

test("plans must pass Reads to helpers with peek defaults", () => {
  const helper = "function helper(path, r: Reads = ports.edits.peek) { return r.source(path); }";
  flags(planReads, "const helper = function named(path, r: Reads = edits.peek) { return r.source(path); }; edits.now(r => helper(path));", "plan-default");
  for (const call of ["helper(path)", "helper(path, undefined)"]) flags(planReads, `${helper} edits.run(r => ${call});`, "plan-default");
  for (const source of [`${helper} edits.run(r => helper(path, r));`, `${helper} helper(path);`, `${helper} edits.run(r => r.source(path));`]) assert.deepEqual(planReads(source, FAKE), [], source);
});

test("controller and builder stale compares reject generation, scope and revision operands", () => {
  for (const compare of ["currentGeneration === epoch", "epoch !== ports.generation?.()", "(origin.revision as string)! == target", "target != (setupScope() satisfies string)", "!currentGeneration === false", 'origin["revision"] === value']) {
    flags(staleCompares, compare, "stale-compare");
    assert.equal(staleCompares(compare, "src/page-builder/fake.ts").length, 1);
    for (const file of ["src/main.ts", "src/guarded-edit.ts", "src/guarded-edit/commit.ts"]) assert.deepEqual(staleCompares(compare, file), []);
  }
  for (const source of ['outcome.changed === "generation"', "current === target", '"revision" != label']) assert.deepEqual(staleCompares(source, FAKE), [], source);
});

test("real source tree uses tracked plan reads and module-owned edit staleness", () => {
  const hits = realHits.filter(hit => ![...allowlist, ...waits].some(entry => matches(hit, entry)));
  assert.equal(hits.length, 0, hits.map(hit => `${hit.file}:${hit.line} ${hit.rule} ${hit.function}: ${hit.text}`).join("\n"));
});

test("every allowlist entry still matches exactly its count and gives a reason", () => {
  assert.deepEqual(staleEntries(realHits, [...allowlist, ...waits]), []);
  const entry: AllowlistEntry = { file: FAKE, match: { rule: "stale-compare", function: "live" }, reason: "Controller lifetime, not edit staleness." };
  const hit = staleCompares("const live = () => epoch === generation;", FAKE);
  assert.deepEqual(staleEntries(hit, [entry]), []);
  for (const hits of [[], [...hit, ...hit]]) assert.deepEqual(staleEntries(hits, [entry]), [entry]);
  assert.deepEqual(staleEntries([...hit, ...hit], [{ ...entry, count: 2 }]), []);
  assert.deepEqual(staleEntries(hit, [{ ...entry, reason: " " }]), [{ ...entry, reason: " " }]);
});
