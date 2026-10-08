import { expandStyleImports } from "../../shared/css-imports";
import { attribute, locateSectionTarget, makeSectionTarget, type SectionTarget } from "./source-target";
import { nativePageStylesheets } from "../../shared/native-project";
import { nativePageRoute } from "../../shared/native-routes";
import { descendants, parseSource, startTagAttributes, type SourceElement, type SourceNode } from "./component-model";
import { readNativeSectionLinks, type NativeSectionLinks } from "./native-section-links";
import { nativeMarkupInsertEdit } from "./native-operations";
import { scanMediaUrlTokens } from "./media-references";
import {
  EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument,
  type JsonValue, type PageBuilderDocument,
} from "./page-builder-document";
import { readSectionCatalog, type StaticSectionOperation } from "./static-sections";

/**
 * Shared page parts: an ordinary `<header>` or `<footer>` that several pages repeat, edited once.
 *
 * Editor-only data, kept apart from saved sections (which stay `<section>`-only):
 * - `.editor/page-parts/<id>.html`, the master: the only authority for the part's HTML. It holds one
 *   complete `<header>` or `<footer>`, with only whitespace and comments around it.
 * - `.editor/page-builder.json`:
 *   - `reusablePageParts: { version: 1, records: { <id>: { id, label, rootTag, rootClass, htmlPath, stylesheetPath, … } } }`
 *   - `pages[path].pageParts[key]: { kind: "native-page-part", recordId, target, basis, … }`, a link
 *     from one copy on a page to its record. `target` is the copy's locator (authored id, else tag
 *     and exact opening tag; never a guessed position) and `basis` the literal bytes the copy was
 *     linked or last updated from.
 *
 * Every page keeps its own complete copy: deleting `.editor/` leaves a working static site, and
 * nothing here adds a loader, a marker or an attribute to published HTML. Unknown keys anywhere
 * (records, links, pages, top level) and other editor data (section links) are kept.
 *
 * Every function is pure. Plans return an operation whose `expectedSources` hold the exact bytes
 * (or `undefined`: absent) of every file they read, with the sorted `expectedFiles` graph; the host
 * compares both right before applying the operation atomically as one Undo step.
 */

export const PAGE_PART_KIND = "native-page-part";
export const PAGE_PART_FOLDER = ".editor/page-parts/";
export const pagePartPath = (id: string) => `${PAGE_PART_FOLDER}${id}.html`;
export type PagePartTag = "header" | "footer";
export interface PagePartRecord {
  id: string;
  label: string;
  rootTag: PagePartTag;
  rootClass: string;
  htmlPath: string;
  stylesheetPath: string;
  [key: string]: JsonValue;
}
export interface PagePartLink { kind: typeof PAGE_PART_KIND; recordId: string; target: SectionTarget; basis: string; [key: string]: JsonValue | SectionTarget }
export interface ResolvedPagePartLink {
  page: string;
  key: string;
  link: PagePartLink;
  /** Outer range of the copy in the page bytes given. */
  start: number;
  end: number;
  /** The copy's bytes equal its basis exactly. */
  unchanged: boolean;
}
export interface PagePartPlan {
  operation: StaticSectionOperation;
  /** Sorted file graph the plan was made from. */
  expectedFiles: readonly string[];
}
type Sources = Readonly<Record<string, string | undefined>>;

const identifier = /^[a-z][a-z0-9_-]*$/;
const stylesheetPattern = /^(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.css$/;
const linkKey = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const ROOT_TAGS = new Set(["header", "footer"]);
const FOREIGN_ANCESTORS = new Set(["template", "noscript", "slot", "svg", "math"]);
const REFUSED_INSIDE = new Set(["script", "style", "slot", "template", "noscript", "svg", "math", "iframe", "object", "embed", "header", "footer"]);
const EDITOR_ATTRIBUTES = new Set(["shadowrootmode", "data-native-empty", "data-native-selection-box", "data-native-css-path", "data-native-spacing"]);
const URL_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction"]);

function fail(message: string): never { throw new Error(message); }
function result<T>(run: () => T): T | { error: string } {
  try { return run(); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
function plain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
const elements = (nodes: SourceNode[]) => nodes.filter((node): node is SourceElement => node.type === "element");
const sourceOf = (sources: Sources, path: string) => (Object.hasOwn(sources, path) && typeof sources[path] === "string" ? sources[path] as string : undefined);

// ---- HTML policy -------------------------------------------------------------------------------

/**
 * Checks the markup of one part (its root element's bytes, `html`) against the same policy as
 * static sections: ordinary HTML, links, navigation and images; no scripts, handlers, embedded
 * styles, custom or foreign elements, editor attributes or duplicate ids. Nothing is rewritten.
 */
function checkPartMarkup(html: string, root: SourceElement): void {
  if (/<!(?!--)|<\?/.test(html)) fail("Declarations are unsupported inside a page part.");
  for (const element of [root, ...descendants(root.children)]) {
    const name = element.name.toLowerCase();
    if (element !== root && REFUSED_INSIDE.has(name)) fail(`A page part can't contain <${name}>.`);
    if (name.includes("-")) fail("A page part can't contain custom elements.");
    const attrs = startTagAttributes(html, element.tag);
    if (new Set(attrs.map((attr) => attr.name.toLowerCase())).size !== attrs.length) fail("Duplicate attributes are unsupported in a page part.");
    for (const attr of attrs) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith("on")) fail(`Event handler attributes (${attr.name}) are unsupported in a page part.`);
      if (EDITOR_ATTRIBUTES.has(attrName)) fail(`${attr.name} is an editor attribute and can't be in a page part.`);
      if (URL_ATTRIBUTES.has(attrName) && /^javascript:/i.test((attribute(html, element, attrName) ?? "").replace(/[\s\x00-\x1f]+/g, ""))) fail("javascript: URLs are unsupported in a page part.");
    }
  }
  checkPortableUrls(html, root);
  const ids = [root, ...descendants(root.children)].map((element) => attribute(html, element, "id")).filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) fail("A page part can't contain duplicate ids.");
  if (!nativeMarkupInsertEdit("<html><head></head><body></body></html>", [], 0, html)) fail("The page part's markup is malformed or can't be placed safely.");
}

/**
 * A part is copied to pages at every depth, so a page-relative URL (`contact/`, `../img/a.png`,
 * `?q`) would point somewhere different on each. Root paths (`/contact/`), fragments (`#main`),
 * protocol-relative (`//cdn…`) and scheme URLs are kept; an empty `href` (the page itself) too.
 * Covers href, src, srcset, poster and inline-style `url()` through the media reference scanner,
 * plus form `action`/`formaction`. Nothing is rewritten: the user is asked for a root path.
 */
function checkPortableUrls(html: string, root: SourceElement): void {
  const relative = (value: string) => Boolean(value.trim()) && !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(value.trim());
  const found = scanMediaUrlTokens("page.html", html).find((reference) => relative(reference.value));
  let bad = found?.value;
  if (bad === undefined) {
    for (const element of [root, ...descendants(root.children)]) {
      for (const name of ["action", "formaction"]) {
        const value = attribute(html, element, name)?.trim();
        if (value && !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(value)) { bad = value; break; }
      }
      if (bad !== undefined) break;
    }
  }
  if (bad !== undefined) fail(`A shared header or footer appears on pages at different depths, so "${bad.trim().slice(0, 80)}" would point to different places. Use a root path starting with / (such as /contact/ or /images/photo.svg).`);
}

/** The part's root inside master HTML: one complete header/footer, only whitespace and comments around it. */
export function pagePartCore(html: string): { start: number; end: number; rootTag: PagePartTag; outsideComment: boolean } {
  const nodes = parseSource(html);
  const roots = elements(nodes);
  if (roots.length !== 1 || !ROOT_TAGS.has(roots[0].name.toLowerCase()) || !roots[0].close) fail("A page part must hold exactly one complete <header> or <footer>.");
  const outside = html.slice(0, roots[0].start) + html.slice(roots[0].end);
  if (outside.replace(/<!--[\s\S]*?-->/g, "").trim()) fail("Only whitespace and comments may surround a page part's root.");
  const core = html.slice(roots[0].start, roots[0].end);
  checkPartMarkup(core, elements(parseSource(core))[0]);
  return { start: roots[0].start, end: roots[0].end, rootTag: roots[0].name.toLowerCase() as PagePartTag, outsideComment: outside.includes("<!--") };
}
const coreOf = (html: string) => { const core = pagePartCore(html); return html.slice(core.start, core.end); };

/** The ordinary header/footer whose outer range is exactly `range`, outside components and templates. */
function partAt(source: string, range: { start: number; end: number }): SourceElement {
  if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start || range.end > source.length) fail("Select a header or footer on the page.");
  const element = [...descendants(parseSource(source))].find((item) => item.start === range.start && item.end === range.end);
  if (!element) fail("Select a header or footer on the page.");
  if (!ROOT_TAGS.has(element.name.toLowerCase()) || !element.close) fail("Only a complete <header> or <footer> can be a page part.");
  checkAncestors(element);
  const html = source.slice(element.start, element.end);
  checkPartMarkup(html, elements(parseSource(html))[0]);
  return element;
}
function checkAncestors(element: SourceElement): void {
  for (let parent = element.parent; parent; parent = parent.parent) {
    const name = parent.name.toLowerCase();
    if (name.includes("-") || FOREIGN_ANCESTORS.has(name)) fail("A header or footer inside a component, template or foreign markup can't be a page part.");
    if (ROOT_TAGS.has(name)) fail("A header or footer inside another one can't be a page part.");
  }
}

// ---- Stylesheets -------------------------------------------------------------------------------

/** The loaded chain (outermost first) from a sheet the page links, through its imports, to `sheet`. */
function stylesheetChain(pagePath: string, pageSource: string, sources: Sources, sheet: string): string[] | undefined {
  const linked = nativePageStylesheets(pageSource, pagePath);
  const read = (path: string) => sourceOf(sources, path);
  const expanded = expandStyleImports(linked.filter((path) => read(path) !== undefined), read);
  const importer = new Map<string, string | undefined>();
  for (const item of expanded.sheets) if (item.kind === "sheet" && !importer.has(item.path)) importer.set(item.path, item.importer);
  if (!importer.has(sheet)) return undefined;
  const chain = [sheet];
  for (let at = importer.get(sheet); at !== undefined; at = importer.get(at)) {
    if (chain.includes(at)) return undefined;
    chain.unshift(at);
  }
  return linked.includes(chain[0]) ? chain : undefined;
}
/** Proves the page applies the stylesheet; returns every sheet read for that proof. */
function provenChain(graph: Set<string>, sources: Sources, pagePath: string, pageSource: string, sheet: string): string[] {
  if (!graph.has(sheet)) fail(`${sheet} is missing; choose an existing stylesheet.`);
  if (sourceOf(sources, sheet) === undefined) fail(`Load ${sheet} first.`);
  const chain = stylesheetChain(pagePath, pageSource, sources, sheet);
  if (!chain) fail(`${pagePath} does not use ${sheet}.`);
  for (const path of chain) if (!graph.has(path)) fail(`${path} is not in the site's file list.`);
  return chain;
}

// ---- Reading -----------------------------------------------------------------------------------

function readRecord(id: string, value: unknown): PagePartRecord {
  if (!plain(value)) fail(`Page part ${id} must be an object.`);
  if (!identifier.test(id) || unsafeKeys.has(id) || value.id !== id) fail(`Invalid page part id: ${id}.`);
  if (typeof value.label !== "string" || !value.label.trim()) fail(`Page part ${id} needs a label.`);
  if (typeof value.rootTag !== "string" || !ROOT_TAGS.has(value.rootTag)) fail(`Page part ${id} must be a header or footer.`);
  if (typeof value.rootClass !== "string" || !identifier.test(value.rootClass)) fail(`Page part ${id} needs an ordinary rootClass.`);
  if (value.htmlPath !== pagePartPath(id)) fail(`Page part ${id}'s master must be ${pagePartPath(id)}.`);
  if (typeof value.stylesheetPath !== "string" || !stylesheetPattern.test(value.stylesheetPath)) fail(`Page part ${id} needs a safe stylesheet path.`);
  if (Object.hasOwn(value, "html")) fail(`Page part ${id} keeps its HTML in its master only.`);
  return value as PagePartRecord;
}
/** The page part records exactly as stored. Malformed recognised data refuses. */
export function readPagePartCatalog(documentText: string | undefined): Record<string, PagePartRecord> {
  const document = readPageBuilderDocument(documentText);
  const container = document.reusablePageParts;
  if (container === undefined) return {};
  if (!plain(container) || container.version !== 1 || !plain(container.records)) fail("Unsupported reusable page parts data.");
  const records: Record<string, PagePartRecord> = {};
  const classes = new Set<string>();
  for (const [id, value] of Object.entries(container.records)) {
    const record = readRecord(id, value);
    if (classes.has(record.rootClass.toLowerCase())) fail(`Two page parts use ${record.rootClass}.`);
    classes.add(record.rootClass.toLowerCase());
    records[id] = record;
  }
  return records;
}
/** Page part links by page, then key. Entries of other kinds are ignored here and kept on write. */
export function readPagePartLinks(documentText: string | undefined): Record<string, Record<string, PagePartLink>> {
  const document = readPageBuilderDocument(documentText);
  const catalog = readPagePartCatalog(documentText);
  const links: Record<string, Record<string, PagePartLink>> = {};
  for (const [page, metadata] of Object.entries(document.pages)) {
    const parts = metadata.pageParts;
    if (parts === undefined) continue;
    if (!plain(parts)) fail(`pageParts on ${page} must be an object.`);
    for (const [key, value] of Object.entries(parts)) {
      if (!plain(value) || value.kind !== PAGE_PART_KIND) continue;
      if (!linkKey.test(key) || unsafeKeys.has(key)) fail(`Invalid page part link key: ${key}.`);
      if (typeof value.recordId !== "string" || !Object.hasOwn(catalog, value.recordId)) fail(`Page part link ${page} ${key} names no saved page part.`);
      if (typeof value.basis !== "string" || !value.basis) fail(`Page part link ${page} ${key} needs its basis.`);
      const target = value.target;
      if (!plain(target) || target.tag !== catalog[value.recordId].rootTag) fail(`Page part link ${page} ${key} needs a ${catalog[value.recordId].rootTag} target.`);
      const basisRoots = elements(parseSource(value.basis));
      if (basisRoots.length !== 1 || basisRoots[0].start !== 0 || basisRoots[0].end !== value.basis.length || basisRoots[0].name !== target.tag) fail(`Page part link ${page} ${key}'s basis must be exactly one ${target.tag}.`);
      (links[page] ??= {})[key] = value as PagePartLink;
    }
  }
  return links;
}
/** The master's current HTML for a record. Missing graph entry or unloaded master refuses. */
export function readPagePartMaster(record: PagePartRecord, context: { files: readonly string[]; sources: Sources }): string {
  if (!context.files.includes(record.htmlPath)) fail(`The master ${record.htmlPath} is missing.`);
  const source = sourceOf(context.sources, record.htmlPath);
  if (source === undefined) fail(`Load ${record.htmlPath} first.`);
  const core = pagePartCore(source);
  if (core.rootTag !== record.rootTag) fail(`${record.htmlPath} must hold a <${record.rootTag}>.`);
  const html = source.slice(core.start, core.end);
  const root = elements(parseSource(html))[0];
  if (!(attribute(html, root, "class") ?? "").split(/[\t\n\f\r ]+/).includes(record.rootClass)) fail(`${record.htmlPath}'s root must keep its class ${record.rootClass}.`);
  return source;
}

/** The section links, read (and validated) on first use, then reused for the rest of one operation. */
function sectionLinksOnce(documentText: string | undefined): () => NativeSectionLinks {
  let links: NativeSectionLinks | undefined;
  return () => links ??= readNativeSectionLinks(documentText);
}
/** Ranges another editor feature already owns on a page: section links. */
function otherOwnedRanges(sectionLinks: () => NativeSectionLinks, page: string, source: string): { start: number; end: number; what: string }[] {
  const out: { start: number; end: number; what: string }[] = [];
  for (const [key, link] of Object.entries(sectionLinks()[page] ?? {})) {
    const located = locateSectionTarget(source, link.target);
    if ("error" in located) fail(`Section link ${key} on ${page} can't be found; fix it first.`);
    out.push({ start: located.element.start, end: located.element.end, what: `section link ${key}` });
  }
  return out;
}
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

function resolvePage(sectionLinks: () => NativeSectionLinks, page: string, source: string, entries: Record<string, PagePartLink>): ResolvedPagePartLink[] {
  const found: ResolvedPagePartLink[] = [];
  const owned = otherOwnedRanges(sectionLinks, page, source);
  for (const [key, link] of Object.entries(entries)) {
    const located = locateSectionTarget(source, link.target);
    if ("error" in located) fail(`Page part link ${key} on ${page}: ${located.error} Relink it.`);
    if (located.element.name !== link.target.tag || !located.element.close) fail(`Page part link ${key} on ${page} no longer points at a complete ${link.target.tag}.`);
    checkAncestors(located.element);
    const { start, end } = located.element;
    for (const other of found) if (overlaps(other, { start, end })) fail(`Page part links ${other.key} and ${key} on ${page} overlap.`);
    for (const other of owned) if (overlaps(other, { start, end })) fail(`Page part link ${key} on ${page} overlaps ${other.what}.`);
    found.push({ page, key, link, start, end, unchanged: source.slice(start, end) === link.basis });
  }
  return found;
}
/** Every page part link, located in the loaded page bytes. Any unloaded page, missing, ambiguous or overlapping link refuses. */
export function resolvePagePartLinks(input: { documentText: string | undefined; sources: Sources }): { links: ResolvedPagePartLink[] } | { error: string } {
  return result(() => {
    readPageBuilderDocument(input.documentText); // Throws on a malformed document.
    const links: ResolvedPagePartLink[] = [];
    const sectionLinks = sectionLinksOnce(input.documentText);
    for (const [page, entries] of Object.entries(readPagePartLinks(input.documentText))) {
      const source = sourceOf(input.sources, page);
      if (source === undefined) fail(`Load ${page} before using its page parts.`);
      links.push(...resolvePage(sectionLinks, page, source, entries));
    }
    return { links };
  });
}

// ---- Shared plan checks ------------------------------------------------------------------------

function checkJson(documentText: string | undefined, graph: Set<string>): void {
  if (documentText === undefined ? graph.has(EDITOR_PAGE_BUILDER_PATH) : typeof documentText !== "string" || !graph.has(EDITOR_PAGE_BUILDER_PATH)) fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
}
function checkPage(graph: Set<string>, sources: Sources, pagePath: string, pageSource?: string): string {
  if (typeof pagePath !== "string" || nativePageRoute(pagePath) === undefined || !graph.has(pagePath)) fail(`${pagePath} is not a page of this site.`);
  const source = sourceOf(sources, pagePath);
  if (source === undefined || (pageSource !== undefined && source !== pageSource)) fail(`${pagePath} changed; select the part again.`);
  return source;
}
function writeJson(document: PageBuilderDocument, documentText: string | undefined): { edits: Map<string, string>; creates: { path: string; content: string }[] } {
  const text = writePageBuilderDocument(document, documentText);
  return documentText === undefined
    ? { edits: new Map(), creates: [{ path: EDITOR_PAGE_BUILDER_PATH, content: text }] }
    : { edits: new Map([[EDITOR_PAGE_BUILDER_PATH, text]]), creates: [] };
}
function addLink(document: PageBuilderDocument, page: string, source: string, element: SourceElement, recordId: string, basis: string, key: string | undefined): string {
  const target = makeSectionTarget(source, element);
  const located = locateSectionTarget(source, target);
  if ("error" in located || located.element.start !== element.start) fail(`This ${element.name} can't be told apart from another on ${page}; give it an id to link it.`);
  const metadata = (document.pages[page] ??= {});
  if (metadata.pageParts !== undefined && !plain(metadata.pageParts)) fail(`pageParts on ${page} must be an object.`);
  const parts = (metadata.pageParts ??= {}) as Record<string, JsonValue>;
  let chosen = key;
  if (chosen === undefined) { let n = 1; while (Object.hasOwn(parts, `${recordId}-${n}`)) n++; chosen = `${recordId}-${n}`; }
  if (!linkKey.test(chosen) || unsafeKeys.has(chosen)) fail(`Invalid page part link key: ${chosen}.`);
  if (Object.hasOwn(parts, chosen)) fail(`A page part entry ${chosen} already exists on ${page}.`);
  parts[chosen] = { kind: PAGE_PART_KIND, recordId, target, basis } as unknown as JsonValue;
  return chosen;
}
/** A new link must not land on, in or around anything already linked or owned on its page. */
function checkFree(documentText: string | undefined, page: string, source: string, element: SourceElement): void {
  const existing = readPagePartLinks(documentText)[page] ?? {};
  const sectionLinks = sectionLinksOnce(documentText);
  for (const link of resolvePage(sectionLinks, page, source, existing)) if (overlaps(link, element)) fail(`This ${element.name} on ${page} is already linked (${link.key}).`);
  for (const other of otherOwnedRanges(sectionLinks, page, source)) if (overlaps(other, element)) fail(`This ${element.name} on ${page} overlaps ${other.what}.`);
}
const sorted = (graph: Set<string>) => [...graph].sort();

// ---- Plans -------------------------------------------------------------------------------------

export interface SavePagePartInput {
  documentText: string | undefined;
  files: readonly string[];
  sources: Sources;
  pagePath: string;
  pageSource: string;
  /** The selected header/footer's exact outer range in `pageSource`. */
  range: { start: number; end: number };
  id: string;
  label: string;
  /** A class the part's root already has and nothing else on the page uses. */
  rootClass: string;
  /** An existing, loaded stylesheet the page applies (linked or imported). */
  stylesheetPath: string;
  key?: string;
}
/**
 * Saves the selected header/footer as a new page part: creates the master with its exact bytes,
 * adds the record and a link from this copy (basis: the copy) to the editor JSON. Pages and CSS are
 * not written.
 */
export function planSavePagePart(input: SavePagePartInput): (PagePartPlan & { htmlPath: string; key: string }) | { error: string } {
  return result(() => {
    if (!Array.isArray(input.files)) fail("A complete file graph is needed.");
    const graph = new Set(input.files);
    checkJson(input.documentText, graph);
    const source = checkPage(graph, input.sources, input.pagePath, input.pageSource);
    if (typeof input.id !== "string" || !identifier.test(input.id) || unsafeKeys.has(input.id)) fail("Choose an id of lowercase letters, digits, - and _.");
    if (typeof input.label !== "string" || !input.label.trim()) fail("Choose a label.");
    if (typeof input.rootClass !== "string" || !identifier.test(input.rootClass)) fail("Choose an ordinary class for the part.");
    if (typeof input.stylesheetPath !== "string" || !stylesheetPattern.test(input.stylesheetPath)) fail("Choose a safe stylesheet path.");
    const element = partAt(source, input.range);
    const html = source.slice(element.start, element.end);
    if (!(attribute(source, element, "class") ?? "").split(/[\t\n\f\r ]+/).includes(input.rootClass)) fail(`The ${element.name} must already have the class ${input.rootClass}.`);
    const others = [...descendants(parseSource(source))].filter((item) => item.start !== element.start && (attribute(source, item, "class") ?? "").split(/[\t\n\f\r ]+/).includes(input.rootClass));
    if (others.length) fail(`Another element on ${input.pagePath} also uses ${input.rootClass}; choose a class only this part has.`);
    const chain = provenChain(graph, input.sources, input.pagePath, source, input.stylesheetPath);

    const htmlPath = pagePartPath(input.id);
    if (input.files.some((path) => path.toLowerCase() === htmlPath.toLowerCase())) fail(`${htmlPath} already exists.`);
    const document = readPageBuilderDocument(input.documentText);
    const catalog = readPagePartCatalog(input.documentText);
    if (Object.keys(catalog).some((id) => id.toLowerCase() === input.id.toLowerCase())) fail(`A page part ${input.id} already exists.`);
    const rootClass = input.rootClass.toLowerCase();
    if (Object.values(catalog).some((record) => record.rootClass.toLowerCase() === rootClass)) fail(`Another page part already uses ${input.rootClass}.`);
    if (Object.values(readSectionCatalog(input.documentText)).some((record) => record.rootClass.toLowerCase() === rootClass)) fail(`A saved section already uses ${input.rootClass}.`);
    checkFree(input.documentText, input.pagePath, source, element);

    const container = (plain(document.reusablePageParts) ? document.reusablePageParts : { version: 1, records: {} }) as { version: number; records: Record<string, JsonValue> };
    container.records[input.id] = { id: input.id, label: input.label, rootTag: element.name.toLowerCase(), rootClass: input.rootClass, htmlPath, stylesheetPath: input.stylesheetPath };
    document.reusablePageParts = container;
    const key = addLink(document, input.pagePath, source, element, input.id, html, input.key);
    const written = writeJson(document, input.documentText);
    const text = written.edits.get(EDITOR_PAGE_BUILDER_PATH) ?? written.creates[0].content;
    // Read back: the record (with no HTML) and a link whose basis is this copy.
    const record = readPagePartCatalog(text)[input.id];
    const link = readPagePartLinks(text)[input.pagePath]?.[key];
    if (!record || !link || link.basis !== html) fail("The page part did not read back.");
    return {
      htmlPath,
      key,
      expectedFiles: sorted(graph),
      operation: {
        expectedSources: new Map<string, string | undefined>([
          [EDITOR_PAGE_BUILDER_PATH, input.documentText],
          [htmlPath, undefined],
          [input.pagePath, source],
          ...chain.map((path): [string, string | undefined] => [path, sourceOf(input.sources, path)]),
        ]),
        edits: written.edits,
        creates: [...written.creates, { path: htmlPath, content: html }],
        done: `Saved ${input.label} as a shared ${element.name}`,
        undone: `Removed shared ${element.name} ${input.label}`,
      },
    };
  });
}

export interface LinkPagePartInput {
  documentText: string;
  files: readonly string[];
  sources: Sources;
  recordId: string;
  /** Copies to link, each by its exact range in the loaded page bytes. */
  copies: { pagePath: string; range: { start: number; end: number }; key?: string }[];
}
/**
 * Links existing copies on pages to a page part. Each basis is the master's current part, so a copy
 * that differs from it (an `aria-current` on its own page, say) is customised from the start and is
 * never rewritten by an update. Only the editor JSON changes.
 */
export function planLinkPagePartCopies(input: LinkPagePartInput): (PagePartPlan & { keys: { page: string; key: string; unchanged: boolean }[] }) | { error: string } {
  return result(() => {
    if (!Array.isArray(input.files)) fail("A complete file graph is needed.");
    const graph = new Set(input.files);
    checkJson(input.documentText, graph);
    if (typeof input.documentText !== "string") fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
    const catalog = readPagePartCatalog(input.documentText);
    if (!Object.hasOwn(catalog, input.recordId)) fail("That page part no longer exists.");
    const record = catalog[input.recordId];
    const masterSource = readPagePartMaster(record, { files: input.files, sources: input.sources });
    // Same rule as Update, so a link made now can be updated later.
    if (pagePartCore(masterSource).outsideComment) fail(`${record.htmlPath} has a comment outside its ${record.rootTag}; move it inside or delete it.`);
    const basis = coreOf(masterSource);
    if (!Array.isArray(input.copies) || !input.copies.length) fail("Choose copies to link.");
    const document = readPageBuilderDocument(input.documentText);
    const expectedSources = new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText], [record.htmlPath, masterSource]]);
    const keys: { page: string; key: string; unchanged: boolean }[] = [];
    const pending = new Map<string, string>();
    for (const copy of input.copies) {
      const source = checkPage(graph, input.sources, copy.pagePath);
      const element = partAt(source, copy.range);
      if (element.name.toLowerCase() !== record.rootTag) fail(`${record.label} is a ${record.rootTag}; that is a ${element.name}.`);
      const text = writePageBuilderDocument(document, input.documentText);
      checkFree(text, copy.pagePath, source, element);
      const chain = provenChain(graph, input.sources, copy.pagePath, source, record.stylesheetPath);
      const key = addLink(document, copy.pagePath, source, element, record.id, basis, copy.key);
      keys.push({ page: copy.pagePath, key, unchanged: source.slice(element.start, element.end) === basis });
      expectedSources.set(copy.pagePath, source);
      for (const path of chain) pending.set(path, sourceOf(input.sources, path)!);
    }
    for (const [path, text] of pending) expectedSources.set(path, text);
    const written = writeJson(document, input.documentText);
    resolveOrFail(written.edits.get(EDITOR_PAGE_BUILDER_PATH)!, input.sources);
    return {
      keys,
      expectedFiles: sorted(graph),
      operation: { expectedSources, edits: written.edits, creates: [], done: `Linked copies to ${record.label}`, undone: `Unlinked copies from ${record.label}` },
    };
  });
}
function resolveOrFail(documentText: string, sources: Sources): ResolvedPagePartLink[] {
  const resolved = resolvePagePartLinks({ documentText, sources });
  if ("error" in resolved) fail(resolved.error);
  return resolved.links;
}

export interface UpdatePagePartCopiesPlan extends Partial<PagePartPlan> {
  /** Links whose copies take the master's part. */
  updated: { page: string; key: string }[];
  /** Customised copies: reported, never written. */
  skipped: { page: string; key: string }[];
}
/**
 * Writes the master's current part into every linked copy still equal to its basis, and moves those
 * links' basis to it. Customised copies are skipped byte for byte. Every page with page part links
 * must be loaded; any missing, ambiguous or overlapping link refuses the whole update. CSS is never
 * written. No operation when nothing is unchanged.
 */
export function planUpdatePagePartCopies(input: { documentText: string; files: readonly string[]; sources: Sources; recordId: string }): UpdatePagePartCopiesPlan | { error: string } {
  return result(() => {
    if (!Array.isArray(input.files)) fail("A complete file graph is needed.");
    const graph = new Set(input.files);
    if (typeof input.documentText !== "string") fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
    checkJson(input.documentText, graph);
    const catalog = readPagePartCatalog(input.documentText);
    if (!Object.hasOwn(catalog, input.recordId)) fail("That page part no longer exists.");
    const record = catalog[input.recordId];
    const masterSource = readPagePartMaster(record, { files: input.files, sources: input.sources });
    const core = pagePartCore(masterSource);
    if (core.outsideComment) fail(`${record.htmlPath} has a comment outside its ${record.rootTag}; move it inside or delete it.`);
    const html = masterSource.slice(core.start, core.end);
    const allLinks = readPagePartLinks(input.documentText);
    for (const page of Object.keys(allLinks)) if (!graph.has(page)) fail(`${page} has page part links but is not in the file graph.`);
    const resolved = resolveOrFail(input.documentText, input.sources);
    const mine = resolved.filter((entry) => entry.link.recordId === record.id);
    const updated = mine.filter((entry) => entry.unchanged && entry.link.basis !== html);
    const skipped = mine.filter((entry) => !entry.unchanged);
    const report = { updated: updated.map(({ page, key }) => ({ page, key })), skipped: skipped.map(({ page, key }) => ({ page, key })) };
    if (!updated.length) return report;

    const document = readPageBuilderDocument(input.documentText);
    const expectedSources = new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText], [record.htmlPath, masterSource]]);
    for (const page of Object.keys(allLinks)) expectedSources.set(page, sourceOf(input.sources, page));
    const edits = new Map<string, string>();
    const newIds = [elements(parseSource(html))[0], ...descendants(elements(parseSource(html))[0].children)].map((element) => attribute(html, element, "id")).filter(Boolean);
    const after: Record<string, string> = {};
    for (const page of new Set(updated.map((entry) => entry.page))) {
      const before = sourceOf(input.sources, page)!;
      const replace = updated.filter((entry) => entry.page === page).sort((a, b) => b.start - a.start);
      // The part's ids must stay unique on the page.
      const outsideIds = [...descendants(parseSource(before))].filter((element) => !replace.some((entry) => element.start >= entry.start && element.start < entry.end))
        .map((element) => attribute(before, element, "id")).filter(Boolean);
      if (newIds.some((id) => outsideIds.includes(id))) fail(`The ${record.rootTag}'s ids would repeat ids already on ${page}.`);
      let text = before;
      for (const entry of replace) text = text.slice(0, entry.start) + html + text.slice(entry.end);
      // Every link of the page is found again in the new bytes; updated ones move their basis.
      const parts = document.pages[page].pageParts as Record<string, Record<string, JsonValue>>;
      let delta = 0;
      for (const entry of resolved.filter((item) => item.page === page).sort((a, b) => a.start - b.start)) {
        const start = entry.start + delta;
        if (replace.includes(entry)) {
          const element = [...descendants(parseSource(text))].find((item) => item.start === start && item.end === start + html.length);
          if (!element) fail(`The updated ${record.rootTag} on ${page} could not be found again.`);
          const target = makeSectionTarget(text, element);
          const located = locateSectionTarget(text, target);
          if ("error" in located || located.element.start !== start) fail(`The updated ${record.rootTag} on ${page} can't be told apart from another; give it an id.`);
          parts[entry.key] = { ...parts[entry.key], target: target as unknown as JsonValue, basis: html };
          delta += html.length - (entry.end - entry.start);
        }
      }
      after[page] = text;
      edits.set(page, text);
    }
    edits.set(EDITOR_PAGE_BUILDER_PATH, writePageBuilderDocument(document, input.documentText));
    // The result resolves: every page part link, section link is found exactly once.
    const check = resolveOrFail(edits.get(EDITOR_PAGE_BUILDER_PATH)!, { ...input.sources, ...after });
    for (const entry of updated) {
      const found = check.find((item) => item.page === entry.page && item.key === entry.key);
      if (!found?.unchanged) fail(`The updated ${record.rootTag} on ${entry.page} did not read back.`);
    }
    return {
      ...report,
      expectedFiles: sorted(graph),
      operation: { expectedSources, edits, creates: [], done: `Updated copies of ${record.label}`, undone: `Restored copies of ${record.label}` },
    };
  });
}

/** Removes one page part link. The page and the master stay; only the editor JSON changes. */
export function planUnlinkPagePart(input: { documentText: string; files: readonly string[]; pagePath: string; key: string }): PagePartPlan | { error: string } {
  return result(() => {
    if (!Array.isArray(input.files)) fail("A complete file graph is needed.");
    const graph = new Set(input.files);
    if (typeof input.documentText !== "string") fail(`Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
    checkJson(input.documentText, graph);
    const link = readPagePartLinks(input.documentText)[input.pagePath]?.[input.key];
    if (!link) fail("That page part link no longer exists.");
    const document = readPageBuilderDocument(input.documentText);
    const parts = document.pages[input.pagePath].pageParts as Record<string, JsonValue>;
    delete parts[input.key];
    return {
      expectedFiles: sorted(graph),
      operation: {
        expectedSources: new Map([[EDITOR_PAGE_BUILDER_PATH, input.documentText]]),
        edits: new Map([[EDITOR_PAGE_BUILDER_PATH, writePageBuilderDocument(document, input.documentText)]]),
        creates: [],
        done: `Unlinked ${input.pagePath}`,
        undone: `Relinked ${input.pagePath}`,
      },
    };
  });
}
