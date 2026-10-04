import { descendants, parseSource, startTagAttributes, type RangeEdit, type SourceElement, type SourceNode } from "./component-model";
import { attribute, collectionSpec, readCollections, collectionRecords, type SourceCollection } from "./collection-model";
import { builtinFields, fieldName, type CollectionIdentity } from "./collection-fields";
import { applyCollectionEdits, bindCollectionTemplate } from "./collection-bake";
import { escapeText } from "./site-head";
import { nativePageRoute } from "../../shared/native-routes";

export const EDITOR_PAGE_BUILDER_PATH = ".editor/page-builder.json";
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface PageBuilderPage { [key: string]: JsonValue | undefined; fields?: { [key: string]: string }; sections?: { [key: string]: JsonValue } }
export interface CollectionTarget { authoredId?: string; path: number[]; tag: string; openingTagFingerprint: string; [key: string]: JsonValue | undefined }
export interface PageBuilderCollection {
  pagePath: string;
  target: CollectionTarget;
  folders: string[];
  sort: string;
  filter: string;
  limit: number;
  template: string;
  fields: string[];
  overrides: Record<string, Record<string, string>>;
  outputFingerprint?: string;
  [key: string]: JsonValue | CollectionTarget | undefined;
}
export interface PageBuilderDocument {
  version: 1;
  pages: Record<string, PageBuilderPage>;
  collections: Record<string, PageBuilderCollection>;
  [key: string]: unknown;
}
// Unknown JSON keys are preserved except these globally reserved prototype names.
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const recipeAttributes = new Set(["data-each", "data-sort", "data-filter", "data-limit", "data-fields", "data-collection-id"]);
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object.`);
}
function json(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length) fail("JSON arrays must be dense ordinary arrays.");
    value.forEach(json); return;
  }
  object(value, "JSON value");
  for (const [key, item] of Object.entries(value)) { if (unsafeKeys.has(key)) fail(`Unsafe JSON key: ${key}.`); json(item); }
}
function repositoryPath(path: unknown): asserts path is string {
  if (typeof path !== "string" || !path || path.startsWith("/") || /[\\\x00-\x1f?#:]/.test(path) || path.split("/").some((part) => !part || part === "." || part === ".." || unsafeKeys.has(part))) fail("Use a safe relative repository path.");
}
function pagePath(value: unknown): asserts value is string {
  repositoryPath(value);
  if (nativePageRoute(value) === undefined) fail("Collection metadata must refer to a native HTML page.");
}
function targetValid(value: unknown): asserts value is CollectionTarget {
  object(value, "Collection target");
  if (!Array.isArray(value.path) || !value.path.length || value.path.some((index) => !Number.isSafeInteger(index) || index < 0)) fail("Collection target needs an element-child path.");
  if (typeof value.tag !== "string" || !/^[a-z][a-z0-9-]*$/.test(value.tag) || value.tag === "template") fail("Invalid collection target tag.");
  if (value.authoredId !== undefined && (typeof value.authoredId !== "string" || !value.authoredId || /[\s\x00-\x1f]/.test(value.authoredId))) fail("Invalid authored target id.");
  if (typeof value.openingTagFingerprint !== "string") fail("Missing opening tag fingerprint.");
  const nodes = parseSource(value.openingTagFingerprint);
  const element = nodes[0];
  if (nodes.length !== 1 || element?.type !== "element" || element.name !== value.tag || element.tag.end !== value.openingTagFingerprint.length || !value.openingTagFingerprint.endsWith(">")) fail("Fingerprint must be one opening tag of the target kind.");
  if ((attribute(value.openingTagFingerprint, element, "id") || undefined) !== value.authoredId) fail("Target id and fingerprint must agree.");
}
function validate(document: unknown): asserts document is PageBuilderDocument {
  json(document); object(document, "Page builder document");
  if (document.version !== 1) fail("Unsupported page builder document version.");
  object(document.pages, "Pages"); object(document.collections, "Collections");
  for (const [path, page] of Object.entries(document.pages)) {
    pagePath(path); object(page, "Page metadata");
    if (page.fields !== undefined) {
      object(page.fields, "Page fields");
      for (const [name, value] of Object.entries(page.fields)) if (!fieldName.test(name) || builtinFields.some((field) => field === name) || typeof value !== "string") fail("Page fields must use custom field names and string values.");
    }
    if (page.sections !== undefined) object(page.sections, "Page sections");
  }
  const targets = new Set<string>();
  for (const [id, record] of Object.entries(document.collections)) {
    if (!id || /[\s\x00-\x1f]/.test(id) || unsafeKeys.has(id)) fail("Invalid collection id.");
    object(record, "Collection"); pagePath(record.pagePath); targetValid(record.target);
    if (!Array.isArray(record.folders) || record.folders.some((folder) => typeof folder !== "string") || typeof record.sort !== "string" || typeof record.filter !== "string" || !Number.isSafeInteger(record.limit)) fail("Invalid collection specification.");
    const spec = collectionSpec({ folders: record.folders, sort: record.sort, filter: record.filter, limit: String(record.limit) });
    if (spec.folders.length !== record.folders.length) fail("Duplicate collection folders.");
    if (typeof record.template !== "string" || !Array.isArray(record.fields) || record.fields.some((field) => typeof field !== "string" || !fieldName.test(field) || builtinFields.some((builtin) => builtin === field)) || new Set(record.fields).size !== record.fields.length) fail("Invalid collection template or fields.");
    bindCollectionTemplate(record.template, Object.fromEntries(record.fields.map((field) => [field, ""])), record.fields);
    object(record.overrides, "Collection overrides");
    for (const [path, fields] of Object.entries(record.overrides)) {
      pagePath(path); object(fields, "Record overrides");
      for (const [field, value] of Object.entries(fields)) if (!record.fields.includes(field) || typeof value !== "string") fail("Override must use a registered string field.");
    }
    if (record.outputFingerprint !== undefined && typeof record.outputFingerprint !== "string") fail("Invalid output fingerprint.");
    const key = JSON.stringify([record.pagePath, record.target.authoredId ? ["id", record.target.authoredId] : ["signature", record.target.tag, record.target.openingTagFingerprint]]);
    if (targets.has(key)) fail("Duplicate collection target.");
    targets.add(key);
  }
}
function stable(value: unknown): string {
  const sorted = (item: unknown): unknown => Array.isArray(item) ? item.map(sorted) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sorted(child)])) : item;
  return JSON.stringify(sorted(value), null, 2) + "\n";
}
export function readPageBuilderDocument(text: string | undefined): PageBuilderDocument {
  const document: unknown = text === undefined ? { version: 1, pages: {}, collections: {} } : JSON.parse(text);
  if (text !== undefined) {
    // JSON.parse discards duplicate keys. Refuse them before that loss reaches callers.
    const stack: { object: boolean; key: boolean; seen: Set<string> }[] = [];
    for (const token of text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^{}\[\],:\s]+/g) ?? []) {
      if (token === "{" || token === "[") stack.push({ object: token === "{", key: token === "{", seen: new Set() });
      else if (token === "}" || token === "]") stack.pop();
      else if (token === ",") { const top = stack.at(-1); if (top?.object) top.key = true; }
      else if (token === ":") { const top = stack.at(-1); if (top) top.key = false; }
      else if (token.startsWith('"') && stack.at(-1)?.key) {
        const top = stack.at(-1)!;
        const key: string = JSON.parse(token);
        if (top.seen.has(key)) fail(`Duplicate JSON key: ${key}.`);
        top.seen.add(key);
      }
    }
  }
  validate(document); return document;
}
export function writePageBuilderDocument(document: PageBuilderDocument, previousText?: string): string {
  validate(document); const text = stable(document);
  return previousText !== undefined && stable(readPageBuilderDocument(previousText)) === text ? previousText : text;
}
function elements(nodes: SourceNode[]): SourceElement[] { return nodes.filter((node): node is SourceElement => node.type === "element"); }
function candidates(source: string): { element: SourceElement; path: number[] }[] {
  const result: { element: SourceElement; path: number[] }[] = [];
  const walk = (nodes: SourceNode[], parent: number[]) => elements(nodes).forEach((element, index) => {
    const path = [...parent, index];
    if (element.name === "template") return;
    result.push({ element, path }); walk(element.children, path);
  });
  walk(parseSource(source), []); return result;
}
function fingerprint(source: string, element: SourceElement): string {
  // Only an actual, validated collection has editor recipe attributes.
  const recipe = attribute(source, element, "data-each") !== undefined && readCollections(source).some((collection) => collection.element.start === element.start);
  const opening = source.slice(element.tag.start, element.tag.end);
  return recipe ? applyCollectionEdits(opening, startTagAttributes(source, element.tag).filter((attr) => recipeAttributes.has(attr.name)).map((attr) => ({ start: attr.start - element.tag.start, end: attr.end - element.tag.start, text: "" }))) : opening;
}
export function makeCollectionTarget(source: string, target: number | SourceElement): CollectionTarget {
  const start = typeof target === "number" ? target : target.start;
  const found = candidates(source).find(({ element }) => element.start === start);
  if (!found || !found.element.close) fail("Collection target must be a complete authored element.");
  if (startTagAttributes(source, found.element.tag).filter((attr) => attr.name === "id").length > 1) fail("Duplicate authored target id attributes.");
  const authoredId = attribute(source, found.element, "id");
  return { ...(authoredId ? { authoredId } : {}), path: found.path, tag: found.element.name, openingTagFingerprint: fingerprint(source, found.element) };
}
export interface LocatedCollectionTarget { element: SourceElement; target: CollectionTarget; rebound: boolean }
export type CollectionTargetLocation = LocatedCollectionTarget | { error: string };
export function locateCollectionTarget(source: string, target: CollectionTarget): CollectionTargetLocation {
  try {
    json(target); targetValid(target);
    const all = candidates(source);
    const matching = target.authoredId ? all.filter(({ element }) => attribute(source, element, "id") === target.authoredId) : all.filter(({ element }) => element.name === target.tag && fingerprint(source, element) === target.openingTagFingerprint);
    if (matching.length !== 1) fail("Collection target is missing or ambiguous.");
    const found = matching[0];
    if (found.element.name !== target.tag || !found.element.close) fail("Collection target kind changed or is incomplete.");
    const current = makeCollectionTarget(source, found.element);
    return { element: found.element, target: { ...target, ...current }, rebound: JSON.stringify(found.path) !== JSON.stringify(target.path) };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

export type CollectionsLocation = { collections: Record<string, LocatedCollectionTarget> } | { error: string };
/** Resolve the entire page together: stale paths never prove targets are disjoint. */
export function locateCollections(source: string, records: Record<string, PageBuilderCollection>): CollectionsLocation {
  try {
    validate({ version: 1, pages: {}, collections: records });
    if (new Set(Object.values(records).map((record) => record.pagePath)).size > 1) fail("Locate collections for one page at a time.");
    const collections: Record<string, LocatedCollectionTarget> = {};
    for (const [id, record] of Object.entries(records)) {
      const found = locateCollectionTarget(source, record.target);
      if ("error" in found) fail(found.error);
      for (const [otherId, other] of Object.entries(collections)) {
        if (found.element.start === other.element.start) fail(`Collections ${otherId} and ${id} resolve to the same element.`);
        const a = found.element, b = other.element;
        if (a.start < b.start && a.end >= b.end || b.start < a.start && b.end >= a.end) fail(`Collection targets ${otherId} and ${id} overlap.`);
      }
      collections[id] = found;
    }
    return { collections };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

export interface LegacyCollectionImportInput { sources: Record<string, string>; routes: Record<string, string>; identity: CollectionIdentity; sidecar?: string }
export interface LegacyCollectionImportPlan { edits: Record<string, RangeEdit[]>; document: PageBuilderDocument; sidecarText: string; expectedSources: Record<string, string | undefined> }
export type LegacyCollectionImportResult = LegacyCollectionImportPlan | { error: string };

function privateFields(source: string, collection: SourceCollection, id: string | undefined): string[] {
  if (!id) return [];
  const fields = collection.fields.filter((field) => field.startsWith(`${id}-`));
  if (!fields.length) return [];
  if (!/^[a-z][a-z0-9]{2,15}$/.test(id)) fail("Cannot prove the private collection field namespace.");
  const roots = elements(collection.template.children);
  if (roots.length !== 1 || !roots[0].name.includes("-") || !roots[0].close) fail("Private fields require a generated native card template.");
  const card = roots[0];
  const parts = elements(card.children);
  for (const field of fields) {
    const matching = parts.filter((part) => attribute(source, part, "data-if") === field);
    if (matching.length !== 1) fail(`Cannot safely import private field ${field}.`);
    const part = matching[0], slot = attribute(source, part, "slot");
    if (!slot || field !== `${id}-${slot.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}` || !part.close || elements(part.children).length || source.slice(part.tag.end, part.close.start) !== `{${field}}`) fail(`Cannot safely import private field ${field}.`);
    const sameSlot = parts.filter((node) => attribute(source, node, "slot") === slot);
    const href = attribute(source, part, "href");
    const fallback = href !== undefined ? "Read about {title}" : slot === "title" || /^h[1-6]$/.test(part.name) ? "{title}" : ["body", "description", "summary"].includes(slot) ? "{description}" : undefined;
    const withoutCondition = (node: SourceElement) => applyCollectionEdits(source.slice(node.tag.start, node.tag.end), startTagAttributes(source, node.tag).filter((attr) => attr.name === "data-if").map((attr) => ({ start: attr.start - node.tag.start, end: attr.end - node.tag.start, text: "" })));
    if (fallback) {
      const next = parts[parts.indexOf(part) + 1];
      if (sameSlot.length !== 2 || !next?.close || attribute(source, next, "data-if") !== `!${field}` || elements(next.children).length || !/^[\t\n\f\r ]*$/.test(source.slice(part.end, next.start)) || source.slice(next.tag.end, next.close.start) !== fallback || withoutCondition(next) !== withoutCondition(part) || href !== undefined && href !== "{url}") fail(`Cannot prove fallback for private field ${field}.`);
    } else if (sameSlot.length !== 1) fail(`Cannot prove private field ${field}.`);
  }
  return fields;
}

/** Plans an atomic, byte-preserving migration. Callers apply guarded edits themselves. */
export function planLegacyCollectionImport(input: LegacyCollectionImportInput): LegacyCollectionImportResult {
  try {
    object(input.sources, "Sources"); object(input.routes, "Routes");
    const previous = input.sidecar ?? input.sources[EDITOR_PAGE_BUILDER_PATH];
    if (input.sidecar !== undefined && Object.hasOwn(input.sources, EDITOR_PAGE_BUILDER_PATH) && input.sources[EDITOR_PAGE_BUILDER_PATH] !== input.sidecar) fail("Conflicting page builder document sources.");
    const document = readPageBuilderDocument(previous);
    const edits: Record<string, RangeEdit[]> = {};
    const expectedSources: Record<string, string | undefined> = { [EDITOR_PAGE_BUILDER_PATH]: previous };
    const discovered: { pagePath: string; source: string; collection: SourceCollection; id: string; fields: string[]; privateFields: string[] }[] = [];
    const ids = new Set(Object.keys(document.collections));
    for (const [pagePath, source] of Object.entries(input.sources)) {
      repositoryPath(pagePath);
      if (typeof source !== "string") fail("Sources must contain strings.");
      if (nativePageRoute(pagePath) === undefined) continue;
      expectedSources[pagePath] = source;
      const collections = readCollections(source);
      if (!collections.length) continue;
      for (const collection of collections) {
        if (startTagAttributes(source, collection.template.tag).length) fail("A recipe template with authored attributes cannot be removed safely.");
        if (collection.fields.some((field) => builtinFields.some((builtin) => builtin === field))) fail("Collection field declarations cannot replace builtin fields.");
        const attrs = startTagAttributes(source, collection.element.tag);
        if ([...recipeAttributes].some((name) => attrs.filter((attr) => attr.name === name).length > 1)) fail("Duplicate collection recipe attributes.");
        const existing = attribute(source, collection.element, "data-collection-id");
        if (existing !== undefined && (!existing || unsafeKeys.has(existing) || /[\s\x00-\x1f]/.test(existing))) fail("Invalid legacy collection id.");
        // Encoding is injective and remains JSON-only; no source attribute is added.
        const id = existing ?? `collection-${encodeURIComponent(pagePath)}-${makeCollectionTarget(source, collection.element).path.join(".")}`;
        if (ids.has(id)) fail(`Duplicate collection id: ${id}.`);
        ids.add(id);
        const markup = source.slice(collection.template.tag.end, collection.template.close!.start);
        const records = collectionRecords(input.sources, input.routes, input.identity, collection.spec, pagePath, collection.fields);
        const known = [...new Set([...collection.fields, ...records.flatMap((record) => Object.keys(record.fields))])];
        bindCollectionTemplate(markup, Object.fromEntries(known.map((field) => [field, ""])), known);
        for (const record of records) expectedSources[record.path] = input.sources[record.path];
        discovered.push({ pagePath, source, collection, id, fields: known.filter((field) => !builtinFields.some((builtin) => builtin === field)), privateFields: privateFields(source, collection, existing) });
        (edits[pagePath] ??= []).push(...attrs.filter((attr) => recipeAttributes.has(attr.name)).map((attr) => ({ start: attr.start, end: attr.end, text: "" })), { start: collection.template.start, end: collection.template.end, text: "" });
      }
    }
    const ownership = new Map<string, typeof discovered[number]>();
    for (const item of discovered) for (const field of item.privateFields) {
      if (ownership.has(field)) fail(`Duplicate private field ownership: ${field}.`);
      ownership.set(field, item);
    }
    const overrides = new Map<typeof discovered[number], Record<string, Record<string, string>>>();
    for (const [pagePath, source] of Object.entries(input.sources)) {
      if (nativePageRoute(pagePath) === undefined) continue;
      const seen = new Set<string>();
      for (const element of descendants(parseSource(source))) {
        if (element.name !== "meta") continue;
        const name = attribute(source, element, "name");
        const field = name?.startsWith("field:") ? name.slice(6) : undefined;
        const owner = field ? ownership.get(field) : undefined;
        if (!field || !owner) continue;
        const attrs = startTagAttributes(source, element.tag);
        // Native conversion writes only these two attributes into the authored head.
        if (element.parent?.name !== "head" || attrs.length !== 2 || attrs.filter((attr) => attr.name === "name").length !== 1 || attrs.filter((attr) => attr.name === "content").length !== 1 || seen.has(field)) fail(`Cannot safely remove private metadata ${field} from ${pagePath}.`);
        seen.add(field);
        const value = attribute(source, element, "content")!;
        if (source.slice(element.start, element.end) !== `<meta name="field:${field}" content="${escapeText(value).replace(/"/g, "&quot;")}">`) fail(`Private metadata ${field} is not in the native conversion format.`);
        const records = overrides.get(owner) ?? {};
        (records[pagePath] ??= {})[field] = value;
        overrides.set(owner, records);
        expectedSources[pagePath] = source;
        const newline = source.includes("\r\n") ? "\r\n" : "\n";
        // Remove only the exact indentation/newline inserted by withPageField.
        const generatedWhitespace = source.slice(element.start - 2, element.start) === "  " && source.slice(element.end, element.end + newline.length) === newline;
        (edits[pagePath] ??= []).push({ start: generatedWhitespace ? element.start - 2 : element.start, end: generatedWhitespace ? element.end + newline.length : element.end, text: "" });
      }
    }
    for (const item of discovered) {
      const cleaned = applyCollectionEdits(item.source, edits[item.pagePath]);
      const shifted = item.collection.element.start + edits[item.pagePath].filter((edit) => edit.end <= item.collection.element.start).reduce((offset, edit) => offset + edit.text.length - (edit.end - edit.start), 0);
      const target = makeCollectionTarget(cleaned, shifted);
      const location = locateCollectionTarget(cleaned, target);
      if ("error" in location) fail(location.error);
      document.collections[item.id] = { pagePath: item.pagePath, target, folders: item.collection.spec.folders, sort: item.collection.spec.sort, filter: item.collection.spec.filter, limit: item.collection.spec.limit, template: item.source.slice(item.collection.template.tag.end, item.collection.template.close!.start), fields: item.fields, overrides: overrides.get(item) ?? {} };
    }
    validate(document);
    for (const path of new Set(Object.values(document.collections).map((record) => record.pagePath))) {
      if (!Object.hasOwn(input.sources, path) || typeof input.sources[path] !== "string") fail(`Load ${path} before locating its collections.`);
      expectedSources[path] = input.sources[path];
      const records = Object.fromEntries(Object.entries(document.collections).filter(([, record]) => record.pagePath === path));
      const located = locateCollections(applyCollectionEdits(input.sources[path], edits[path] ?? []), records);
      if ("error" in located) fail(located.error);
      for (const [id, location] of Object.entries(located.collections)) document.collections[id].target = location.target;
    }
    // Validate every edit before returning any of them, including overlap guards.
    for (const [path, changes] of Object.entries(edits)) applyCollectionEdits(input.sources[path], changes);
    const sidecarText = writePageBuilderDocument(document, previous);
    if (sidecarText !== previous && (discovered.length || previous !== undefined)) edits[EDITOR_PAGE_BUILDER_PATH] = [{ start: 0, end: previous?.length ?? 0, text: sidecarText }];
    return { edits, document, sidecarText, expectedSources };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
