// Prepared, pure model for moving custom page fields out of public HTML
// (<meta name="field:slug">) into editor-only JSON (.editor/page-builder.json,
// pages[path].fields). Not wired into the host yet. Nothing here applies,
// fetches or renders; callers receive NativeOperation-shaped plans.
import { startTags, type StartTag } from "../../shared/html-source";
import { nativePageRoute } from "../../shared/native-routes";
import { descendants, parseSource, startTagAttributes } from "./component-model";
import { builtinFields, fieldName } from "./collection-fields";
import { decodeHtmlEntities } from "./html-entities";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument, type PageBuilderDocument } from "./page-builder-document";
import { headTags } from "./site-head";

export type NativePageFieldErrorCode =
  | "native-page-fields/malformed-source"
  | "native-page-fields/multiple-head"
  | "native-page-fields/outside-head"
  | "native-page-fields/invalid-path"
  | "native-page-fields/file-graph"
  | "native-page-fields/duplicate-meta"
  | "native-page-fields/invalid-field"
  | "native-page-fields/reserved-field"
  | "native-page-fields/unsafe-key"
  | "native-page-fields/invalid-sidecar"
  | "native-page-fields/conflict"
  | "native-page-fields/functional-attribute";

export class NativePageFieldError extends Error {
  constructor(readonly code: NativePageFieldErrorCode, message: string) {
    super(message);
    this.name = "NativePageFieldError";
  }
}

export interface EditorFieldMeta { field: string; value: string; start: number; end: number }

/** Guard and change inputs compatible with the host's NativeOperation. */
export interface NativePageFieldPlan {
  expectedSources: Map<string, string | undefined>;
  edits: Map<string, string>;
  /** The whole file graph this plan was made against, for file-graph guards. */
  expectedFiles: string[];
  /** Fields moved into JSON (null-prototype map). */
  fields: Record<string, string>;
}
export type NativePageFieldResult = { noop: true } | ({ noop: false } & NativePageFieldPlan);

const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const prefix = "field:";

function fail(code: NativePageFieldErrorCode, message: string): never { throw new NativePageFieldError(code, message); }
function emptyMap(): Record<string, string> { return Object.create(null) as Record<string, string>; }

/** Custom field names only: never a built-in (title, url, …) nor a prototype key. */
export function assertCustomFieldName(field: string): void {
  if (unsafeKeys.has(field)) fail("native-page-fields/unsafe-key", `Unsafe field name: ${field}.`);
  if (builtinFields.some((name) => name === field)) fail("native-page-fields/reserved-field", `${field} is a built-in field, not a custom field.`);
  if (!fieldName.test(field)) fail("native-page-fields/invalid-field", `Invalid custom field name: ${field}.`);
}

/** Decoded attributes, read like readPageFields (full entity table, attribute mode). */
function decodedAttributes(source: string, tag: StartTag): { name: string; value: string }[] {
  return startTagAttributes(source, tag).map((item) => {
    const raw = source.slice(item.start, item.end);
    const match = /^[\t\n\f\r ]+[^\t\n\f\r "'>\/=]+(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r "'=<>`]+)))?/.exec(raw);
    return { name: item.name, value: decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "", true) };
  });
}

/** Whether parsed attributes, whitespace and "/" cover the whole start tag; else a value could be lost. */
function fullyParsed(source: string, tag: StartTag): boolean {
  let cursor = tag.nameEnd;
  const gap = (to: number) => /^[\t\n\f\r /]*$/.test(source.slice(cursor, to));
  for (const item of startTagAttributes(source, tag)) {
    if (item.start < cursor || !gap(item.start)) return false;
    cursor = item.end;
  }
  return gap(tag.end - 1) && source[tag.end - 1] === ">";
}

/** Reads explicit editor-owned field: metas, direct children of the single <head>. Refuses ambiguity. */
export function readEditorFieldMetas(source: string): EditorFieldMeta[] {
  const all = startTags(source);
  if (all.filter((tag) => tag.name === "head").length > 1) fail("native-page-fields/multiple-head", "This page has more than one <head>.");
  let end: number;
  try { end = headTags(source).end; } catch { fail("native-page-fields/malformed-source", "This page needs one complete <head>."); }
  if (all.some((tag) => tag.start < end && tag.end > end)) fail("native-page-fields/malformed-source", "A tag runs past </head>.");
  const metas: EditorFieldMeta[] = [];
  const seen = new Set<string>();
  for (const element of descendants(parseSource(source))) {
    if (element.name !== "meta") continue;
    const attributes = decodedAttributes(source, element.tag);
    const names = attributes.filter((item) => item.name === "name");
    if (attributes.some((item) => item.name === "property" && item.value.startsWith(prefix)) && !names.some((item) => item.value.startsWith(prefix)))
      fail("native-page-fields/invalid-field", "Field metas must use name=\"field:…\", not property.");
    if (!names.some((item) => item.value.startsWith(prefix))) {
      if (decodeHtmlEntities(source.slice(element.tag.start, element.tag.end), true).includes(prefix) && !fullyParsed(source, element.tag))
        fail("native-page-fields/malformed-source", "A meta that may hold a field has attributes that cannot be read exactly.");
      continue;
    }
    if (!fullyParsed(source, element.tag)) fail("native-page-fields/malformed-source", "A field meta has attributes that cannot be read exactly.");
    if (element.parent?.name !== "head") fail("native-page-fields/outside-head", "A field meta is outside the page <head> (body, template or noscript).");
    const contents = attributes.filter((item) => item.name === "content");
    if (names.length !== 1 || contents.length > 1 || attributes.some((item) => item.name === "property"))
      fail("native-page-fields/duplicate-meta", "A field meta has ambiguous attributes.");
    const field = names[0].value.slice(prefix.length);
    assertCustomFieldName(field);
    if (seen.has(field)) fail("native-page-fields/duplicate-meta", `Field ${field} appears more than once.`);
    seen.add(field);
    metas.push({ field, value: contents[0]?.value ?? "", start: element.tag.start, end: element.tag.end });
  }
  return metas;
}

function assertPagePath(pagePath: string): void {
  if (typeof pagePath !== "string" || pagePath.split("/").some((part) => unsafeKeys.has(part)) || nativePageRoute(pagePath) === undefined)
    fail("native-page-fields/invalid-path", "Use a safe native HTML page path.");
}
/** The sidecar text must match the file graph: present means loaded, absent means missing. */
function assertGraph(files: readonly string[], pagePath: string, sidecarText: string | undefined): string[] {
  if (!Array.isArray(files)) fail("native-page-fields/file-graph", "Pass the current file graph.");
  const graph = new Set(files);
  if (!graph.has(pagePath)) fail("native-page-fields/file-graph", "The page is not in the current file graph.");
  if (sidecarText === undefined && graph.has(EDITOR_PAGE_BUILDER_PATH)) fail("native-page-fields/file-graph", `Load ${EDITOR_PAGE_BUILDER_PATH} first.`);
  if (sidecarText !== undefined && !graph.has(EDITOR_PAGE_BUILDER_PATH)) fail("native-page-fields/file-graph", "Editor JSON text does not match the file graph.");
  return [...graph].sort();
}

function readSidecar(text: string | undefined): PageBuilderDocument {
  try { return readPageBuilderDocument(text); } catch (error) {
    fail("native-page-fields/invalid-sidecar", `Editor JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function writeSidecar(document: PageBuilderDocument, previous: string | undefined): string {
  try { return writePageBuilderDocument(document, previous); } catch (error) {
    fail("native-page-fields/invalid-sidecar", `Editor JSON cannot be written: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function pageFields(document: PageBuilderDocument, pagePath: string): Record<string, string> | undefined {
  return Object.hasOwn(document.pages, pagePath) ? document.pages[pagePath].fields : undefined;
}
function withFields(document: PageBuilderDocument, pagePath: string, fields: Record<string, string>): PageBuilderDocument {
  const page = Object.hasOwn(document.pages, pagePath) ? document.pages[pagePath] : {};
  const merged = { ...(page.fields ?? {}), ...fields };
  return { ...document, pages: { ...document.pages, [pagePath]: { ...page, fields: merged } } };
}

/** JSON-only write of one custom page field. Same value is a noop (no Undo entry). */
export function planPageFieldJsonWrite(files: readonly string[], sidecarText: string | undefined, pagePath: string, field: string, value: string): NativePageFieldResult {
  assertCustomFieldName(field);
  assertPagePath(pagePath);
  const expectedFiles = assertGraph(files, pagePath, sidecarText);
  if (typeof value !== "string") fail("native-page-fields/invalid-field", "Field values must be strings.");
  const document = readSidecar(sidecarText);
  const current = pageFields(document, pagePath);
  if (current && Object.hasOwn(current, field) && current[field] === value) return { noop: true };
  const text = writeSidecar(withFields(document, pagePath, { [field]: value }), sidecarText);
  if (text === sidecarText) return { noop: true };
  const fields = emptyMap(); fields[field] = value;
  return {
    noop: false,
    expectedSources: new Map([[EDITOR_PAGE_BUILDER_PATH, sidecarText]]),
    edits: new Map([[EDITOR_PAGE_BUILDER_PATH, text]]),
    expectedFiles,
    fields,
  };
}

/** Range for removing a meta; a tag alone on its line takes its line with it. */
function removalRange(source: string, start: number, end: number): [number, number] {
  let lineStart = start;
  while (lineStart > 0 && (source[lineStart - 1] === " " || source[lineStart - 1] === "\t")) lineStart--;
  let lineEnd = end;
  while (lineEnd < source.length && (source[lineEnd] === " " || source[lineEnd] === "\t")) lineEnd++;
  const atLineStart = lineStart === 0 || source[lineStart - 1] === "\n";
  if (atLineStart && source.startsWith("\r\n", lineEnd)) return [lineStart, lineEnd + 2];
  if (atLineStart && source[lineEnd] === "\n") return [lineStart, lineEnd + 1];
  return [start, end];
}

/**
 * A field tag is removed whole, so it must hold nothing but its field: a tag
 * that also has http-equiv (a redirect, a security policy), charset, itemprop,
 * property or any other attribute does something for the page and refuses.
 * Every move of field tags (one page, or the whole site) goes through this.
 */
export function assertOnlyEditorData(source: string, metas: readonly EditorFieldMeta[]): void {
  const tags = startTags(source);
  for (const meta of metas) {
    const tag = tags.find((item) => item.start === meta.start);
    const extra = tag ? [...new Set(startTagAttributes(source, tag).map((item) => item.name.toLowerCase()).filter((name) => name !== "name" && name !== "content"))] : ["unreadable markup"];
    if (extra.length) fail("native-page-fields/functional-attribute", `The field tag “field:${meta.field}” also has ${extra.join(", ")}, which the page itself may use, so it is neither moved nor removed. In Code, move that attribute to a tag of its own or take the field name off this tag, then try again.`);
  }
}

export interface LegacyPageFieldMigrationInput {
  /** Every path in the current file graph, loaded or not. */
  files: readonly string[];
  pagePath: string;
  source: string;
  sidecarText?: string;
  /** Explicit choices for current conflicts only, by field: the HTML or the JSON value. */
  expectedOverrides?: Record<string, string>;
}

/** Moves field: metas into JSON and deletes only those metas. Conflicts refuse the whole plan. */
export function planLegacyPageFieldMigration(input: LegacyPageFieldMigrationInput): NativePageFieldResult {
  const { pagePath, source, sidecarText } = input;
  assertPagePath(pagePath);
  const expectedFiles = assertGraph(input.files, pagePath, sidecarText);
  const metas = readEditorFieldMetas(source);
  assertOnlyEditorData(source, metas);
  const overrides = input.expectedOverrides ?? {};
  if (!metas.length) {
    if (Object.keys(overrides).length) fail("native-page-fields/conflict", "An override names a field that is not in conflict.");
    return { noop: true };
  }
  const document = readSidecar(sidecarText);
  const current = pageFields(document, pagePath);
  const fields = emptyMap();
  const conflicts = new Map<string, { html: string; json: string }>();
  for (const meta of metas) {
    const existing = current && Object.hasOwn(current, meta.field) ? current[meta.field] : undefined;
    if (existing !== undefined && existing !== meta.value) conflicts.set(meta.field, { html: meta.value, json: existing });
    else fields[meta.field] = meta.value;
  }
  for (const key of Object.keys(overrides)) {
    const conflict = conflicts.get(key);
    if (!conflict || (overrides[key] !== conflict.html && overrides[key] !== conflict.json))
      fail("native-page-fields/conflict", `The choice for ${key} does not match a current conflict.`);
  }
  for (const [field, conflict] of conflicts) {
    if (!Object.hasOwn(overrides, field)) fail("native-page-fields/conflict", `Field ${field} differs between the page and editor JSON.`);
    if (overrides[field] === conflict.html) fields[field] = conflict.html;
  }
  let html = source;
  for (const meta of [...metas].reverse()) {
    const [start, end] = removalRange(html, meta.start, meta.end);
    html = html.slice(0, start) + html.slice(end);
  }
  const text = writeSidecar(withFields(document, pagePath, { ...fields }), sidecarText);
  const edits = new Map<string, string>([[pagePath, html]]);
  if (text !== sidecarText) edits.set(EDITOR_PAGE_BUILDER_PATH, text);
  return {
    noop: false,
    expectedSources: new Map<string, string | undefined>([[pagePath, source], [EDITOR_PAGE_BUILDER_PATH, sidecarText]]),
    edits,
    expectedFiles,
    fields,
  };
}
