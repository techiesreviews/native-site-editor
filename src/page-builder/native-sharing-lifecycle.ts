import { nativePageRoute } from "../../shared/native-routes";
import { readPagePartLinks } from "./native-page-parts";
import { readNativeSectionLinks } from "./native-section-links";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument, type JsonValue } from "./page-builder-document";
import { readSectionCatalog, type StaticSectionOperation } from "./static-sections";

export interface NativeSharingLifecycleInput {
  documentText: string | undefined;
  files: readonly string[];
  sources: Readonly<Record<string, string | undefined>>;
  /** Explicit page mappings from the host's pending file/folder move. */
  moves?: readonly { from: string; to: string }[];
  deletes?: readonly string[];
}
export interface NativeSharingLifecyclePlan {
  expectedFiles: readonly string[];
  /** JSON-only edits; compose with the host's move/delete in one guarded transaction. */
  operation?: StaticSectionOperation;
  expectedSources: Map<string, string | undefined>;
  movedLinks: number;
  deletedLinks: number;
}
const plain = (value: unknown): value is Record<string, JsonValue> => !!value && typeof value === "object" && !Array.isArray(value);
const sourceAt = (sources: NativeSharingLifecycleInput["sources"], path: string) => Object.hasOwn(sources, path) ? sources[path] : undefined;
function fail(message: string): never { throw new Error(message); }
function page(path: string) { if (nativePageRoute(path) === undefined) fail(`Not a native HTML page: ${path}.`); }

/**
 * Relocate/remove only recognised sharing links, never page fields, opaque entries, collections,
 * masters or public bytes. A duplicate is independent: do not pass it as a move.
 * Pins describe the graph before the host operation, including absent move destinations.
 */
export function planNativeSharingLifecycle(input: NativeSharingLifecycleInput): NativeSharingLifecyclePlan | { error: string } {
  try {
    const files = new Set(input.files);
    if (files.size !== input.files.length) fail("The file graph contains duplicate paths.");
    const sources = new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText]]);
    if (files.has(EDITOR_PAGE_BUILDER_PATH) !== (input.documentText !== undefined)) fail("Load the current editor JSON, or prove it absent, before changing sharing links.");
    if (Object.hasOwn(input.sources, EDITOR_PAGE_BUILDER_PATH) && sourceAt(input.sources, EDITOR_PAGE_BUILDER_PATH) !== input.documentText) fail("The editor JSON source does not match its planned bytes.");
    const origins = new Set<string>(), destinations = new Set<string>();
    for (const path of [...(input.moves ?? []).map(move => move.from), ...(input.deletes ?? [])]) {
      page(path);
      if (origins.has(path)) fail(`More than one operation targets ${path}.`);
      origins.add(path);
      if (!files.has(path) || typeof sourceAt(input.sources, path) !== "string") fail(`Load the existing page ${path} before changing its sharing links.`);
      sources.set(path, sourceAt(input.sources, path));
    }
    for (const { to } of input.moves ?? []) {
      page(to);
      if (destinations.has(to) || origins.has(to)) fail(`Ambiguous move destination: ${to}.`);
      destinations.add(to);
      if (files.has(to) || sourceAt(input.sources, to) !== undefined) fail(`Move destination ${to} must be absent from the current graph and sources.`);
      sources.set(to, undefined);
    }
    const document = readPageBuilderDocument(input.documentText);
    // Reuse the recognised-entry validators; opaque entries are never interpreted as links.
    const sections = readNativeSectionLinks(input.documentText);
    // pageParts is an extensible namespace: an opaque scalar/array contains no owned links.
    const validationDocument = structuredClone(document);
    for (const metadata of Object.values(validationDocument.pages)) if (metadata.pageParts !== undefined && !plain(metadata.pageParts)) delete metadata.pageParts;
    const hasParts = Object.values(validationDocument.pages).some(metadata => plain(metadata.pageParts) && Object.values(metadata.pageParts).some(value => plain(value) && value.kind === "native-page-part"));
    const parts: ReturnType<typeof readPagePartLinks> = hasParts ? readPagePartLinks(JSON.stringify(validationDocument)) : {};
    const catalog = Object.keys(sections).length ? readSectionCatalog(input.documentText) : {};
    for (const links of Object.values(sections)) for (const link of Object.values(links))
      if (!Object.hasOwn(catalog, link.recordId)) fail(`Section link names no saved section: ${link.recordId}.`);
    for (const entries of [...Object.values(sections), ...Object.values(parts)]) for (const link of Object.values(entries)) {
      const target = link.target;
      if (!Array.isArray(target.path) || !target.path.length || target.path.some((index: unknown) => typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) ||
          typeof target.openingTagFingerprint !== "string" || target.authoredId !== undefined && (typeof target.authoredId !== "string" || !target.authoredId || /[\s\x00-\x1f]/.test(target.authoredId)))
        fail("A sharing link needs a valid explicit element target.");
    }
    let movedLinks = 0, deletedLinks = 0;
    const changedPages = new Set<string>();
    const namespaces = [["sections", sections], ["pageParts", parts]] as const;
    for (const [namespace, links] of namespaces) {
      for (const { from, to } of input.moves ?? []) {
        const moving = Object.entries(links[from] ?? {});
        if (!moving.length) continue;
        changedPages.add(from);
        const targetPage = document.pages[to] ??= {};
        const existing = targetPage[namespace];
        if (existing !== undefined && !plain(existing)) fail(`${namespace} on ${to} must be an object.`);
        const destination = (targetPage[namespace] ??= {}) as Record<string, JsonValue>;
        const origin = document.pages[from][namespace] as Record<string, JsonValue>;
        for (const [key, link] of moving) {
          if (Object.hasOwn(destination, key)) fail(`${to} already has a ${namespace} entry ${key}.`);
          destination[key] = link as JsonValue;
          delete origin[key];
          movedLinks++;
        }
        if (!Object.keys(origin).length) delete document.pages[from][namespace];
      }
      for (const path of input.deletes ?? []) {
        const removing = Object.keys(links[path] ?? {});
        if (!removing.length) continue;
        changedPages.add(path);
        const origin = document.pages[path][namespace] as Record<string, JsonValue>;
        for (const key of removing) { delete origin[key]; deletedLinks++; }
        if (!Object.keys(origin).length) delete document.pages[path][namespace];
      }
    }
    for (const path of changedPages) if (document.pages[path] && !Object.keys(document.pages[path]).length) delete document.pages[path];
    const text = writePageBuilderDocument(document, input.documentText);
    const edits = new Map<string, string>();
    if (movedLinks || deletedLinks) edits.set(EDITOR_PAGE_BUILDER_PATH, text);
    return { expectedFiles: [...files].sort(), expectedSources: sources, movedLinks, deletedLinks, operation: movedLinks || deletedLinks ? {
      expectedSources: sources, edits, creates: [], done: "Updated native sharing links", undone: "Restored native sharing links",
    } : undefined };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
