import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import type * as TS from "typescript-eslint-api/node_modules/typescript";

// TypeScript 7 has no JavaScript API; this package owns the TS 6 parser.
const ts: typeof TS = createRequire(import.meta.url)("typescript-eslint-api");
type Finding = { file: string; line: number; rule: string; text: string };
// `count`: how many findings the entry covers (default 1), so a new one beside it fails too.
type AllowlistEntry = { file: string; match: string; reason: string; count?: number };
type Detector = (source: string, file: string) => Finding[];
const LINK = "src/components/preview-link.ts";
const RUNTIME = "src/components/native-preview-runtime.js";
const RULES = "src/page-builder/rules/";

const DRAFTS = "BroadcastChannel announces draft changes between editor tabs, not to the preview frame.";
const OPTIMISER = "The image optimisation Worker receives jobs and returns results independently of the preview.";
const OPTIMISER_SIDE = "The image optimisation worker endpoint replies to its owner, not to the preview frame.";
const postAllowlist: AllowlistEntry[] = [
  { file: "src/drafts.ts", match: "channel", reason: DRAFTS },
  { file: "src/page-builder/media-optimise.ts", match: "worker", reason: OPTIMISER },
  { file: "src/page-builder/image-optimise.worker.ts", match: "self", reason: OPTIMISER_SIDE, count: 3 },
  { file: RUNTIME, match: "parent", reason: "The runtime's posts (emit and ready) are the frame side; preview-wire.test.ts pins their types and shapes.", count: 2 },
];
const listenerAllowlist: AllowlistEntry[] = [
  { file: "src/drafts.ts", match: "channel", reason: DRAFTS },
  { file: "src/page-builder/media-optimise.ts", match: "worker", reason: OPTIMISER },
  { file: "src/page-builder/image-optimise.worker.ts", match: "self", reason: OPTIMISER_SIDE },
  { file: RUNTIME, match: "window", reason: "The runtime's one host listener is the frame side; preview-wire.test.ts pins its source and handled types." },
];
const copiedAllowlist: AllowlistEntry[] = [
  { file: "src/page-builder/native-operations.ts", match: '["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em", "code", "pre", "a", "button", "option"]', reason: "textNodes constrains source-tree content and insertion destinations, including pre and option, rather than canvas text editing or repeated items (slice 24)." },
  { file: "src/page-builder/native-component-selection.ts", match: '/^(h[1-6]|p|span|a|button|img|picture|blockquote|figcaption|small|label|strong|em|b|i|cite|q|mark|code)$/', reason: "The default isContent predicate targets page-owned content through component slot assignments, rather than inline formatting or canvas text editing (slice 24)." },
  { file: "src/components/element-icons.ts", match: "p: textT, text: textT, a: link", reason: "The object maps element names to display icons, not membership in a builder rule." },
  { file: "src/native-structure.ts", match: "p: \"Paragraph\", a: \"Link\", button: \"Button\"", reason: "The object maps tag names to user-facing kind labels, not a shared tag membership rule." },
  { file: "src/page-builder/component-model.ts", match: "[\"h1\", \"h2\", \"h3\", \"h4\", \"h5\", \"h6\", \"p\", \"li\", \"blockquote\", \"figcaption\", \"dt\", \"dd\", \"button\", \"label\", \"summary\", \"legend\", \"caption\", \"td\", \"th\", \"address\"]", reason: "TEXT_BLOCKS identifies block text lines for template planning, including address, rather than inline formatting or canvas text editing." },
  { file: "src/page-builder/component-model.ts", match: "[\"p\", \"h1\", \"h2\", \"h3\", \"h4\", \"h5\", \"h6\", \"span\", \"a\", \"button\", \"label\", \"em\", \"strong\", \"b\", \"i\", \"small\", \"summary\", \"legend\", \"caption\", \"dt\"]", reason: "PHRASING_PARENTS constrains which parents may retain detached component content, not which children are inline formatting." },
  { file: "src/page-builder/component-model.ts", match: "[\"p\", \"div\", \"h1\", \"h2\", \"h3\", \"h4\", \"h5\", \"h6\", \"section\", \"article\", \"blockquote\", \"ul\", \"ol\", \"figure\"]", reason: "BLOCKS identifies detached block content that cannot stand inside phrasing-only parents, not repeated item kinds." },
  { file: "src/page-builder/component-model.ts", match: "[\"section\", \"div\", \"article\", \"aside\", \"figure\", \"nav\"]", reason: "Make component uses this list to offer eligible page containers, not to identify repeated items." },
  { file: "src/page-builder/native-operations.ts", match: "[\"body\", \"main\", \"section\", \"article\", \"aside\", \"nav\", \"header\", \"footer\", \"div\", \"form\", \"fieldset\"", reason: "containers defines conservative source insertion destinations, not repeated item kinds." },
  { file: "src/page-builder/native-operations.ts", match: "\"a abbr address area article aside audio b base", reason: "htmlNames is the HTML vocabulary used to reject catalogue and foreign names in the strict source parser." },
  { file: "src/page-builder/native-operations.ts", match: "\"b big blockquote body br center code dd div", reason: "foreignBreakouts encodes HTML parser foreign-content breakout behaviour, not inline formatting or repeated items." },
];
const headingAllowlist: AllowlistEntry[] = [
  { file: "src/page-builder/component-model.ts", match: "export function templateStructure(", reason: "templateStructure renders structure rows and their heading labels while unwrapping slots; it does not decide whether a card has a heading slot." },
  { file: "src/page-builder/component-model.ts", match: "function planComponent(", reason: "planComponent chooses new component slots and names a linked title, rather than recognising an existing card heading slot." },
  { file: "src/page-builder/component-model.ts", match: "export function hasHeadingSlot(template: string) {\n  return headingSlotIn(parseSource(template), sourceView(template));\n}", reason: "This source-template adapter delegates directly to rules/cards.ts rather than copying its heading-slot walk." },
  { file: "src/page-builder/native-operations.ts", match: "const heading = node.name === \"section\" ? node.children.find", reason: "nativeOutline and its mapper (two findings, one walk) report section headings and slot names for the source outline, not card heading-slot eligibility.", count: 2 },
];

function parse(source: string, file: string) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function walk(node: TS.Node, visit: (node: TS.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
function finding(tree: TS.SourceFile, node: TS.Node, rule: string, text = node.getText(tree)): Finding {
  return { file: tree.fileName, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, rule, text };
}
function literal(node: TS.Node | undefined): string | undefined {
  // `"div" as const`, `("div")`, `"div"!` and `<const>"div"` are the same literal.
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}
function member(node: TS.Node): { name: string; receiver: TS.Expression } | undefined {
  if (ts.isPropertyAccessExpression(node)) return { name: node.name.text, receiver: node.expression };
  if (ts.isElementAccessExpression(node)) {
    const name = literal(node.argumentExpression);
    if (name !== undefined) return { name, receiver: node.expression };
  }
  return undefined;
}

// One link owns host posts: any read of `postMessage` (a call, a cast, a bound or aliased method).
const framePosts: Detector = (source, file) => {
  if (file === LINK) return [];
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, (node) => {
    const access = member(node);
    if (access?.name === "postMessage") hits.push(finding(tree, node, "frame-post", access.receiver.getText(tree)));
  });
  return hits;
};

// One link owns host listeners and protocol reads; wire source names live once.
const frameListeners: Detector = (source, file) => {
  const tree = parse(source, file), hits: Finding[] = [];
  const readers = new Set(["src/components/preview-protocol.ts", LINK, RUNTIME]);
  const protectedImports = new Set(["FRAME_SOURCE", "HOST_SOURCE", "readFrameMessage"]);
  walk(tree, (node) => {
    if (file !== LINK && ts.isCallExpression(node) && literal(node.arguments[0]) === "message") {
      // Any call naming "message" first: a listener added through a bound or aliased method too.
      const access = member(node.expression);
      const receiver = access?.name === "addEventListener" ? access.receiver.getText(tree)
        : ts.isIdentifier(node.expression) && node.expression.text === "addEventListener" ? "globalThis" : node.expression.getText(tree);
      hits.push(finding(tree, node, "frame-listener", receiver));
    }
    if (file !== LINK && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const access = member(node.left);
      if (access?.name === "onmessage") hits.push(finding(tree, node, "frame-listener", access.receiver.getText(tree)));
      else if (ts.isIdentifier(node.left) && node.left.text === "onmessage") hits.push(finding(tree, node, "frame-listener", "globalThis"));
    }
    if (file !== "src/components/preview-wire.ts" && ["astro-native-preview", "astro-native-preview-host"].includes(literal(node) ?? "")) {
      hits.push(finding(tree, node, "wire-source"));
    }
    if (!readers.has(file) && ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings) && /(?:^|\/)(?:preview-protocol|preview-wire)(?:\.ts)?$/.test(literal(node.moduleSpecifier) ?? "")) {
        hits.push(finding(tree, bindings, "protocol-import"));
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const entry of bindings.elements) {
          if (protectedImports.has((entry.propertyName ?? entry.name).text)) hits.push(finding(tree, entry, "protocol-import"));
        }
      }
    }
  });
  return hits;
};

const groups = [new Set("article li div figure a blockquote dd".split(" ")), new Set("strong em b i u s span".split(" "))];
function threeMembers(words: string[]) {
  const distinct = new Set(words);
  return groups.some((group) => [...distinct].filter((word) => group.has(word)).length >= 3);
}
// Only tag names form selector lists; ordinary words such as "in" and "an" do not.
const selectorTags = new Set("a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr big center listing nobr strike tt".split(" "));
function regexWords(text: string) {
  // Escapes are regex syntax, never tag names; character classes are not lists.
  return text.slice(1, text.lastIndexOf("/")).replace(/\\(?:x[\da-fA-F]{2}|u[\da-fA-F]{4}|.)/g, " ").replace(/\[[^\]]*\]/g, " ").match(/[a-z][a-z0-9-]*/g) ?? [];
}
// Rules live once in src/page-builder/rules/, including lists wrapped in Set.
const copiedRuleSets: Detector = (source, file) => {
  if (file.startsWith(RULES)) return [];
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, (node) => {
    let words: string[] = [];
    if (ts.isArrayLiteralExpression(node)) words = node.elements.map((entry) => literal(entry) ?? "");
    else if (ts.isObjectLiteralExpression(node)) words = node.properties.map((entry) => {
      const name = entry.name;
      if (!name) return "";
      if (ts.isIdentifier(name)) return name.text;
      if (ts.isComputedPropertyName(name)) return literal(name.expression) ?? "";
      return literal(name) ?? "";
    });
    else if (ts.isRegularExpressionLiteral(node)) words = regexWords(node.text);
    else if (literal(node) !== undefined) {
      const tokens = literal(node)!.trim().split(/[,|\s]+/);
      if (tokens.every((token) => selectorTags.has(token) || /^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(token))) words = tokens;
    }
    if (threeMembers(words)) hits.push(finding(tree, node, "copied-rule-set"));
  });
  return hits;
};

const walkNames = new Set(["dropCard", "dropHeading", "dropMeaningful", "hasHeadingSlot", "cardSlot", "dropItemsSlot", "cardsOnly"]);
function functionName(node: TS.FunctionLikeDeclaration): string | undefined {
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) return node.name.text;
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
  return undefined;
}
function headingSlotBody(body: TS.Node) {
  let headingRegex = false, slot = false;
  const headings = new Set<string>();
  walk(body, (node) => {
    if (ts.isRegularExpressionLiteral(node) && /h\[1-6\]|h[1-6](?:\|h[1-6]){2}/.test(node.text)) headingRegex = true;
    const word = literal(node);
    if (word && /^h[1-6]$/.test(word)) headings.add(word);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) {
      const other = literal(node.left) === "slot" ? node.right : literal(node.right) === "slot" ? node.left : undefined;
      if (other && /name|tag/i.test(other.getText())) slot = true;
    }
  });
  return slot && (headingRegex || headings.size >= 3);
}
// Card heading-slot walks belong to rules/cards.ts; imports and calls are fine.
const headingSlotWalks: Detector = (source, file) => {
  if (file.startsWith(RULES)) return [];
  const tree = parse(source, file), hits: Finding[] = [];
  walk(tree, (node) => {
    if (!ts.isFunctionDeclaration(node) && !ts.isFunctionExpression(node) && !ts.isArrowFunction(node) && !ts.isMethodDeclaration(node)) return;
    const name = functionName(node);
    if ((name && walkNames.has(name)) || (node.body && headingSlotBody(node.body))) hits.push(finding(tree, node, "heading-slot-walk"));
  });
  return hits;
};

const guards = [
  { detect: framePosts, allowlist: postAllowlist },
  { detect: frameListeners, allowlist: listenerAllowlist },
  { detect: copiedRuleSets, allowlist: copiedAllowlist },
  { detect: headingSlotWalks, allowlist: headingAllowlist },
];
function matches(hit: Finding, entry: AllowlistEntry) {
  return hit.file === entry.file && (hit.rule === "frame-post" || hit.rule === "frame-listener" ? hit.text === entry.match : hit.text.includes(entry.match));
}
function unallowed(hits: Finding[], allowlist: AllowlistEntry[]) {
  return hits.filter((hit) => !allowlist.some((entry) => matches(hit, entry)));
}
// An entry is stale without a reason, or when it no longer covers exactly its count of findings.
function staleEntries(hits: Finding[], allowlist: AllowlistEntry[]) {
  return allowlist.filter((entry) => !entry.reason.trim() || hits.filter((hit) => matches(hit, entry)).length !== (entry.count ?? 1));
}
function sourceFiles(directory: string): string[] {
  return readdirSync(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:[cm]?[jt]s|tsx)$/.test(file) ? [file] : [];
  });
}
const sources = [...sourceFiles("src"), ...sourceFiles("shared")].map((file) => ({ file, source: readFileSync(new URL(`../${file}`, import.meta.url), "utf8") }));
const realHits = guards.map(({ detect }) => sources.flatMap(({ source, file }) => detect(source, file)));
const FAKE = "src/components/fake.ts";

function flags(detect: Detector, source: string, rule: string) {
  const hits = detect(source, FAKE);
  assert.ok(hits.some((hit) => hit.rule === rule), source);
  assert.ok(hits.every((hit) => hit.file === FAKE && hit.line >= 1 && hit.text.length > 0));
}

test("frame posts reject frame receivers through chains, assertions, casts and aliases", () => {
  for (const source of ['frame.contentWindow?.postMessage({});', 'frame.contentWindow!.postMessage({});', '(x.contentWindow as Window).postMessage({});', 'window.postMessage({});', 'const peer = frame.contentWindow; peer.postMessage({});', 'frame.contentWindow["postMessage"]({});', '(frame.contentWindow.postMessage as Function)({});', 'const post = window.postMessage.bind(window);']) flags(framePosts, source, "frame-post");
  assert.deepEqual(unallowed(framePosts('worker.postMessage({});', "src/page-builder/media-optimise.ts"), postAllowlist), []);
  assert.deepEqual(framePosts('frame.contentWindow?.postMessage({});', LINK), []);
  assert.deepEqual(framePosts('// window.postMessage({});\nconst text = "postMessage";', FAKE), []);
});

test("frame listeners reject listeners, assignments, copied source names and protocol imports", () => {
  for (const source of ['window.addEventListener("message", receive);', 'window.onmessage = receive;', 'addEventListener("message", receive);', 'onmessage = receive;', 'window["onmessage"] = receive;', 'window.addEventListener.bind(window)("message", receive);', 'const on = window.addEventListener; on("message", receive);']) flags(frameListeners, source, "frame-listener");
  for (const source of ['const source = "astro-native-preview";', 'const source = `astro-native-preview-host`;']) flags(frameListeners, source, "wire-source");
  for (const name of ["FRAME_SOURCE", "HOST_SOURCE", "readFrameMessage"]) flags(frameListeners, `import { ${name} as renamed } from "./preview-protocol";`, "protocol-import");
  flags(frameListeners, 'import * as wire from "./preview-wire";', "protocol-import");
  assert.deepEqual(unallowed(frameListeners('worker.onmessage = receive;', "src/page-builder/media-optimise.ts"), listenerAllowlist), []);
  assert.deepEqual(frameListeners('window.addEventListener("click", receive); const text = "message";', FAKE), []);
  assert.deepEqual(frameListeners('import { readFrameMessage } from "./preview-protocol"; window.addEventListener("message", receive);', LINK), []);
});

test("copied rule sets reject arrays, object keys, regexes and plain tag lists", () => {
  for (const source of ['const tags = new Set(["article", "li", "div"]);', 'const tags = ["strong", "em", "b"];', 'const tags = { strong: true, em: true, ["span"]: true };', String.raw`const tags = /\b(?:strong|em|span)\b/;`, 'const tags = "article, li | div";', 'const tags = `strong em span`;', 'const tags = new Set(["article" as const, ("li"), "div" satisfies string]);']) flags(copiedRuleSets, source, "copied-rule-set");
  for (const source of ['const tags = ["strong", "em"];', 'const tags = ["strong", "strong", "em"];', 'const sentence = "a div in an article";', String.raw`const whitespace = /\s+\b/;`, 'const chars = /[bius]/;', 'const heading = /h[1-6]/;', 'const tags = /strong|em/i;']) assert.deepEqual(copiedRuleSets(source, FAKE), [], source);
  assert.deepEqual(copiedRuleSets('const tags = ["article", "li", "div"];', `${RULES}fake.ts`), []);
});

test("heading-slot guard rejects named declarations and renamed heading-slot walks", () => {
  for (const name of walkNames) {
    for (const source of [`function ${name}() {}`, `const ${name} = () => true;`, `let ${name} = function () {};`, `class Cards { ${name}() {} }`]) flags(headingSlotWalks, source, "heading-slot-walk");
  }
  flags(headingSlotWalks, 'function renamed(node) { return /^h[1-6]$/.test(node.localName) && node.localName === "slot"; }', "heading-slot-walk");
  flags(headingSlotWalks, 'const renamed = node => ["h1", "h2", "h3"].includes(node.name) && "slot" === node.name;', "heading-slot-walk");
  for (const source of ['import { hasHeadingSlot } from "../page-builder/rules/cards"; hasHeadingSlot(roots, view);', 'function heading(node) { return /^h[1-6]$/.test(node.localName); } function slot(node) { return node.localName === "slot"; }', 'function label(node) { return ["h1", "h2"].includes(node.name) && node.name === "slot"; }']) assert.deepEqual(headingSlotWalks(source, FAKE), [], source);
  assert.deepEqual(headingSlotWalks('function hasHeadingSlot() {}', `${RULES}cards.ts`), []);
});

test("real source tree keeps one frame link and one home for shared rules", () => {
  const hits = guards.flatMap(({ allowlist }, index) => unallowed(realHits[index], allowlist));
  assert.equal(hits.length, 0, hits.map((hit) => `${hit.file}:${hit.line} ${hit.rule}: ${hit.text.slice(0, 150)}`).join("\n"));
});

test("every allowlist entry still matches a detector finding and gives a reason", () => {
  guards.forEach(({ allowlist }, index) => assert.deepEqual(staleEntries(realHits[index], allowlist), []));
  const entry = { file: FAKE, match: "worker", reason: "Worker channel." };
  assert.deepEqual(staleEntries(framePosts('worker.postMessage({});', FAKE), [entry]), []);
  assert.deepEqual(staleEntries(framePosts('worker.send({});', FAKE), [entry]), [entry]);
  assert.deepEqual(staleEntries(framePosts('worker.postMessage({}); worker.postMessage({});', FAKE), [entry]), [entry], "a second finding under one entry fails");
  assert.deepEqual(staleEntries(framePosts('worker.postMessage({}); worker.postMessage({});', FAKE), [{ ...entry, count: 2 }]), []);
});
