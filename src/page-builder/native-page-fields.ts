// Prepared, pure model for moving custom page fields out of public HTML
// (<meta name="field:slug">) into editor-only JSON (.editor/page-builder.json,
// pages[path].fields). Not wired into the host yet. Nothing here applies,
// fetches or renders; callers receive NativeOperation-shaped plans.
import { startTags } from "../../shared/html-source";
import { startTagAttributes } from "./component-model";
import { builtinFields, fieldName } from "./collection-fields";
import { EDITOR_PAGE_BUILDER_PATH, readPageBuilderDocument, writePageBuilderDocument, type PageBuilderDocument } from "./page-builder-document";
import { headTags } from "./site-head";

export type NativePageFieldErrorCode =
  | "native-page-fields/malformed-source"
  | "native-page-fields/multiple-head"
  | "native-page-fields/duplicate-meta"
  | "native-page-fields/invalid-field"
  | "native-page-fields/reserved-field"
  | "native-page-fields/unsafe-key"
  | "native-page-fields/invalid-sidecar"
  | "native-page-fields/conflict";

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
  /** Paths the operation reads or writes, for file-graph guards. */
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

/** Reads explicit editor-owned field: metas in the single <head>. Refuses ambiguity. */
export function readEditorFieldMetas(source: string): EditorFieldMeta[] {
  const heads = startTags(source).filter((tag) => tag.name === "head");
  if (heads.length > 1) fail("native-page-fields/multiple-head", "This page has more than one <head>.");
  let tags;
  try { tags = headTags(source).tags; } catch { fail("native-page-fields/malformed-source", "This page needs one complete <head>."); }
  const metas: EditorFieldMeta[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag.name !== "meta") continue;
    const attributes = startTagAttributes(source, tag);
    const names = attributes.filter((item) => item.name === "name");
    if (!names.some((item) => item.value.startsWith(prefix))) continue;
    const contents = attributes.filter((item) => item.name === "content");
    if (names.length !== 1 || contents.length > 1 || attributes.some((item) => item.name === "property"))
      fail("native-page-fields/duplicate-meta", "A field meta has ambiguous attributes.");
    const field = names[0].value.slice(prefix.length);
    assertCustomFieldName(field);
    if (seen.has(field)) fail("native-page-fields/duplicate-meta", `Field ${field} appears more than once.`);
    seen.add(field);
    metas.push({ field, value: contents[0]?.value ?? "", start: tag.start, end: tag.end });
  }
  return metas;
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
  if (unsafeKeys.has(pagePath)) fail("native-page-fields/unsafe-key", "Unsafe page path.");
  const page = Object.hasOwn(document.pages, pagePath) ? document.pages[pagePath] : {};
  const merged = { ...(page.fields ?? {}), ...fields };
  return { ...document, pages: { ...document.pages, [pagePath]: { ...page, fields: merged } } };
}

/** JSON-only write of one custom page field. Same value is a noop (no Undo entry). */
export function planPageFieldJsonWrite(sidecarText: string | undefined, pagePath: string, field: string, value: string): NativePageFieldResult {
  assertCustomFieldName(field);
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
    expectedFiles: [EDITOR_PAGE_BUILDER_PATH],
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

export interface LegacyPageFieldMigrationInput {
  pagePath: string;
  source: string;
  sidecarText?: string;
  /** Explicit values the caller accepts over conflicting JSON, by field. */
  expectedOverrides?: Record<string, string>;
}

/** Moves field: metas into JSON and deletes only those metas. Conflicts refuse the whole plan. */
export function planLegacyPageFieldMigration(input: LegacyPageFieldMigrationInput): NativePageFieldResult {
  const { pagePath, source, sidecarText } = input;
  const metas = readEditorFieldMetas(source);
  if (!metas.length) return { noop: true };
  const document = readSidecar(sidecarText);
  const current = pageFields(document, pagePath);
  const overrides = input.expectedOverrides ?? {};
  const fields = emptyMap();
  for (const meta of metas) {
    const existing = current && Object.hasOwn(current, meta.field) ? current[meta.field] : undefined;
    if (existing !== undefined && existing !== meta.value) {
      const accepted = Object.hasOwn(overrides, meta.field) ? overrides[meta.field] : undefined;
      if (accepted === meta.value) fields[meta.field] = meta.value;
      else if (accepted === existing) continue;
      else fail("native-page-fields/conflict", `Field ${meta.field} differs between the page and editor JSON.`);
    } else fields[meta.field] = meta.value;
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
    expectedFiles: [pagePath, EDITOR_PAGE_BUILDER_PATH],
    fields,
  };
}
