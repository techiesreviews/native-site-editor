import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, finding, nameFindings, moduleReferences, modulePath, unallowed, staleEntries, sourceFiles, readSource, type AllowlistEntry, type Detector } from "./support/source-guard.ts";

type Rule = "reader-name" | "dom-read" | "reader-module";

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

// Reader declarations also catch a hand-written low-level reader returning to a card file; type positions read nothing.
const readerNames: Detector = (source, file) => nameFindings(source, file, "reader-name", readerName, true);
const domReads: Detector = (source, file) => nameFindings(source, file, "dom-read", domName);
const readerModules: Detector = (source, file) => moduleReferences(parse(source, file))
  .filter(ref => MODULES.has(modulePath(ref.module, file))
    && (ref.name === undefined || !readerName(ref.name) && !["readPage", "VOID_ELEMENTS"].includes(ref.name)))
  .map(ref => finding(ref.node.getSourceFile(), ref.node, "reader-module"));
const guards = [
  { detect: readerNames, allowlist: readerAllowlist },
  { detect: domReads, allowlist: domAllowlist },
  { detect: readerModules, allowlist: moduleAllowlist },
];

// List this directory so newly added card files join the guard automatically.
const files = sourceFiles("src/page-builder").filter(file => /^src\/page-builder\/(?:card-.*|cards)\.ts$/.test(file));
const realHits = guards.map(({ detect }) => files.flatMap(file => detect(readSource(file), file)));
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
