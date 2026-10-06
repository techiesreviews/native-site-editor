import { startTags } from "../../shared/html-source";
import { splitSelectorList } from "../../shared/cascade";
import { resolveImportPath, parseCssImports } from "../../shared/css-imports";
import { nativePageRoute } from "../../shared/native-routes";
import { descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";
import { attribute } from "./source-target";
import { scanCss, validateCssSource, type CssBlock } from "./css-write";
import { nativeMarkupInsertEdit } from "./native-operations";
import { headTags } from "./site-head";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument, type JsonValue } from "./page-builder-document";

/**
 * Editor-only catalogue. Published sections remain ordinary HTML and CSS.
 * A record's `css` is a portable initial seed, not the live stylesheet: once the public stylesheet
 * exists, its loaded source is the authority (see `StaticSectionCssPolicy`).
 */
export interface StaticSectionRecord {
  id: string;
  label: string;
  rootClass: string;
  html: string;
  css: string;
  stylesheetPath: string;
  [key: string]: JsonValue;
}
/**
 * A saved section whose HTML lives in a master file in the editor folder (`reusableSections`
 * version 2). The master file `.editor/sections/<id>.html` is the only authority for its HTML:
 * the JSON holds `htmlPath` and never a copy of the HTML. A stored entry holds `html` (v1)
 * xor `htmlPath` (v2); a record with both was resolved from a master and can't be written.
 */
export interface StaticSectionMasterEntry {
  id: string;
  label: string;
  rootClass: string;
  htmlPath: string;
  css: string;
  stylesheetPath: string;
  [key: string]: JsonValue;
}
/** A catalogue entry exactly as stored. */
export type StaticSectionEntry = StaticSectionRecord | StaticSectionMasterEntry;
/** Loaded master sources (drafts included) and the complete file graph, to resolve v2 entries. */
export interface SectionMasterContext { sources: Readonly<Record<string, string | undefined>>; files?: readonly string[] }
export const SECTION_MASTER_FOLDER = ".editor/sections/";
export const sectionMasterPath = (id: string) => `${SECTION_MASTER_FOLDER}${id}.html`;
/**
 * `ensure-record` (default): append the record's seed CSS unless identical rules exist; refuse unknown rootClass rules.
 * `reuse-current`: a loaded stylesheet source (even empty) is authoritative and never written; other loaded
 * stylesheets and inline rules may cascade over the section. Seed CSS is created only when the stylesheet is proven absent.
 */
export type StaticSectionCssPolicy = "ensure-record" | "reuse-current";
/**
 * Live public CSS snapshots for previews. The policy is required and must equal the one passed to the insert:
 * hosts use `reuse-current` for saved sections (preview and insert alike) and `ensure-record` for a fresh default seed.
 */
export interface StaticSectionLiveCss {
  cssPolicy: StaticSectionCssPolicy;
  stylesheetSources: Readonly<Record<string, string | undefined>>;
  files?: readonly string[];
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
  /** Defaults to `ensure-record` for compatibility. Saved-section hosts pass `reuse-current` explicitly, matching the preview. */
  cssPolicy?: StaticSectionCssPolicy;
  /** Loaded master sources, for a saved section with a master file (`files` must prove it exists). */
  masters?: Readonly<Record<string, string | undefined>>;
}
/** Structural subset of the host's private NativeOperation, without host dependencies. */
export interface StaticSectionOperation {
  expectedSources: Map<string, string | undefined>;
  edits: Map<string, string>;
  creates?: { path: string; content: string }[];
  /** Page to show after applying; omitted when the host should stay on the current page. */
  open?: string;
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
/** A stylesheet link that always applies: no media condition, integrity, title, disabled state or handlers. */
function unconditionalLink(page: string, element: SourceElement, href: string): boolean {
  const attrs = startTagAttributes(page, element.tag);
  return !attrs.some((attr) => ["integrity", "disabled", "title"].includes(attr.name) || /^on/.test(attr.name)) && !/[?#]/.test(href)
    && [undefined, "", "all"].includes(attribute(page, element, "media")) && [undefined, "", "text/css"].includes(attribute(page, element, "type"));
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
      if (!(/^@(media|supports|container)\b/i.test(block.selector) || /^@layer\s+sections\s*$/i.test(block.selector)) || block.declarations.length || block.parent && !block.parent.selector.startsWith("@")) reject("Section styles support only rule-grouping @media, @supports, @container and @layer sections.");
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
  if (Object.hasOwn(value, "htmlPath")) reject("A saved section holds either html or htmlPath, never both; a section resolved from its master can't be written.");
  if (!identifier.test(id) || value.id !== id || typeof value.label !== "string" || !value.label.trim() || typeof value.rootClass !== "string" || !identifier.test(value.rootClass) || typeof value.html !== "string" || typeof value.css !== "string" || typeof value.stylesheetPath !== "string" || !stylesheetPath.test(value.stylesheetPath)) reject("Invalid static section identity, label, rootClass or stylesheet path.");
  sectionHtml(value as StaticSectionRecord); sectionCss(value as StaticSectionRecord);
}
function validateMasterEntry(value: unknown, id: string): asserts value is StaticSectionMasterEntry {
  plain(value, "Static section");
  if (Object.hasOwn(value, "html")) reject("A saved section holds either html or htmlPath, never both; a section resolved from its master can't be written.");
  if (!identifier.test(id) || value.id !== id || typeof value.label !== "string" || !value.label.trim() || typeof value.rootClass !== "string" || !identifier.test(value.rootClass) || typeof value.css !== "string" || typeof value.stylesheetPath !== "string" || !stylesheetPath.test(value.stylesheetPath)) reject("Invalid static section identity, label, rootClass or stylesheet path.");
  if (value.htmlPath !== sectionMasterPath(id)) reject(`A saved section's master must be ${sectionMasterPath(id)}.`);
  sectionCss(value as unknown as StaticSectionRecord);
}
function validateEntry(value: unknown, id: string, version: number): asserts value is StaticSectionEntry {
  plain(value, "Static section");
  if (Object.hasOwn(value, "htmlPath")) {
    if (version < 2) reject("A saved section with a master file needs reusable sections version 2.");
    validateMasterEntry(value, id);
  } else validateRecord(value, id);
}
/**
 * The saved sections exactly as stored: v1 entries with `html`, v2 entries with `htmlPath`. Never
 * reads a master. Writers spread only these raw entries, so nothing derived reaches the JSON.
 */
export function readSectionCatalog(documentText: string | undefined): Record<string, StaticSectionEntry> {
  const document = readPageBuilderDocument(documentText);
  if (document.reusableSections === undefined) return {};
  plain(document.reusableSections, "Reusable sections");
  const version = document.reusableSections.version;
  if (version !== 1 && version !== 2) reject("Unsupported reusable sections version.");
  plain(document.reusableSections.records, "Reusable section records");
  const entries: Record<string, StaticSectionEntry> = {};
  for (const [id, value] of Object.entries(document.reusableSections.records)) { validateEntry(value, id, version as number); entries[id] = value; }
  return entries;
}
/**
 * An ephemeral record for an entry: a v1 entry as it is; a v2 entry with `html` read from its
 * master's current loaded source (a draft included). Missing graph, missing or unloaded master,
 * or HTML that is not a valid saved section refuse. The result keeps `htmlPath`, so writing it
 * back is refused: it is for reading, previewing and inserting only.
 */
export function resolveStaticSection(entry: StaticSectionEntry, context?: SectionMasterContext): StaticSectionRecord {
  if (!Object.hasOwn(entry, "htmlPath")) return entry as StaticSectionRecord;
  const path = (entry as StaticSectionMasterEntry).htmlPath;
  if (!context?.files) reject("A complete file graph is needed to read the master.");
  if (!context.files.includes(path)) reject(`The master ${path} is missing; restore it or remove the saved section.`);
  const source = Object.hasOwn(context.sources, path) ? context.sources[path] : undefined;
  if (typeof source !== "string") reject(`Load ${path} before using its saved section.`);
  const record = { ...entry, html: source } as StaticSectionRecord;
  sectionHtml(record);
  return record;
}
/**
 * Saved sections with their HTML. v1-only documents behave as before. A v2 entry needs `masters`
 * to resolve (see `resolveStaticSection`); without it that entry refuses rather than guessing.
 */
export function readStaticSectionRecords(documentText: string | undefined, masters?: SectionMasterContext): Record<string, StaticSectionRecord> {
  const records: Record<string, StaticSectionRecord> = {};
  for (const [id, entry] of Object.entries(readSectionCatalog(documentText))) {
    if (Object.hasOwn(entry, "htmlPath") && !masters) reject(`Saved section ${id} has a master file; load it first.`);
    records[id] = resolveStaticSection(entry, masters);
  }
  return records;
}
export function listSectionChoices(documentText: string | undefined): SectionChoice[] {
  return Object.values(readSectionCatalog(documentText)).map(({ id, label, rootClass }) => ({ id, label, rootClass }));
}
/** Checks HTML as the saved section `entry` would hold it (a new master), without writing anything. */
export function checkSavedSectionHtml(entry: StaticSectionEntry, html: string): void {
  const { htmlPath: _path, ...rest } = entry as StaticSectionMasterEntry;
  sectionHtml({ ...rest, html } as StaticSectionRecord);
}
/** Without `live` or with `ensure-record`, previews the stored seed. With `reuse-current`, previews the exact loaded public stylesheet. */
export function previewStaticSection(documentText: string | undefined, id: string, live?: StaticSectionLiveCss, masters?: SectionMasterContext): { html: string; css: string; rootClass: string } | { error: string } {
  try {
    const catalog = readSectionCatalog(documentText);
    if (!Object.hasOwn(catalog, id)) reject("Choose a registered static section.");
    const record = resolveStaticSection(catalog[id], masters);
    if (live && live.cssPolicy !== "ensure-record" && live.cssPolicy !== "reuse-current") reject("Unknown section CSS policy.");
    if (live?.cssPolicy === "reuse-current") {
      plain(live.stylesheetSources, "Stylesheet sources");
      const loaded = Object.hasOwn(live.stylesheetSources, record.stylesheetPath);
      const source = live.stylesheetSources[record.stylesheetPath];
      if (typeof source === "string") return { html: record.html, css: source, rootClass: record.rootClass };
      if (!loaded || source !== undefined) reject(`Load ${record.stylesheetPath} or explicitly prove it is absent.`);
      if (!live.files || live.files.includes(record.stylesheetPath)) reject("A complete file graph must prove the new stylesheet is absent.");
    }
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
    const catalog = readSectionCatalog(input.documentText);
    if (!Object.hasOwn(catalog, input.sectionId)) reject("Choose a registered static section.");
    const record = resolveStaticSection(catalog[input.sectionId], input.masters ? { sources: input.masters, files: input.files } : undefined);
    const masterPath = Object.hasOwn(catalog[input.sectionId], "htmlPath") ? (catalog[input.sectionId] as StaticSectionMasterEntry).htmlPath : undefined;
    if (input.cssPolicy !== undefined && input.cssPolicy !== "ensure-record" && input.cssPolicy !== "reuse-current") reject("Unknown section CSS policy.");
    const reuse = input.cssPolicy === "reuse-current";
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
    // Stylesheets the page itself loads unconditionally: the roots of the import graph below.
    const roots: string[] = [];
    for (const element of all) {
      if (element.name === "style") {
        const inline = page.slice(element.tag.end, element.close?.start ?? element.tag.end);
        validateCssSource(inline);
        if (!reuse && scanCss(inline).some((block) => new RegExp(`\\.${record.rootClass}(?![a-z0-9_-])`, "i").test(decodedCss(block.selector)))) reject("An inline stylesheet already uses this section's rootClass.");
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
        if (rel.includes("stylesheet") && resolved && !rel.includes("alternate") && unconditionalLink(page, element, href)) roots.push(resolved);
        continue;
      }
      const attrs = startTagAttributes(page, element.tag);
      if (attribute(page, element, "rel")?.toLowerCase() !== "stylesheet" || attrs.some((attr) => ["integrity", "disabled", "title"].includes(attr.name) || /^on/.test(attr.name)) || /[?#]/.test(href) || ![undefined, "", "all"].includes(attribute(page, element, "media")) || ![undefined, "", "text/css"].includes(attribute(page, element, "type"))) reject("The section stylesheet has a conditional or protected existing link.");
      if (linked) reject("The section stylesheet has duplicate active links.");
      linked = true;
    }
    // The section stylesheet may already be loaded by the page through a chain of
    // loaded, unconditional @imports from its own links: then it counts as linked.
    const viaImport = new Set<string>();
    let imports = 0;
    if (css !== undefined) {
      const seen = new Set<string>();
      const queue = [...roots];
      for (const root of roots) seen.add(root);
      while (queue.length) {
        const path = queue.shift()!;
        const source = input.stylesheetSources[path];
        if (typeof source !== "string") reject(`Load ${path} before verifying section stylesheet imports.`);
        for (const item of parseCssImports(source).imports) {
          const imported = resolveImportPath(path, item.url);
          if (!imported || seen.has(imported)) continue;
          if (imported === record.stylesheetPath) {
            if (item.media !== undefined && !/^\s*(?:all)?\s*$/i.test(item.media) || item.supports !== undefined || item.layer !== undefined) reject("The section stylesheet is imported conditionally or into a layer.");
            viaImport.add(path); imports++;
          } else {
            seen.add(imported); queue.push(imported);
          }
        }
      }
      // Twice from one sheet counts too: every import loads it again.
      if (imports > 1 || imports && linked) reject("The section stylesheet is loaded more than once.");
    }
    for (const [path, source] of Object.entries(input.stylesheetSources)) {
      if (source === undefined) continue;
      for (const item of parseCssImports(source).imports) {
        const imported = resolveImportPath(path, item.url);
        if (imported === record.stylesheetPath && !viaImport.has(path)) reject("The section stylesheet is already loaded through a CSS import.");
        if (imported && typeof input.stylesheetSources[imported] !== "string") reject(`Load ${imported} before verifying section stylesheet imports.`);
      }
      if (!reuse && path !== record.stylesheetPath && scanCss(source).some((block) => new RegExp(`\\.${record.rootClass}(?![a-z0-9_-])`, "i").test(decodedCss(block.selector)))) reject("Another supplied stylesheet already uses this section's rootClass.");
    }
    if (viaImport.size) linked = true;
    if (!linked) {
      const from = input.pagePath.split("/").slice(0, -1), to = record.stylesheetPath.split("/");
      while (from.length && from[0] === to[0]) { from.shift(); to.shift(); }
      const href = "../".repeat(from.length) + to.join("/");
      const newline = page.includes("\r\n") ? "\r\n" : "\n";
      page = page.slice(0, head.end) + `${newline}  <link rel="stylesheet" href="${href}">${newline}` + page.slice(head.end);
    }
    // Reuse never rewrites a loaded public stylesheet; absent stylesheets are seeded once.
    const stylesheet = reuse && css !== undefined ? css : nextCss(css ?? "", record);
    const expectedSources = new Map<string, string | undefined>(Object.entries(input.stylesheetSources));
    expectedSources.set(input.pagePath, input.pageSource); expectedSources.set(EDITOR_PAGE_BUILDER_PATH, input.documentText);
    // The master's exact bytes the section was read from.
    if (masterPath) expectedSources.set(masterPath, record.html);
    const edits = new Map([[input.pagePath, page]]);
    if (css !== undefined && stylesheet !== css) edits.set(record.stylesheetPath, stylesheet);
    return { operation: { expectedSources, edits, ...(css === undefined ? { creates: [{ path: record.stylesheetPath, content: stylesheet }] } : {}), open: input.pagePath, done: `Added ${record.label}`, undone: `Removed ${record.label}` }, selection: { path: input.pagePath, node: [...input.parent, input.index] }, ...(files ? { expectedFiles: [...files].sort() } : {}) };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
export interface StaticSectionSaveInput {
  /** Current editor JSON text; undefined only when `files` proves the document is absent. */
  documentText: string | undefined;
  /** Complete file graph. Required to create the editor JSON. */
  files?: readonly string[];
  /** Complete caller-supplied record. Nothing is captured or inferred from pages. */
  record: StaticSectionRecord;
  /**
   * Explicit opt-in to replace an existing id, pinned to the exact record the caller last saw.
   * Unknown keys of the saved record are retained unless the new record sets them explicitly.
   */
  overwrite?: { expected: StaticSectionRecord };
}
export interface StaticSectionSavePlan {
  /** Editor-JSON-only operation without `open`: the host stays on the current page. */
  operation: StaticSectionOperation;
  /** The consumer must compare this graph immediately before applying the operation. */
  expectedFiles?: readonly string[];
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
/** True when a rule selector targets the class literally or through a class attribute selector. Declaration values and comments never match. */
function selectorsUseClass(css: string, className: string): boolean {
  const literal = new RegExp(`\\.${className}(?![a-z0-9_-])`, "i");
  const attribute = new RegExp(`\\[\\s*class\\b[^\\]]*${className}`, "i");
  return scanCss(css).some((block) => { const selector = decodedCss(block.selector); return literal.test(selector) || attribute.test(selector); });
}
/** Plans an editor-JSON-only upsert of one explicit static section record. Pages and stylesheets are untouched. */
export function planStaticSectionSave(input: StaticSectionSaveInput): StaticSectionSavePlan | { error: string } {
  try {
    const files = input.files && new Set(input.files);
    if (input.documentText === undefined) {
      if (!files) reject(`A complete file graph must prove ${EDITOR_PAGE_BUILDER_PATH} is absent.`);
      if (files.has(EDITOR_PAGE_BUILDER_PATH)) reject(`Load ${EDITOR_PAGE_BUILDER_PATH} before saving a section.`);
    } else if (typeof input.documentText !== "string" || files && !files.has(EDITOR_PAGE_BUILDER_PATH)) reject("Loaded sources do not match the file graph.");
    plain(input.record, "Static section");
    validateRecord(structuredClone(input.record), input.record.id);
    const records = readSectionCatalog(input.documentText);
    const document = readPageBuilderDocument(input.documentText);
    const id = input.record.id;
    if (Object.hasOwn(records, id)) {
      if (Object.hasOwn(records[id], "htmlPath")) reject("This saved section has a master file; save into its master.");
      if (!input.overwrite) reject("A static section with this id already exists; overwrite it explicitly.");
      if (canonical(records[id]) !== canonical(input.overwrite.expected)) reject("The saved static section changed since it was loaded.");
    } else if (input.overwrite) reject("There is no saved static section to overwrite.");
    const record: StaticSectionRecord = structuredClone(input.overwrite ? { ...records[id], ...input.record } : input.record);
    validateRecord(record, id);
    for (const other of Object.values(records)) {
      if (other.id === id) continue;
      if (other.rootClass.toLowerCase() === record.rootClass.toLowerCase()) reject("Another static section already uses this rootClass.");
      if (selectorsUseClass(other.css, record.rootClass) || selectorsUseClass(record.css, other.rootClass)) reject("Section styles would collide with another static section's rootClass.");
    }
    const container = (document.reusableSections ?? { version: 1, records: {} }) as Record<string, JsonValue> & { records: Record<string, JsonValue> };
    container.records[record.id] = record;
    document.reusableSections = container;
    const text = writePageBuilderDocument(document, input.documentText);
    const expectedSources = new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText]]);
    const verb = input.overwrite ? "Updated" : "Saved";
    return {
      operation: {
        expectedSources,
        edits: input.documentText === undefined ? new Map() : new Map([[EDITOR_PAGE_BUILDER_PATH, text]]),
        ...(input.documentText === undefined ? { creates: [{ path: EDITOR_PAGE_BUILDER_PATH, content: text }] } : {}),
        done: `${verb} section ${record.label}`,
        undone: `Reverted section ${record.label}`,
      },
      ...(files ? { expectedFiles: [...files].sort() } : {}),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Turns a v1 saved section into a master file: one operation creates
 * `.editor/sections/<id>.html` with the record's exact HTML and replaces the entry's `html` with
 * `htmlPath` (the catalogue becomes version 2; other v1 entries stay as they are). The file graph
 * must be complete and prove the master path free (any case); the JSON and the master's absence
 * are pinned. Pages and stylesheets are untouched.
 */
export function planMakeSectionMaster(input: { documentText: string; files: readonly string[]; id: string }): { operation: StaticSectionOperation; expectedFiles: readonly string[]; htmlPath: string } | { error: string } {
  try {
    if (typeof input.documentText !== "string") reject(`Load ${EDITOR_PAGE_BUILDER_PATH} before making a master.`);
    if (!Array.isArray(input.files) || !input.files.includes(EDITOR_PAGE_BUILDER_PATH)) reject("A complete file graph is needed to make a master.");
    if (typeof input.id !== "string" || !identifier.test(input.id) || ["__proto__", "prototype", "constructor"].includes(input.id)) reject("Invalid saved section id.");
    const catalog = readSectionCatalog(input.documentText);
    if (!Object.hasOwn(catalog, input.id)) reject("That saved section no longer exists.");
    const entry = catalog[input.id];
    if (Object.hasOwn(entry, "htmlPath")) reject("This saved section already has a master file.");
    const htmlPath = sectionMasterPath(input.id);
    if (input.files.some((path) => path.toLowerCase() === htmlPath.toLowerCase())) reject(`${htmlPath} already exists; it is not this saved section's master.`);
    const document = readPageBuilderDocument(input.documentText);
    const container = document.reusableSections as Record<string, JsonValue> & { records: Record<string, JsonValue> };
    const { html, ...rest } = entry as StaticSectionRecord;
    container.records[input.id] = { ...rest, htmlPath } as JsonValue;
    container.version = 2;
    const text = writePageBuilderDocument(document, input.documentText);
    readSectionCatalog(text);
    return {
      htmlPath,
      operation: {
        expectedSources: new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText], [htmlPath, undefined]]),
        edits: new Map([[EDITOR_PAGE_BUILDER_PATH, text]]),
        creates: [{ path: htmlPath, content: html }],
        done: `Made a master for ${entry.label}`,
        undone: `Removed the master for ${entry.label}`,
      },
      expectedFiles: [...input.files].sort(),
    };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
