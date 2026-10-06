import { nativePageRoute } from "../../shared/native-routes";
import { attribute, locateSectionTarget, makeSectionTarget, type SectionTarget } from "./source-target";
import { descendants, parseSource, type SourceElement } from "./component-model";
import {
  EDITOR_PAGE_BUILDER_PATH, locateCollections, readPageBuilderDocument, writePageBuilderDocument,
  type JsonValue, type PageBuilderDocument,
} from "./page-builder-document";
import type { StaticSectionOperation, StaticSectionRecord } from "./static-sections";

/**
 * Optional editor-only links between ordinary `<section>` copies on pages and the saved section
 * record they came from. The page HTML stays the only published truth: a link is an entry in
 * `.editor/page-builder.json` under `pages[path].sections[key]`, tagged `kind: "native-section"`.
 * Other entries in `sections` (any other or no `kind`) are opaque and kept exactly as they are.
 *
 * A link holds:
 * - `recordId`: the saved section record (`reusableSections.records[id]`);
 * - `target`: the unique locator of the copy (authored id, else tag and exact opening tag),
 *   from `makeSectionTarget`; it never falls back to a path or a class;
 * - `basis`: the record's literal HTML the copy was made from. A copy whose current outer HTML
 *   equals its basis is unchanged; any other copy is customised and is never rewritten.
 *
 * Every function is pure. Plans return a NativeOperation-compatible operation whose
 * `expectedSources` hold the exact bytes it was planned on; the host must compare them (and
 * `expectedFiles`) immediately before applying it atomically as one undo step.
 * Records are passed in already validated (`readStaticSectionRecords`); this module only
 * imports their type, so a future static insert can import it without a cycle. The catalogue
 * also accepts HTML with whitespace or a comment around the section; such a record cannot be a
 * basis (it is not one section from first to last byte) and is refused before any write.
 *
 * Deliberate limits (refuse rather than guess):
 * - a copy without an id whose opening tag was edited can no longer be found: resolution, and
 *   so every update, refuses until it is relinked;
 * - copies on one page with the same opening tag cannot be told apart and refuse the same way;
 * - an update never replaces or wraps an element that a collection in the editor JSON targets.
 */
export const NATIVE_SECTION_KIND = "native-section";
export interface NativeSectionLink { kind: typeof NATIVE_SECTION_KIND; recordId: string; target: SectionTarget; basis: string; [key: string]: JsonValue | SectionTarget }
/** Links by page path, then by link key. */
export type NativeSectionLinks = Record<string, Record<string, NativeSectionLink>>;

export interface ResolvedNativeSectionLink {
  page: string;
  key: string;
  link: NativeSectionLink;
  /** Outer source range of the copy in the page bytes given. */
  start: number;
  end: number;
  /** True when the copy's outer HTML equals the link's basis exactly. */
  unchanged: boolean;
}

const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const linkKey = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
function fail(message: string): never { throw new Error(message); }
function result<T>(run: () => T): T | { error: string } {
  try { return run(); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function checkPage(path: string): void {
  if (unsafeKeys.has(path) || nativePageRoute(path) === undefined) fail(`Not a native HTML page: ${path}.`);
}
function checkKey(key: string): void {
  if (!linkKey.test(key) || unsafeKeys.has(key)) fail(`Invalid section link key: ${key}.`);
}
const isNativeEntry = (value: unknown) => plainObject(value) && value.kind === NATIVE_SECTION_KIND;
const foreignAncestors = ["template", "noscript", "slot", "svg", "math"];
function checkOrdinary(element: SourceElement): void {
  for (let parent = element.parent; parent; parent = parent.parent) {
    const name = parent.name.toLowerCase();
    if (name.includes("-") || foreignAncestors.includes(name)) fail("Sections inside components or templates cannot be linked.");
  }
}
/**
 * The saved section's own `<section>` inside record or master HTML: the unique top-level, complete
 * section element. Outside it only whitespace and comments may appear (a hand-written master file
 * usually ends with a newline); anything else refuses. A link's basis is always exactly this core,
 * so a padded record links and updates while the stored basis stays one section, byte for byte.
 */
export function sectionCore(html: string): { start: number; end: number; outsideComment: boolean } {
  const nodes = parseSource(html);
  const roots = nodes.filter((node): node is SourceElement => node.type === "element");
  if (roots.length !== 1 || roots[0].name !== "section" || !roots[0].close) fail("A saved section must hold exactly one complete <section>.");
  const outside = html.slice(0, roots[0].start) + html.slice(roots[0].end);
  if (outside.replace(/<!--[\s\S]*?-->/g, "").trim()) fail("Only whitespace and comments may surround a saved section's <section>.");
  const outsideComment = outside.includes("<!--");
  return { start: roots[0].start, end: roots[0].end, outsideComment };
}
const coreOf = (html: string) => { const core = sectionCore(html); return html.slice(core.start, core.end); };

/** Exactly one complete `<section>`, first byte to last: the only HTML a stored basis can hold. */
function checkBasis(html: string, label: string): void {
  const roots = parseSource(html).filter((node): node is SourceElement => node.type === "element");
  if (roots.length !== 1 || roots[0].name !== "section" || !roots[0].close || roots[0].start !== 0 || roots[0].end !== html.length) fail(`${label} must be exactly one section, with nothing around it.`);
}

function readLink(page: string, key: string, value: Record<string, unknown>): NativeSectionLink {
  checkKey(key);
  if (typeof value.recordId !== "string" || !value.recordId || unsafeKeys.has(value.recordId)) fail(`Section link ${page} ${key} needs a record id.`);
  if (typeof value.basis !== "string" || !value.basis) fail(`Section link ${page} ${key} needs its basis HTML.`);
  const target = value.target;
  if (!plainObject(target) || target.tag !== "section") fail(`Section link ${page} ${key} needs a section target.`);
  // The basis must be one complete section, the same kind as the target.
  checkBasis(value.basis, `Section link ${page} ${key}'s basis`);
  return value as NativeSectionLink;
}

/** All native section links in the editor JSON. Malformed recognised entries are refused; others are ignored. */
export function readNativeSectionLinks(documentText: string | undefined): NativeSectionLinks {
  const document = readPageBuilderDocument(documentText);
  const links: NativeSectionLinks = {};
  for (const [page, metadata] of Object.entries(document.pages)) {
    for (const [key, value] of Object.entries(metadata.sections ?? {})) {
      if (!isNativeEntry(value)) continue;
      checkPage(page);
      (links[page] ??= {})[key] = readLink(page, key, value as Record<string, unknown>);
    }
  }
  return links;
}

/**
 * Every link of the pages given, located in their exact bytes. Any page with links that is
 * missing from `sources`, a missing or ambiguous locator, two links on one element or overlapping
 * copies refuse the whole resolution.
 */
export function resolveNativeSectionLinks(input: { documentText: string | undefined; sources: Readonly<Record<string, string | undefined>> }): { links: ResolvedNativeSectionLink[] } | { error: string } {
  return result(() => ({ links: resolveAll(readNativeSectionLinks(input.documentText), input.sources) }));
}
function resolveAll(links: NativeSectionLinks, sources: Readonly<Record<string, string | undefined>>): ResolvedNativeSectionLink[] {
  const resolved: ResolvedNativeSectionLink[] = [];
  for (const [page, entries] of Object.entries(links)) {
    const source = Object.hasOwn(sources, page) ? sources[page] : undefined;
    if (typeof source !== "string") fail(`Load ${page} before using its section links.`);
    resolved.push(...resolvePage(page, source, entries));
  }
  return resolved;
}
function resolvePage(page: string, source: string, entries: Record<string, NativeSectionLink>): ResolvedNativeSectionLink[] {
  const found: ResolvedNativeSectionLink[] = [];
  for (const [key, link] of Object.entries(entries)) {
    const located = locateSectionTarget(source, link.target);
    if ("error" in located) fail(`Section link ${key} on ${page}: ${located.error} Relink it.`);
    checkOrdinary(located.element);
    const { start, end } = located.element;
    for (const other of found) {
      if (other.start === start) fail(`Section links ${other.key} and ${key} on ${page} point at the same section.`);
      if (start < other.end && other.start < end) fail(`Section links ${other.key} and ${key} on ${page} overlap.`);
    }
    found.push({ page, key, link, start, end, unchanged: source.slice(start, end) === link.basis });
  }
  return found;
}

/** The ordinary, complete `<section>` at exactly `range`, outside components and templates. */
function sectionAt(source: string, range: { start: number; end: number }): SourceElement {
  if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start || range.end > source.length) fail("Select a section on the page.");
  const stack = parseSource(source);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type !== "element") continue;
    if (node.start === range.start && node.end === range.end) {
      if (node.name !== "section" || !node.close) fail("Select a complete section itself.");
      checkOrdinary(node);
      return node;
    }
    if (node.start <= range.start && node.end >= range.end) stack.push(...node.children);
  }
  return fail("The selection no longer matches the page source.");
}

function writeJson(document: PageBuilderDocument, documentText: string | undefined, files: readonly string[] | undefined) {
  if (documentText === undefined) {
    if (!files) fail(`A complete file graph must prove ${EDITOR_PAGE_BUILDER_PATH} is absent.`);
    if (files.includes(EDITOR_PAGE_BUILDER_PATH)) fail(`Load ${EDITOR_PAGE_BUILDER_PATH} before linking a section.`);
  } else if (files && !files.includes(EDITOR_PAGE_BUILDER_PATH)) fail("Loaded sources do not match the file graph.");
  return writePageBuilderDocument(document, documentText);
}

function addLink(input: { documentText: string | undefined; pagePath: string; pageSource: string; element: SourceElement; record: StaticSectionRecord; key?: string }) {
  checkPage(input.pagePath);
  const basis = coreOf(input.record.html);
  checkBasis(basis, `Saved section ${input.record.id}`);
  const document = readPageBuilderDocument(input.documentText);
  const existing = readNativeSectionLinks(input.documentText);
  // The page's other links must still resolve, and none may already be this section.
  const others = resolvePage(input.pagePath, input.pageSource, existing[input.pagePath] ?? {});
  if (others.some((other) => other.start === input.element.start)) fail("This section is already linked.");
  const target = makeSectionTarget(input.pageSource, input.element);
  const located = locateSectionTarget(input.pageSource, target);
  if ("error" in located || located.element.start !== input.element.start) fail("This section cannot be told apart from another on the page; give it an id to link it.");
  const page = (document.pages[input.pagePath] ??= {});
  const sections = (page.sections ??= {});
  let key = input.key;
  if (key === undefined) { let n = 1; while (Object.hasOwn(sections, `${input.record.id}-${n}`)) n++; key = `${input.record.id}-${n}`; }
  checkKey(key);
  if (Object.hasOwn(sections, key)) fail(`A section entry ${key} already exists on ${input.pagePath}.`);
  const link: NativeSectionLink = { kind: NATIVE_SECTION_KIND, recordId: input.record.id, target, basis };
  sections[key] = link as unknown as JsonValue;
  return { document, key };
}

export interface NativeSectionLinkPlan {
  key: string;
  operation: StaticSectionOperation;
  expectedFiles?: readonly string[];
}
/**
 * Links the selected ordinary section to a saved record. Only the editor JSON changes. The
 * basis is the record's current HTML, so a section that differs from it is customised from the
 * start and will never be rewritten by an update.
 */
export function planNativeSectionLink(input: {
  documentText: string | undefined; files?: readonly string[]; pagePath: string; pageSource: string;
  range: { start: number; end: number }; record: StaticSectionRecord; key?: string;
}): NativeSectionLinkPlan | { error: string } {
  return result(() => {
    if (input.files && !input.files.includes(input.pagePath)) fail("Loaded sources do not match the file graph.");
    const element = sectionAt(input.pageSource, input.range);
    const { document, key } = addLink({ ...input, element });
    const text = writeJson(document, input.documentText, input.files);
    return {
      key,
      operation: {
        expectedSources: new Map([[EDITOR_PAGE_BUILDER_PATH, input.documentText], [input.pagePath, input.pageSource]]),
        edits: input.documentText === undefined ? new Map() : new Map([[EDITOR_PAGE_BUILDER_PATH, text]]),
        ...(input.documentText === undefined ? { creates: [{ path: EDITOR_PAGE_BUILDER_PATH, content: text }] } : {}),
        done: `Linked section to ${input.record.label}`,
        undone: `Unlinked section from ${input.record.label}`,
      },
      ...(input.files ? { expectedFiles: [...input.files].sort() } : {}),
    };
  });
}

/**
 * The editor JSON text after registering a just-inserted copy of `record` at `range` in the
 * page bytes after the insert. The copy must equal the record's HTML exactly. The caller puts
 * the returned text into its own insert operation (same undo step).
 */
export function registerInsertedNativeSection(input: {
  documentText: string | undefined; files?: readonly string[]; pagePath: string; pageSourceAfter: string;
  range: { start: number; end: number }; record: StaticSectionRecord; key?: string;
}): { key: string; documentText: string; create: boolean } | { error: string } {
  return result(() => {
    if (input.files && !input.files.includes(input.pagePath)) fail("Loaded sources do not match the file graph.");
    const element = sectionAt(input.pageSourceAfter, input.range);
    if (input.pageSourceAfter.slice(element.start, element.end) !== coreOf(input.record.html)) fail("The inserted section does not match its saved record.");
    const { document, key } = addLink({ documentText: input.documentText, pagePath: input.pagePath, pageSource: input.pageSourceAfter, element, record: input.record, key: input.key });
    return { key, documentText: writeJson(document, input.documentText, input.files), create: input.documentText === undefined };
  });
}

export interface NativeSectionCopiesUpdatePlan {
  /** Links whose copies are replaced with the record's HTML. */
  updated: { page: string; key: string }[];
  /** Links whose copies were customised: reported, never written. */
  diverged: { page: string; key: string }[];
  /** Undefined when no copy is unchanged: nothing to write. */
  operation?: StaticSectionOperation;
  expectedFiles?: readonly string[];
}
/**
 * Updates every unchanged copy of `record` (current outer HTML equal to its link's basis) to the
 * record's HTML, and moves those links' basis to it. Customised copies are listed and left
 * byte for byte. `sources` must hold every page that has links; all links are resolved first and
 * any missing, ambiguous or overlapping one refuses the whole plan. `record` is the new record,
 * validated by the caller. Stylesheets are not touched. Copies receive only the record's
 * `sectionCore`; whitespace around it is ignored, and a comment outside it refuses (it could not be
 * applied to copies and would otherwise be dropped silently).
 */
export function planNativeSectionCopiesUpdate(input: {
  documentText: string; files?: readonly string[]; sources: Readonly<Record<string, string | undefined>>; record: StaticSectionRecord;
  /** The record's master file, when it has one: pinned with the exact bytes its HTML was read from. */
  master?: { path: string; source: string };
}): NativeSectionCopiesUpdatePlan | { error: string } {
  return result(() => {
    if (typeof input.documentText !== "string") fail(`Load ${EDITOR_PAGE_BUILDER_PATH} before updating copies.`);
    const core = sectionCore(input.record.html);
    if (core.outsideComment) fail("The master has a comment outside the section; move it inside or delete it. Comments outside can't be applied to copies.");
    const html = input.record.html.slice(core.start, core.end);
    checkBasis(html, `Saved section ${input.record.id}`);
    const files = input.files && new Set(input.files);
    const htmlPath = (input.record as Record<string, unknown>).htmlPath;
    if (htmlPath !== undefined && (!input.master || input.master.path !== htmlPath)) fail("A saved section with a master needs that master pinned to update copies.");
    if (input.master) {
      if (typeof input.master.path !== "string" || typeof input.master.source !== "string" || input.master.source !== input.record.html) fail("The master source does not match the record being applied.");
      if (files && !files.has(input.master.path)) fail("Loaded sources do not match the file graph.");
    }
    if (files && !files.has(EDITOR_PAGE_BUILDER_PATH)) fail("Loaded sources do not match the file graph.");
    const links = readNativeSectionLinks(input.documentText);
    for (const page of Object.keys(links)) if (files && !files.has(page)) fail(`${page} has section links but is not in the file graph.`);
    const resolved = resolveAll(links, input.sources);
    const mine = resolved.filter((entry) => entry.link.recordId === input.record.id);
    const updated = mine.filter((entry) => entry.unchanged && entry.link.basis !== html);
    const diverged = mine.filter((entry) => !entry.unchanged);
    const report = { updated: updated.map(({ page, key }) => ({ page, key })), diverged: diverged.map(({ page, key }) => ({ page, key })) };
    if (!updated.length) return report;
    const document = readPageBuilderDocument(input.documentText);
    const edits = new Map<string, string>();
    const expectedSources = new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText]]);
    for (const page of Object.keys(links)) expectedSources.set(page, input.sources[page]);
    if (input.master) expectedSources.set(input.master.path, input.master.source);
    for (const page of new Set(updated.map((entry) => entry.page))) {
      const before = input.sources[page]!;
      const replace = updated.filter((entry) => entry.page === page).sort((a, b) => b.start - a.start);
      const collections = checkCollections(page, before, replace, document);
      let after = before;
      for (const entry of replace) after = after.slice(0, entry.start) + html + after.slice(entry.end);
      checkReplacedPage(page, after, { ...input.record, html });
      // Re-locate every link of the page in the new bytes: each copy is found again by its new
      // locator, uniquely, and the updated ones take the record's HTML as their basis.
      const sections = document.pages[page].sections!;
      const shifted = resolved.filter((entry) => entry.page === page).sort((a, b) => a.start - b.start);
      let delta = 0;
      for (const entry of shifted) {
        const isUpdated = replace.includes(entry);
        const start = entry.start + delta;
        const end = isUpdated ? start + html.length : entry.end + delta;
        if (isUpdated) delta += html.length - (entry.end - entry.start);
        const element = findElement(after, start, end);
        if (!element) fail(`Section link ${entry.key} on ${page} could not be found after the update.`);
        const target = makeSectionTarget(after, element);
        const located = locateSectionTarget(after, target);
        if ("error" in located || located.element.start !== start) fail(`After the update, section link ${entry.key} on ${page} would be ambiguous. Give the sections ids.`);
        const old = sections[entry.key] as unknown as NativeSectionLink;
        sections[entry.key] = { ...old, target, ...(isUpdated ? { basis: html } : {}) } as unknown as JsonValue;
      }
      checkCollectionsAfter(page, after, collections, replace, html.length, document);
      edits.set(page, after);
    }
    edits.set(EDITOR_PAGE_BUILDER_PATH, writePageBuilderDocument(document, input.documentText));
    return {
      ...report,
      operation: { expectedSources, edits, done: `Updated ${updated.length} ${updated.length === 1 ? "copy" : "copies"} of ${input.record.label}`, undone: `Reverted copies of ${input.record.label}` },
      ...(files ? { expectedFiles: [...files].sort() } : {}),
    };
  });
}
/**
 * The page's collections (editor JSON) must all be found, uniquely, and none may sit inside, be,
 * or contain a copy about to be replaced: its recipe would vanish or rebind silently.
 */
function pageCollections(page: string, document: PageBuilderDocument) {
  return Object.fromEntries(Object.entries(document.collections).filter(([, record]) => record.pagePath === page));
}
function checkCollections(page: string, source: string, replaced: ResolvedNativeSectionLink[], document: PageBuilderDocument): Record<string, { start: number; end: number }> {
  const records = pageCollections(page, document);
  if (!Object.keys(records).length) return {};
  const located = locateCollections(source, records);
  if ("error" in located) fail(`${page}: ${located.error}`);
  for (const [id, { element }] of Object.entries(located.collections)) {
    for (const copy of replaced) {
      if (element.start < copy.end && copy.start < element.end) fail(`Collection ${id} on ${page} is inside or around a copy to update; update it by hand.`);
    }
  }
  return Object.fromEntries(Object.entries(located.collections).map(([id, { element }]) => [id, { start: element.start, end: element.end }]));
}
/**
 * After the update every collection of the page is still found, uniquely, at exactly its old
 * range shifted by the replaced copies before it: new HTML may not make a target ambiguous or
 * rebind it to another element.
 */
function checkCollectionsAfter(page: string, after: string, before: Record<string, { start: number; end: number }>, replaced: ResolvedNativeSectionLink[], length: number, document: PageBuilderDocument): void {
  const records = pageCollections(page, document);
  if (!Object.keys(records).length) return;
  const located = locateCollections(after, records);
  if ("error" in located) fail(`After the update, ${page}: ${located.error}`);
  for (const [id, range] of Object.entries(before)) {
    const shift = replaced.filter((copy) => copy.end <= range.start).reduce((sum, copy) => sum + length - (copy.end - copy.start), 0);
    const element = located.collections[id]?.element;
    if (!element || element.start !== range.start + shift || element.end !== range.end + shift) fail(`After the update, collection ${id} on ${page} would point at another element.`);
  }
}
function findElement(source: string, start: number, end: number): SourceElement | undefined {
  const stack = parseSource(source);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type !== "element") continue;
    if (node.start === start && node.end === end) return node;
    if (node.start <= start && node.end >= end) stack.push(...node.children);
  }
  return undefined;
}
/** The new HTML adds no duplicate authored id to the page (each copy is re-found exactly by the caller). */
function checkReplacedPage(page: string, after: string, record: StaticSectionRecord): void {
  const ids = new Map<string, number>();
  for (const element of descendants(parseSource(after))) {
    const id = attribute(after, element, "id");
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const recordIds = new Set([...descendants(parseSource(record.html))].map((element) => attribute(record.html, element, "id")).filter((id): id is string => Boolean(id)));
  for (const id of recordIds) if ((ids.get(id) ?? 0) > 1) fail(`The updated section's id "${id}" would appear more than once on ${page}.`);
}

/** Editor JSON text with the native links of page `from` moved to page `to` (a page rename). Other entries stay. */
export function renameNativeSectionLinksPage(documentText: string, from: string, to: string): string | { error: string } {
  return result(() => {
    checkPage(from); checkPage(to);
    const document = readPageBuilderDocument(documentText);
    const fromSections = document.pages[from]?.sections;
    if (!fromSections) return documentText;
    const moving = Object.entries(fromSections).filter(([, value]) => isNativeEntry(value));
    if (!moving.length) return documentText;
    readNativeSectionLinks(documentText);
    const toSections = ((document.pages[to] ??= {}).sections ??= {});
    for (const [key, value] of moving) {
      if (Object.hasOwn(toSections, key)) fail(`${to} already has a section entry ${key}.`);
      toSections[key] = value;
      delete fromSections[key];
    }
    if (!Object.keys(fromSections).length) delete document.pages[from].sections;
    if (!Object.keys(document.pages[from]).length) delete document.pages[from];
    return writePageBuilderDocument(document, documentText);
  });
}

/** Editor JSON text without one native link (a deleted copy, or an explicit unlink). Other entries stay. */
export function deleteNativeSectionLink(documentText: string, page: string, key: string): string | { error: string } {
  return result(() => {
    const document = readPageBuilderDocument(documentText);
    const sections = document.pages[page]?.sections;
    if (!sections || !Object.hasOwn(sections, key) || !isNativeEntry(sections[key])) fail(`No section link ${key} on ${page}.`);
    delete sections[key];
    if (!Object.keys(sections).length) delete document.pages[page].sections;
    if (!Object.keys(document.pages[page]).length) delete document.pages[page];
    return writePageBuilderDocument(document, documentText);
  });
}

/**
 * Editor JSON text with the link of the copy at exactly `range` on `pagePath` moved to `basis`
 * (the copy was just saved into its master, so it equals the master's new section). Undefined
 * when that copy is not linked to `recordId`. The page's links must all resolve; `basis` must be one section.
 * Throws on refusal; the caller wraps it in its own plan.
 */
export function moveLinkedCopyBasis(input: { documentText: string | undefined; pagePath: string; pageSource: string; range: { start: number; end: number }; basis: string; recordId: string }): string | undefined {
  checkBasis(input.basis, "The saved section");
  const links = readNativeSectionLinks(input.documentText);
  const found = resolvePage(input.pagePath, input.pageSource, links[input.pagePath] ?? {}).find((entry) => entry.start === input.range.start && entry.end === input.range.end);
  // Only a link to the record just saved moves. A link to another record on the same copy keeps
  // its basis: that copy is customised for it, and its next Update must leave it alone.
  if (!found || found.link.recordId !== input.recordId || found.link.basis === input.basis) return undefined;
  const document = readPageBuilderDocument(input.documentText);
  const sections = document.pages[input.pagePath].sections!;
  sections[found.key] = { ...(sections[found.key] as Record<string, JsonValue>), basis: input.basis };
  return writePageBuilderDocument(document, input.documentText);
}
