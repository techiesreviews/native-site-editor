import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { posix } from "node:path";
import type * as TS from "typescript-eslint-api/node_modules/typescript";

// TypeScript 7 has no JavaScript API; this package owns the TS 6 parser.
const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");

type Rule = "reader-name" | "dom-read" | "reader-module";
type Finding = { file: string; line: number; rule: Rule; function: string; text: string };
type AllowlistEntry = { file: string; match: string; reason: string; count?: number };
type Detector = (source: string, file: string) => Finding[];
type FunctionBody = TS.FunctionLikeDeclaration & { body: TS.ConciseBody };
const READERS = new Set(["parseMarked", "markedRange", "elementPathAt", "parseSource", "nativeOutline", "startTags", "startTagAttribute", "startTagAttributes", "decodedText", "decodeEntities", "decodeEntity", "plainText", "elementTree", "elementText", "breakText", "breaksAllowed", "breakSpelling"]);
const DOM = new Set(["innerHTML", "outerHTML", "innerText", "textContent", "DOMParser", "createContextualFragment"]);
const MODULES = new Set(["shared/html-source", "src/native-source-location", "src/page-builder/native-operations", "src/page-builder/html-entities"]);
function readerName(name: string) {
  return READERS.has(name) || name.startsWith("locateNativeElement") || name.startsWith("decodeHtmlEntit");
}
function domName(name: string) {
  return DOM.has(name) || name.startsWith("querySelector") || name.startsWith("getAttribute");
}
const readerAllowlist: AllowlistEntry[] = [
  { file: "src/page-builder/card-grid.ts", match: "decodeHtmlEntities", reason: "The title mapping decodes raw source slices that are not tree nodes (design section 6, slice 43).", count: 2 },
  { file: "src/page-builder/card-grid.ts", match: "decodeHtmlEntity", reason: "The title mapping maps decoded matches back to their source spelling (design section 6, slice 43).", count: 2 },
  // The tree would read CR LF as LF where templateSlots and itemsSlotRule keep it, and Add card would then refuse.
  { file: "src/page-builder/card-slot.ts", match: "decodeHtmlEntities", reason: "cardSlotOf decodes a template slot name as component-model's templateSlots and the insert engine's itemsSlotRule do, so Add card names the slot the writer accepts; moves when component templates read through the tree.", count: 2 },
];
const domAllowlist: AllowlistEntry[] = [];
const moduleAllowlist: AllowlistEntry[] = [
  { file: "src/page-builder/card-slot.ts", match: "nativeInstanceInsertEdit", reason: "The strict tree's insert engine writes the new card; card code reads through the source tree (design section 5)." },
  { file: "src/page-builder/cards.ts", match: "isSectionTemplate", reason: "This checks whether a template is a section, rather than reading the page tree." },
  { file: "src/page-builder/card-grid.ts", match: "textRangeInSource", reason: "withTitle maps a decoded title match back to its source spelling (design section 6, slice 43)." },
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
// The property a destructured name is taken from: `{ step }`, `{ step: move }`, `{ ["step"]: move }`.
function bindingKey(node: TS.BindingElement): string | undefined {
  const key = node.propertyName ?? node.name;
  if (ts.isComputedPropertyName(key)) {
    const literal = strip(key.expression);
    return ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal) ? literal.text : undefined;
  }
  return ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : undefined;
}
// Member names and import/export source names are references; declaration names and text are not.
function referenceName(node: TS.Node): string | undefined {
  const access = member(node);
  if (access) return access.name;
  if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) return (node.propertyName ?? node.name).text;
  if (ts.isBindingElement(node)) return bindingKey(node);
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

// One file at a time, without imports or lib: the checker binds the file's own names, so a
// renamed import or an alias resolves to the reader it stands for.
function checkerFor(tree: TS.SourceFile): TS.TypeChecker {
  const file = tree.fileName;
  const host: TS.CompilerHost = {
    getSourceFile: name => name === file ? tree : undefined, fileExists: name => name === file, readFile: () => undefined, writeFile: () => {},
    getDefaultLibFileName: () => "lib.d.ts", getCurrentDirectory: () => "", getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
  };
  return ts.createProgram([file], { noLib: true, noResolve: true, types: [] }, host).getTypeChecker();
}
function inType(node: TS.Node) {
  for (let parent: TS.Node | undefined = node; parent; parent = parent.parent) {
    if (ts.isTypeNode(parent) || ts.isImportTypeNode(parent)) return true;
    if ((ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) && parent.isTypeOnly) return true;
    if (ts.isImportClause(parent) && parent.isTypeOnly || ts.isExportDeclaration(parent) && parent.isTypeOnly) return true;
  }
  return false;
}
// A same-file name standing for a reader: a renamed import, a destructured key, or a const bound to one.
function standsForReader(checker: TS.TypeChecker, node: TS.Node, depth = 0): boolean {
  const symbol = ts.isIdentifier(node) && depth <= 8 ? checker.getSymbolAtLocation(node) : undefined;
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!declaration) return false;
  if (ts.isImportSpecifier(declaration)) return !inType(declaration) && readerName((declaration.propertyName ?? declaration.name).text);
  if (ts.isBindingElement(declaration)) return readerName(bindingKey(declaration) ?? "");
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return false;
  let value = strip(declaration.initializer);
  // `reader.bind(null)` is the reader.
  const bound = ts.isCallExpression(value) ? member(strip(value.expression)) : undefined;
  if (bound?.name === "bind") value = strip(bound.receiver);
  return readerName(referenceName(value) ?? "") || standsForReader(checker, value, depth + 1);
}
// Reader declarations also catch a hand-written low-level reader returning to a card file; type positions read nothing.
const readerNames: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  let checker: TS.TypeChecker | undefined;
  walk(tree, node => {
    const declaration = (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name) ? node.name : undefined;
    const name = declaration?.text ?? referenceName(node);
    if (!name || inType(node)) return;
    if (readerName(name) || !declaration && ts.isIdentifier(node) && standsForReader(checker ??= checkerFor(tree), node)) hits.push(finding(tree, declaration ?? node, "reader-name"));
  });
  return hits;
};
const domReads: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, node => {
    const name = referenceName(node);
    if (name && domName(name) && !inType(node)) hits.push(finding(tree, node, "dom-read"));
  });
  return hits;
};
function readerModule(specifier: TS.Node | undefined, file: string) {
  return !!specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier)) && specifier.text.startsWith(".")
    && MODULES.has(posix.normalize(posix.join(posix.dirname(file), specifier.text)).replace(/\.[cm]?[jt]s$/, ""));
}
const readerModules: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  const named = (node: TS.ImportSpecifier | TS.ExportSpecifier) => {
    const name = (node.propertyName ?? node.name).text;
    if (!node.isTypeOnly && !readerName(name) && name !== "readPage" && name !== "VOID_ELEMENTS") hits.push(finding(tree, node, "reader-module"));
  };
  walk(tree, node => {
    if (ts.isImportDeclaration(node) && readerModule(node.moduleSpecifier, file)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      if (!clause) hits.push(finding(tree, node, "reader-module"));
      if (clause?.name) hits.push(finding(tree, clause.name, "reader-module"));
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) hits.push(finding(tree, bindings, "reader-module"));
      if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach(named);
    }
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && readerModule(node.moduleSpecifier, file)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) node.exportClause.elements.forEach(named);
      else hits.push(finding(tree, node, "reader-module"));
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && readerModule(node.arguments[0], file)) hits.push(finding(tree, node, "reader-module"));
  });
  return hits;
};
const guards = [
  { detect: readerNames, allowlist: readerAllowlist },
  { detect: domReads, allowlist: domAllowlist },
  { detect: readerModules, allowlist: moduleAllowlist },
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

// List this directory so newly added card files join the guard automatically.
const files = readdirSync(new URL("../src/page-builder/", import.meta.url))
  .filter(name => /^card-.*\.ts$/.test(name) || name === "cards.ts")
  .map(name => `src/page-builder/${name}`);
const realHits = guards.map(({ detect }) => files.flatMap(file => detect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), file)));
const FAKE = "src/page-builder/card-fake.ts";
function flags(detect: Detector, source: string, rule: Rule) {
  const hits = detect(source, FAKE);
  assert.ok(hits.some(hit => hit.rule === rule), source);
  assert.ok(hits.every(hit => hit.file === FAKE && hit.line >= 1 && hit.text.length > 0));
}

test("reader-name rejects every low-level reader reference and declaration", () => {
  for (const name of [...READERS, "locateNativeElement", "locateNativeElementRange", "locateNativeElementOther", "decodeHtmlEntities", "decodeHtmlEntity", "decodeHtmlEntityOther"]) {
    for (const source of [
      `import { ${name} } from "./reader";`, `import { ${name} as read } from "./reader";`,
      `export { ${name} } from "./reader";`, `export { ${name} as read } from "./reader";`,
      `${name}();`, `const read = ${name};`, `ns.${name};`, `ns["${name}"];`,
      `ns?.${name}();`, `ns?.["${name}"]?.();`, `${name}?.();`, `ns[\`${name}\`]();`,
      `const { ${name} } = ns;`, `const { ${name}: read } = ns;`, `const { ["${name}"]: read } = ns;`,
      `function ${name}() { return []; }`, `const ${name} = () => [];`,
    ]) flags(readerNames, source, "reader-name");
  }
});

test("reader-name counts every use of a renamed import, destructured name or alias", () => {
  const uses = (source: string) => readerNames(source, FAKE).filter(hit => hit.text === "decode").length;
  assert.equal(uses('import { decodeHtmlEntities as decode } from "./html-entities"; decode(a); decode(b);'), 2);
  assert.equal(uses('const { plainText: decode } = model; decode(a); decode(b);'), 2);
  assert.equal(uses('import { decodeHtmlEntities } from "./html-entities"; const first = decodeHtmlEntities; const decode = first; decode(a); decode(b);'), 2);
  assert.equal(uses('import * as model from "./component-model"; const decode = model.elementText; decode(a);'), 1);
  assert.equal(uses('import { decodeHtmlEntities } from "./html-entities"; const decode = decodeHtmlEntities.bind(null); decode(a); decode(b);'), 2);
  // A value a reader returned is text, not a reader; a shadowing parameter is not the import.
  assert.equal(uses('import { decodeHtmlEntities } from "./html-entities"; const decode = decodeHtmlEntities(raw); use(decode);'), 0);
  assert.equal(uses('import { decodeHtmlEntities as decode } from "./html-entities"; function f(decode) { return decode(a); }'), 0);
});

test("reader-name ignores text, object keys, type positions and the tree's public readers", () => {
  for (const source of [
    '// parseMarked();\nconst text = "plainText";', 'const text = `elementTree parseSource`;',
    'plain(tree.text()); readSource(source); readPage(source); plainTextual();',
    'const value = { plainText: 1, parseSource: 2 };',
    'import type { parseSource } from "./source-tree"; type Parser = typeof parseSource;',
    'import { type plainText as text } from "./component-model"; export type { elementText } from "./component-model"; let read: typeof text;',
  ]) assert.deepEqual(readerNames(source, FAKE), [], source);
});

test("dom-read rejects every DOM reader through members, optional calls and destructuring", () => {
  for (const name of [...DOM, "querySelector", "querySelectorAll", "querySelectorOther", "getAttribute", "getAttributeNames", "getAttributeNode", "getAttributeOther"]) {
    for (const source of [
      `el.${name};`, `el?.${name}();`, `el["${name}"];`, `el?.["${name}"]?.();`,
      `const { ${name} } = el;`, `const { ${name}: read } = el;`, `const { ["${name}"]: read } = el;`, `${name};`,
    ]) flags(domReads, source, "dom-read");
  }
  flags(domReads, 'new DOMParser();', "dom-read");
  flags(domReads, 'new globalThis.DOMParser();', "dom-read");
});

test("dom-read ignores tree reads, object keys, strings and comments", () => {
  for (const source of [
    'tree.text(node); tree.attribute(node, "title");', 'const value = { textContent: x };',
    'type Parser = typeof DOMParser; let read: Element["textContent"]; import type { querySelector } from "./dom";',
    '// el.querySelector("a");\nconst text = "innerHTML DOMParser";', 'const text = `textContent getAttribute`;',
  ]) assert.deepEqual(domReads(source, FAKE), [], source);
});

const specifiers = ["../../shared/html-source", "../native-source-location", "./native-operations", "./html-entities"]
  .flatMap(module => [module, `${module}.ts`, `${module}.js`]);
test("reader-module rejects value imports, re-exports and dynamic imports from each reading module", () => {
  for (const module of specifiers) {
    for (const source of [
      `import { x } from "${module}";`, `import { x as read } from "${module}";`,
      `import * as h from "${module}";`, `import h from "${module}";`, `import "${module}";`,
      `export * from "${module}";`, `export * as h from "${module}";`,
      `export { x } from "${module}";`, `export { x as read } from "${module}";`, `import("${module}");`, `import(\`${module}\`);`,
    ]) flags(readerModules, source, "reader-module");
  }
});

test("reader-module permits type imports, adapter and tag-list names, and unrelated modules", () => {
  for (const module of specifiers) {
    for (const source of [
      `import type { X } from "${module}";`, `import type X from "${module}";`, `import type * as h from "${module}";`,
      `import { type X } from "${module}";`, `export type { X } from "${module}";`, `export { type X } from "${module}";`,
      `export type * from "${module}";`, `import { readPage, VOID_ELEMENTS as tags } from "${module}";`,
      `export { readPage as page, VOID_ELEMENTS } from "${module}";`,
      `import { parseSource, decodeHtmlEntity } from "${module}";`,
      `export { parseSource as read } from "${module}";`,
    ]) assert.deepEqual(readerModules(source, FAKE), [], source);
    const mixed = readerModules(`import { type X, readPage, x } from "${module}";`, FAKE);
    assert.deepEqual(mixed.map(hit => hit.text), ["x"]);
  }
  for (const module of ["./my-html-source", "./source-tree", "./source-tree.ts"]) {
    for (const source of [`import { x } from "${module}";`, `export * from "${module}";`, `import("${module}");`])
      assert.deepEqual(readerModules(source, FAKE), [], source);
  }
});

test("all card files read HTML through the source tree with only named exceptions", () => {
  for (const name of ["card-fill.ts", "card-link-css.ts", "card-grid.ts", "card-looks.ts", "card-slot.ts", "card-source.ts", "card-swap.ts", "cards.ts"])
    assert.ok(files.includes(`src/page-builder/${name}`), name);
  assert.ok(files.every(file => /^src\/page-builder\/(?:card-.*|cards)\.ts$/.test(file)));
  assert.deepEqual(guards.flatMap(({ allowlist }, index) => unallowed(realHits[index], allowlist)), []);
});

test("every allowlist entry gives a reason and matches exactly its count; stale entries fail", () => {
  guards.forEach(({ allowlist }, index) => assert.deepEqual(staleEntries(realHits[index], allowlist), []));
  const hit = readerNames('function broken() { plainText(); }', FAKE);
  const entry = { file: FAKE, match: "broken", reason: "A fixture exception." };
  assert.deepEqual(unallowed(hit, [entry]), []);
  assert.deepEqual(unallowed(hit, [{ ...entry, match: "plainText" }]), []);
  assert.deepEqual(unallowed(hit, [{ ...entry, file: "src/page-builder/card-other.ts" }]), hit);
  assert.deepEqual(staleEntries(hit, [entry]), []);
  for (const hits of [[], [...hit, ...hit]]) assert.deepEqual(staleEntries(hits, [entry]), [entry]);
  assert.deepEqual(staleEntries([...hit, ...hit], [{ ...entry, count: 2 }]), []);
  const empty = { ...entry, reason: " " };
  assert.deepEqual(staleEntries(hit, [empty]), [empty]);
});
