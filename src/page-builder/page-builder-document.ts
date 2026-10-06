import { assertJsonValue as json, type JsonValue } from "./source-target";
import { nativePageRoute } from "../../shared/native-routes";

export const EDITOR_PAGE_BUILDER_PATH = ".editor/page-builder.json";
export type { JsonValue };
export interface PageBuilderPage { [key: string]: JsonValue | undefined; sections?: { [key: string]: JsonValue } }
export interface PageBuilderDocument {
  version: 1;
  pages: Record<string, PageBuilderPage>;
  [key: string]: unknown;
}
// Unknown JSON keys are preserved except these globally reserved prototype names.
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object.`);
}
function repositoryPath(path: unknown): asserts path is string {
  if (typeof path !== "string" || !path || path.startsWith("/") || /[\\\x00-\x1f?#:]/.test(path) || path.split("/").some((part) => !part || part === "." || part === ".." || unsafeKeys.has(part))) fail("Use a safe relative repository path.");
}
function pagePath(value: unknown): asserts value is string {
  repositoryPath(value);
  if (nativePageRoute(value) === undefined) fail("Page metadata must refer to a native HTML page.");
}
function validate(document: unknown): asserts document is PageBuilderDocument {
  json(document); object(document, "Page builder document");
  if (document.version !== 1) fail("Unsupported page builder document version.");
  object(document.pages, "Pages");
  for (const [path, page] of Object.entries(document.pages)) {
    pagePath(path); object(page, "Page metadata");
    if (page.sections !== undefined) object(page.sections, "Page sections");
  }
}

function stable(value: unknown): string {
  const sorted = (item: unknown): unknown => Array.isArray(item) ? item.map(sorted) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, sorted(child)])) : item;
  return JSON.stringify(sorted(value), null, 2) + "\n";
}
export function readPageBuilderDocument(text: string | undefined): PageBuilderDocument {
  const document: unknown = text === undefined ? { version: 1, pages: {} } : JSON.parse(text);
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
  validate(document);
  const { collections: _collections, ...keptDocument } = document;
  const next = { ...keptDocument, pages: Object.fromEntries(Object.entries(document.pages).map(([path, page]) => {
    const { fields: _fields, ...kept } = page;
    return [path, kept];
  })) };
  validate(next); const text = stable(next);
  return previousText !== undefined && stable(readPageBuilderDocument(previousText)) === text ? previousText : text;
}
