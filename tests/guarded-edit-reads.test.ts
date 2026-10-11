import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import type * as TS from "typescript-eslint-api/node_modules/typescript";

// TypeScript 7 has no JavaScript API; this package owns the TS 6 parser.
const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");
type Rule = "plan-read" | "plan-unresolved" | "plan-wait" | "reads-helper" | "plan-default" | "stale-compare";
type Finding = { file: string; line: number; rule: Rule; function: string; text: string };
type AllowlistEntry = { rule: Rule; file: string; function: string; reason: string; count?: number };
type Detector = (source: string, file: string) => Finding[];
type FunctionBody = TS.FunctionLikeDeclaration & { body: TS.ConciseBody };
// Exact counts keep a new compare in the same function from inheriting an exception.
const allowlist: AllowlistEntry[] = [
  { rule: "stale-compare", file: "src/controllers/agent-controller.ts", function: "isCurrent", reason: "Agent menu load epoch pins the account and host, not edit staleness." },
  { rule: "stale-compare", file: "src/controllers/agent-controller.ts", function: "ensure", reason: "Agent menu load epoch deduplicates lazy loads for the same account and host." },
  { rule: "stale-compare", file: "src/controllers/agent-controller.ts", function: "start", reason: "Agent menu load epoch prevents a discovery retry after controller disposal." },
  { rule: "stale-compare", file: "src/controllers/boot-controller.ts", function: "current", reason: "Boot read generation rejects a superseded login/session load, not an edit." },
  { rule: "stale-compare", file: "src/controllers/boot-controller.ts", function: "start", reason: "Boot read generation pins the failure handoff to the session it owns." },
  { rule: "stale-compare", file: "src/controllers/command-palette-controller.ts", function: "live", reason: "Palette controller lifetime counter prevents an obsolete palette from using live ports." },
  { rule: "stale-compare", file: "src/controllers/history-controller.ts", function: "live", reason: "History panel load counter owns its lazy mount; edit staleness belongs to the module." },
  { rule: "stale-compare", file: "src/controllers/preview-selection-controller.ts", function: "editableTemplatePath", reason: "Preview selection intent pins the editable template to the file generation that selected it." },
  { rule: "stale-compare", file: "src/controllers/preview-selection-controller.ts", function: "select", reason: "Preview selection intents reject stale instance clicks and superseded file reveals, not edits.", count: 2 },
  { rule: "stale-compare", file: "src/controllers/preview-selection-controller.ts", function: "replayPending", reason: "Preview selection intent is replayed only in its original file generation." },
  { rule: "stale-compare", file: "src/controllers/save-publish-controller.ts", function: "findDeletedUpstream", reason: "Boot-triggered draft reconciliation checks its read generation before looking for upstream deletions; not a guarded edit plan." },
  { rule: "stale-compare", file: "src/controllers/setup-entry-controller.ts", function: "live", reason: "Setup wizard's own lifetime counter prevents obsolete lazy mounts." },
  { rule: "stale-compare", file: "src/controllers/setup-entry-controller.ts", function: "remember", reason: "Setup wizard's own lifetime counter prevents a disposed wizard from saving onboarding memory." },
  { rule: "stale-compare", file: "src/controllers/setup-entry-controller.ts", function: "finish", reason: "Setup wizard's own lifetime counter prevents a disposed wizard from finishing onboarding." },
  { rule: "stale-compare", file: "src/controllers/setup-entry-controller.ts", function: "exit", reason: "Setup wizard's own lifetime counter prevents either disposed wizard variant from closing its replacement.", count: 2 },
  { rule: "stale-compare", file: "src/controllers/setup-entry-controller.ts", function: "openOwner", reason: "Setup wizard's own lifetime counter rejects a superseded owner-setup load." },
];
// Same-file helpers a plan calls are scanned too, except these waits: the module re-proves
// every read after them, and the plan reads what it uses through `r` once they settle.
const waits: AllowlistEntry[] = [
  { rule: "plan-wait", file: "src/main.ts", function: "ensureNativeTextIndex", reason: "The site's text index load (open404 via nativeSiteReadForCreate) is a wait: it fills the index from branch bases and drafts for search and labels, not the plan's bytes." },
];

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
    if (ts.isStringLiteral(key)) return { name: key.text, receiver: node.expression };
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
// nativePictureSources parses supplied bytes only; these readers reach host file bytes.
const nativeReaders = new Set(["nativeEffectiveSource", "nativeEditableSource", "nativeSources", "nativeBaseSources", "nativePreviewSources", "nativePageShownSources", "nativeRouteShownSources", "nativeAssetSources", "nativeLinkSources"]);
// `reads !== peek` compares readers; it reads no bytes.
function identityCompare(node: TS.Node) {
  let operand = node;
  while (operand.parent && strip(operand.parent) === operand) operand = operand.parent;
  const parent = operand.parent;
  return !!parent && ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind);
}
function untracked(node: TS.Node): boolean {
  if (inPeekDefault(node) || identityCompare(node)) return false;
  const access = member(node);
  if (access) {
    if (access.name === "peek" || nativeReaders.has(access.name)) return true;
    const receiver = strip(access.receiver);
    if (access.name === "source" && (receiver.getText() === "deps" || receiver.getText() === "ports")) return true;
    if (access.name === "get" && ts.isCallExpression(receiver) && strip(receiver.expression).getText() === "draftStore") return true;
  }
  if (!ts.isIdentifier(node) || !nativeReaders.has(node.text)) return false;
  // A member is reported once, at its access, not again at its property name.
  const parent = node.parent;
  return !(ts.isPropertyAccessExpression(parent) && parent.name === node)
    && !((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.name === node);
}
// Resolve same-file names in the nearest lexical scope, including plan factories.
function functions(tree: TS.SourceFile) {
  const declarations: { name: string; scope: TS.Node; body: FunctionBody }[] = [];
  walk(tree, node => {
    if (!isFunction(node)) return;
    const name = boundName(node) ?? functionName(node);
    if (!name) return;
    let scope = node.parent;
    while (!ts.isSourceFile(scope) && !ts.isBlock(scope) && !isFunction(scope)) scope = scope.parent;
    declarations.push({ name, scope, body: node });
  });
  return (expression: TS.Node): FunctionBody | undefined => {
    expression = strip(expression);
    if (isFunction(expression)) return expression;
    if (ts.isCallExpression(expression)) expression = strip(expression.expression);
    if (!ts.isIdentifier(expression)) return undefined;
    for (let scope: TS.Node | undefined = expression.parent; scope; scope = scope.parent) {
      const declaration = declarations.find(item => item.name === expression.getText() && item.scope === scope);
      if (declaration) return declaration.body;
    }
    return undefined;
  };
}
const planReads: Detector = (source, file) => {
  const tree = parse(source, file), resolve = functions(tree), hits: Finding[] = [];
  const seen = new Set<string>();
  const report = (node: TS.Node, rule: Rule, name?: string) => {
    const key = `${rule}:${name ?? node.pos}`;
    if (!seen.has(key)) { seen.add(key); hits.push({ ...finding(tree, node, rule), ...name ? { function: name } : {} }); }
  };
  walk(tree, node => {
    if (!ts.isCallExpression(node)) return;
    const access = member(strip(node.expression));
    if (!access || !["run", "now"].includes(access.name) || !/edits$/i.test(strip(access.receiver).getText()) || !node.arguments[0]) return;
    const plan = resolve(node.arguments[0]);
    if (!plan) return report(node.arguments[0], "plan-unresolved");
    const bodies = [plan], scanned = new Set<TS.Node>();
    for (let body = bodies.pop(); body; body = bodies.pop()) {
      if (scanned.has(body)) continue;
      scanned.add(body);
      walk(body.body, read => {
        if (untracked(read)) report(read, "plan-read");
        if (!ts.isCallExpression(read)) return;
        const helper = resolve(read.expression), name = helper && functionName(helper);
        if (name && waits.some(wait => wait.file === file && wait.function === name)) report(read, "plan-wait", name);
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
  const tree = parse(source, file), hits: Finding[] = [], seen = new Set<number>();
  walk(tree, node => {
    if (!isFunction(node) || !node.parameters.some(readsParameter)) return;
    walk(node.body, read => {
      if (untracked(read) && !seen.has(read.pos)) { seen.add(read.pos); hits.push(finding(tree, read, "reads-helper")); }
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
function matches(hit: Finding, entry: AllowlistEntry) {
  return hit.rule === entry.rule && hit.file === entry.file && hit.function === entry.function;
}
function staleEntries(hits: Finding[], entries: AllowlistEntry[] = [...allowlist, ...waits]) {
  return entries.filter(entry => !entry.reason.trim() || hits.filter(hit => matches(hit, entry)).length !== (entry.count ?? 1));
}
function sourceFiles(directory: string): string[] {
  return readdirSync(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:[cm]?[jt]s|tsx)$/.test(file) ? [file] : [];
  });
}
const realHits = [...sourceFiles("src"), ...sourceFiles("shared")].flatMap(file => {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
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
  // A listed wait is reported once (its allowlist entry) and not scanned.
  const wait = "async function ensureNativeTextIndex() { return nativeBaseSources.get(path); } edits.run(async r => { await ensureNativeTextIndex(); await ensureNativeTextIndex(); return r.source(path); });";
  assert.deepEqual(planReads(wait, "src/main.ts").map(hit => [hit.rule, hit.function]), [["plan-wait", "ensureNativeTextIndex"]]);
  flags(planReads, wait, "plan-read");
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
  assert.deepEqual(staleEntries(realHits), []);
  const entry: AllowlistEntry = { rule: "stale-compare", file: FAKE, function: "live", reason: "Controller lifetime, not edit staleness." };
  const hit = staleCompares("const live = () => epoch === generation;", FAKE);
  assert.deepEqual(staleEntries(hit, [entry]), []);
  for (const hits of [[], [...hit, ...hit]]) assert.deepEqual(staleEntries(hits, [entry]), [entry]);
  assert.deepEqual(staleEntries([...hit, ...hit], [{ ...entry, count: 2 }]), []);
  assert.deepEqual(staleEntries(hit, [{ ...entry, reason: " " }]), [{ ...entry, reason: " " }]);
});
