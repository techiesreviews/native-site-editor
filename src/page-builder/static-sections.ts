import { startTags } from "../../shared/html-source";
import { splitSelectorList } from "../../shared/cascade";
import { resolveImportPath, parseCssImports } from "../../shared/css-imports";
import { nativePageRoute } from "../../shared/native-routes";
import { descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";
import { attribute } from "./collection-model";
import { scanCss, validateCssSource, type CssBlock } from "./css-write";
import { nativeMarkupInsertEdit } from "./native-operations";
import { headTags } from "./site-head";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, type JsonValue } from "./page-builder-document";

/** Editor-only catalogue. Published sections remain ordinary HTML and CSS. */
export interface StaticSectionRecord {
  id: string;
  label: string;
  rootClass: string;
  html: string;
  css: string;
  stylesheetPath: string;
  [key: string]: JsonValue;
}
export interface SectionChoice { id: string; label: string; rootClass: string }
export interface StaticSectionInsertInput {
  documentText: string | undefined;
  sectionId: string;
  pagePath: string;
  pageSource: string;
  /** Native body-relative element-child insertion path. */
  parent: readonly number[];
  index: number;
  /** Own undefined entries explicitly assert that a stylesheet is absent. */
  stylesheetSources: Readonly<Record<string, string | undefined>>;
  /** Complete file graph: required to prove a stylesheet is new. */
  files?: readonly string[];
}
/** Structural subset of the host's private NativeOperation, without host dependencies. */
export interface StaticSectionOperation {
  expectedSources: Map<string, string | undefined>;
  edits: Map<string, string>;
  creates?: { path: string; content: string }[];
  open: string;
  done: string;
  undone: string;
}
export interface StaticSectionInsertPlan {
  operation: StaticSectionOperation;
  selection: { path: string; node: number[] };
  /** The consumer must compare this graph immediately before applying the operation. */
  expectedFiles?: readonly string[];
}
const identifier = /^[a-z][a-z0-9_-]*$/;
const stylesheetPath = /^(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.css$/;
function reject(message: string): never { throw new Error(message); }
function plain(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject(`${label} must be a plain object.`);
}
function active(source: string): SourceElement[] {
  return [...descendants(parseSource(source))].filter((element) => {
    for (let parent = element.parent; parent; parent = parent.parent) if (["template", "noscript"].includes(parent.name)) return false;
    return true;
  });
}
function refuseDeclarations(html: string): void {
  const tags = new Map(startTags(html).map((tag) => [tag.start, tag]));
  const raw = [...descendants(parseSource(html))].filter((element) => ["script", "style", "textarea", "title", "iframe", "xmp", "noembed", "noframes"].includes(element.name) && element.close);
  for (let at = 0; at < html.length;) {
    const lt = html.indexOf("<", at);
    if (lt < 0) return;
    const protectedText = raw.find((element) => lt >= element.tag.end && lt < element.close!.start);
    if (protectedText) { at = protectedText.close!.start; continue; }
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) return; // The native validator refuses unfinished comments below.
      at = end + 3; continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) reject("Declarations are unsupported inside static section HTML.");
    at = tags.get(lt)?.end ?? lt + 1;
  }
}
function sectionHtml(record: StaticSectionRecord): void {
  refuseDeclarations(record.html);
  const nodes = parseSource(record.html);
  const roots = nodes.filter((node): node is SourceElement => node.type === "element");
  if (roots.length !== 1 || roots[0].name !== "section" || nodes.some((node) => node.type === "text" && record.html.slice(node.start, node.end).trim())) reject("A static section needs exactly one explicit <section> root.");
  for (const element of descendants(nodes)) {
    if (["script", "style", "slot", "template", "svg", "math"].includes(element.name) || element.name.includes("-")) reject("Static sections support ordinary HTML without scripts, embedded styles, custom tags, slots, templates or foreign markup.");
    const attrs = startTagAttributes(record.html, element.tag);
    if (new Set(attrs.map((attr) => attr.name)).size !== attrs.length) reject("Duplicate section attributes are unsupported.");
    if (attrs.some((attr) => attr.name === "shadowrootmode" || ["data-native-empty", "data-native-selection-box", "data-native-css-path", "data-native-spacing"].includes(attr.name))) reject("Editor-owned or shadow attributes cannot be published in a static section.");
  }
  const classes = (attribute(record.html, roots[0], "class") ?? "").split(/[\t\n\f\r ]+/);
  if (!classes.includes(record.rootClass)) reject("The section root must carry its ordinary rootClass.");
  if (!nativeMarkupInsertEdit("<html><head></head><body></body></html>", [], 0, record.html)) reject("Section HTML cannot be safely inserted: malformed, implied-closing or unsupported native markup.");
  const ids = [...descendants(nodes)].map((element) => attribute(record.html, element, "id")).filter((id): id is string => id !== undefined && id !== "");
  if (new Set(ids).size !== ids.length) reject("A section cannot contain duplicate authored ids.");
}
function rootedSelector(selector: string, rootClass: string): boolean {
  // Literal root spelling and conservative selector syntax; no shadow/nesting translation.
  if (/[\\&]/.test(selector) || /:host\b|::(?:slotted|part)\b|\/\*/i.test(selector) || !selector.startsWith(`.${rootClass}`)) return false;
  const after = selector.slice(rootClass.length + 1);
  if (after && !/^[\t\n\f\r .#[:>+~]/.test(after)) return false;
  let depth = 0, quote = "";
  for (let index = rootClass.length + 1; index < selector.length; index++) {
    const c = selector[index];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (!depth && /[\t\n\f\r >+~]/.test(c)) {
      const remaining = selector.slice(index).trimStart();
      return !remaining.startsWith("+") && !remaining.startsWith("~") && !remaining.startsWith("|");
    }
  }
  return true;
}
const trivia = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").trim();
function sectionCss(record: StaticSectionRecord): CssBlock[] {
  validateCssSource(record.css);
  const blocks = scanCss(record.css);
  const outer = blocks.filter((block) => !block.parent);
  let cursor = 0;
  for (const block of outer) {
    if (trivia(record.css.slice(cursor, block.start))) reject("Standalone CSS at-rules are unsupported in section styles.");
    cursor = block.end;
  }
  if (trivia(record.css.slice(cursor))) reject("Standalone CSS at-rules are unsupported in section styles.");
  for (const block of blocks) {
    if (/:host\b|::(?:slotted|part)\b/i.test(block.selector)) reject("Shadow-only CSS is unsupported in static sections.");
    if (block.selector.startsWith("@")) {
      if (!/^@(media|supports|container)\b/i.test(block.selector) || block.declarations.length || block.parent && !block.parent.selector.startsWith("@")) reject("Section styles support only rule-grouping @media, @supports and @container.");
      let at = block.open + 1;
      for (const child of block.children) { if (trivia(record.css.slice(at, child.start))) reject("Unsupported statement inside a section CSS group."); at = child.end; }
      if (trivia(record.css.slice(at, block.close))) reject("Unsupported statement inside a section CSS group.");
    } else {
      let at = block.open + 1;
      for (const declaration of block.declarations) { if (trivia(record.css.slice(at, declaration.start))) reject("Standalone CSS at-rules are unsupported in section styles."); at = declaration.end; }
      if (!block.children.length && trivia(record.css.slice(at, block.close))) reject("Standalone CSS at-rules are unsupported in section styles.");
      const selectors = splitSelectorList(block.selector);
      if (block.children.length || block.parent && !block.parent.selector.startsWith("@") || !selectors.length || /(?:^|,)\s*(?:,|$)/.test(block.selector) || selectors.some((selector) => !rootedSelector(selector, record.rootClass))) reject("Every section style selector must be rooted in its literal rootClass without global leakage or nesting.");
    }
  }
  return blocks;
}
function validateRecord(value: unknown, id: string): asserts value is StaticSectionRecord {
  plain(value, "Static section");
  if (!identifier.test(id) || value.id !== id || typeof value.label !== "string" || !value.label.trim() || typeof value.rootClass !== "string" || !identifier.test(value.rootClass) || typeof value.html !== "string" || typeof value.css !== "string" || typeof value.stylesheetPath !== "string" || !stylesheetPath.test(value.stylesheetPath)) reject("Invalid static section identity, label, rootClass or stylesheet path.");
  sectionHtml(value as StaticSectionRecord); sectionCss(value as StaticSectionRecord);
}
export function readStaticSectionRecords(documentText: string | undefined): Record<string, StaticSectionRecord> {
  const document = readPageBuilderDocument(documentText);
  if (document.reusableSections === undefined) return {};
  plain(document.reusableSections, "Reusable sections");
  if (document.reusableSections.version !== 1) reject("Unsupported reusable sections version.");
  plain(document.reusableSections.records, "Reusable section records");
  const records: Record<string, StaticSectionRecord> = {};
  for (const [id, value] of Object.entries(document.reusableSections.records)) { validateRecord(value, id); records[id] = value; }
  return records;
}
export function listSectionChoices(documentText: string | undefined): SectionChoice[] {
  return Object.values(readStaticSectionRecords(documentText)).map(({ id, label, rootClass }) => ({ id, label, rootClass }));
}
export function previewStaticSection(documentText: string | undefined, id: string): { html: string; css: string; rootClass: string } | { error: string } {
  try {
    const records = readStaticSectionRecords(documentText);
    if (!Object.hasOwn(records, id)) reject("Choose a registered static section.");
    const record = records[id];
    return { html: record.html, css: record.css, rootClass: record.rootClass };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
function decodedCss(source: string): string {
  return source.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\r\n])/gi, (_, hex: string | undefined, char: string | undefined) => {
    const point = hex ? Number.parseInt(hex, 16) : 0;
    return hex ? point && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "\ufffd" : char ?? "";
  });
}
function nextCss(existing: string, record: StaticSectionRecord): string {
  validateCssSource(existing);
  const oldBlocks = scanCss(existing), newBlocks = sectionCss(record);
  if (!newBlocks.length && existing.includes(record.css)) return existing;
  const rootPattern = new RegExp(`\\.${record.rootClass}(?![a-z0-9_-])`, "i");
  const collisions = oldBlocks.filter((block) => rootPattern.test(decodedCss(block.selector)));
  if (collisions.length) {
    const offset = existing.indexOf(record.css);
    const same = offset >= 0 && newBlocks.every((block) => oldBlocks.some((other) => other.start === block.start + offset && other.end === block.end + offset && (block.parent ? other.parent?.start === block.parent.start + offset : !other.parent))) && collisions.length === newBlocks.filter((block) => rootPattern.test(decodedCss(block.selector))).length;
    if (!same) reject("Existing stylesheet rules conflict with this section's rootClass; no CSS was overwritten.");
    return existing;
  }
  if (!record.css) return existing;
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  return existing + (existing && !/[\r\n]$/.test(existing) ? newline : "") + record.css;
}
/** Pure atomic preparation. The host applies source/file-graph guards and records Undo. */
export function planStaticSectionInsert(input: StaticSectionInsertInput): StaticSectionInsertPlan | { error: string } {
  try {
    if (nativePageRoute(input.pagePath) === undefined || typeof input.pageSource !== "string") reject("Load a native HTML page before inserting a section.");
    const records = readStaticSectionRecords(input.documentText);
    if (!Object.hasOwn(records, input.sectionId)) reject("Choose a registered static section.");
    const record = records[input.sectionId];
    plain(input.stylesheetSources, "Stylesheet sources");
    if (!Object.hasOwn(input.stylesheetSources, record.stylesheetPath)) reject(`Load ${record.stylesheetPath} or explicitly prove it is absent.`);
    for (const [path, source] of Object.entries(input.stylesheetSources)) if (!stylesheetPath.test(path) || source !== undefined && typeof source !== "string") reject("Provide safe stylesheet paths with strings or explicit absence.");
    const css = input.stylesheetSources[record.stylesheetPath];
    if (css !== undefined && typeof css !== "string") reject("Stylesheet sources must be strings or explicit absence.");
    const files = input.files && new Set(input.files);
    if (files && (!files.has(input.pagePath) || !files.has(EDITOR_PAGE_BUILDER_PATH) || Object.entries(input.stylesheetSources).some(([path, source]) => source !== undefined && !files.has(path)))) reject("Loaded sources do not match the file graph.");
    if (css === undefined && (!files || files.has(record.stylesheetPath))) reject("A complete file graph must prove the new stylesheet is absent.");
    const ids = new Set(active(record.html).map((element) => attribute(record.html, element, "id")).filter(Boolean));
    if (active(input.pageSource).some((element) => ids.has(attribute(input.pageSource, element, "id")))) reject("Inserting this section would duplicate an authored id.");
    // Validate the actual fragment in its destination, but never use re-indented payload bytes.
    const verified = nativeMarkupInsertEdit(input.pageSource, input.parent, input.index, record.html);
    const placeholder = "<section></section>";
    const insertion = nativeMarkupInsertEdit(input.pageSource, input.parent, input.index, placeholder);
    if (!verified || !insertion || verified.start !== insertion.start || verified.end !== insertion.end) reject("This section cannot be inserted at the selected native HTML boundary.");
    const slot = insertion.text.indexOf(placeholder);
    if (slot < 0 || slot !== insertion.text.lastIndexOf(placeholder)) reject("The native insertion boundary does not contain one literal payload slot.");
    const literal = insertion.text.slice(0, slot) + record.html + insertion.text.slice(slot + placeholder.length);
    let page = input.pageSource.slice(0, insertion.start) + literal + input.pageSource.slice(insertion.end);
    const head = headTags(page), all = active(page);
    if (all.some((element) => element.name === "base" && attribute(page, element, "href") !== undefined)) reject("A base href prevents safe static section stylesheet linking.");
    let linked = false;
    for (const element of all) {
      if (element.name === "style") {
        const inline = page.slice(element.tag.end, element.close?.start ?? element.tag.end);
        validateCssSource(inline);
        if (scanCss(inline).some((block) => new RegExp(`\\.${record.rootClass}(?![a-z0-9_-])`, "i").test(decodedCss(block.selector)))) reject("An inline stylesheet already uses this section's rootClass.");
        for (const item of parseCssImports(inline).imports) {
          const imported = resolveImportPath(input.pagePath, item.url);
          if (imported === record.stylesheetPath) reject("The section stylesheet is already loaded indirectly.");
          if (!imported) reject("External inline stylesheet imports cannot be verified for static section insertion.");
          if (typeof input.stylesheetSources[imported] !== "string") reject(`Load ${imported} before verifying inline stylesheet imports.`);
        }
      }
      if (element.name !== "link") continue;
      const href = attribute(page, element, "href");
      if (href === undefined) continue;
      const resolved = resolveImportPath(input.pagePath, href);
      const rel = (attribute(page, element, "rel") ?? "").toLowerCase().split(/[\t\n\f\r ]+/);
      if (resolved !== record.stylesheetPath) {
        if (rel.includes("stylesheet") && !resolved) reject("External stylesheet links cannot be verified for static section insertion.");
        if (rel.includes("stylesheet") && resolved && typeof input.stylesheetSources[resolved] !== "string") reject(`Load ${resolved} before verifying section stylesheet links.`);
        continue;
      }
      const attrs = startTagAttributes(page, element.tag);
      if (attribute(page, element, "rel")?.toLowerCase() !== "stylesheet" || attrs.some((attr) => ["integrity", "disabled", "title"].includes(attr.name) || /^on/.test(attr.name)) || /[?#]/.test(href) || ![undefined, "", "all"].includes(attribute(page, element, "media")) || ![undefined, "", "text/css"].includes(attribute(page, element, "type"))) reject("The section stylesheet has a conditional or protected existing link.");
      if (linked) reject("The section stylesheet has duplicate active links.");
      linked = true;
    }
    for (const [path, source] of Object.entries(input.stylesheetSources)) {
      if (source === undefined) continue;
      for (const item of parseCssImports(source).imports) {
        const imported = resolveImportPath(path, item.url);
        if (imported === record.stylesheetPath) reject("The section stylesheet is already loaded through a CSS import.");
        if (imported && typeof input.stylesheetSources[imported] !== "string") reject(`Load ${imported} before verifying section stylesheet imports.`);
      }
      if (path !== record.stylesheetPath && scanCss(source).some((block) => new RegExp(`\\.${record.rootClass}(?![a-z0-9_-])`, "i").test(decodedCss(block.selector)))) reject("Another supplied stylesheet already uses this section's rootClass.");
    }
    if (!linked) {
      const from = input.pagePath.split("/").slice(0, -1), to = record.stylesheetPath.split("/");
      while (from.length && from[0] === to[0]) { from.shift(); to.shift(); }
      const href = "../".repeat(from.length) + to.join("/");
      const newline = page.includes("\r\n") ? "\r\n" : "\n";
      page = page.slice(0, head.end) + `${newline}  <link rel="stylesheet" href="${href}">${newline}` + page.slice(head.end);
    }
    const stylesheet = nextCss(css ?? "", record);
    const expectedSources = new Map<string, string | undefined>(Object.entries(input.stylesheetSources));
    expectedSources.set(input.pagePath, input.pageSource); expectedSources.set(EDITOR_PAGE_BUILDER_PATH, input.documentText);
    const edits = new Map([[input.pagePath, page]]);
    if (css !== undefined && stylesheet !== css) edits.set(record.stylesheetPath, stylesheet);
    return { operation: { expectedSources, edits, ...(css === undefined ? { creates: [{ path: record.stylesheetPath, content: stylesheet }] } : {}), open: input.pagePath, done: `Added ${record.label}`, undone: `Removed ${record.label}` }, selection: { path: input.pagePath, node: [...input.parent, input.index] }, ...(files ? { expectedFiles: [...files].sort() } : {}) };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
