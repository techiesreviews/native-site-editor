import { startTags, VOID_ELEMENTS } from "../../shared/html-source";
import { parseSource, type SourceNode } from "./component-model";
import { builtinFields, fieldName, type CollectionIdentity, type PageFields } from "./collection-fields";
import { attribute, collectionRecords, readCollections, validCollectionRoute, type CollectionRecord } from "./collection-model";
import { decodeHtmlEntities } from "./html-entities";
import { escapeText } from "./site-head";

export interface CollectionEdit { start: number; end: number; text: string }
export interface CollectionPreview { path: string; start: number; folder: string; records: CollectionRecord[]; template: string; output: string }
export interface BakePlan {
  edits: Record<string, CollectionEdit[]>;
  expectedSources: Record<string, string>;
  collections: CollectionPreview[];
}
export type BakeResult = BakePlan | { error: string };
export function applyCollectionEdits(source: string, edits: CollectionEdit[]): string {
  let last = source.length;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > last) throw new Error("Collection edits overlap or are outside the source.");
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    last = edit.start;
  }
  return source;
}
const urlAttributes = new Set(["href", "src", "action", "formaction", "poster", "cite", "xlink:href"]);
export function safeCollectionUrl(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u0020\u007f]+/g, "").replace(/\\/g, "/");
  return !normalized.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(normalized) || /^https?:\/\//i.test(normalized);
}
function fieldsIn(value: string, known: Set<string>): string[] {
  const fields: string[] = [];
  const remaining = value.replace(/\{([a-z][a-z0-9_-]*)\}/g, (_, name: string) => {
    if (!known.has(name)) throw new Error(`Unknown collection field: ${name}.`);
    fields.push(name);
    return "";
  });
  if (/[{}]/.test(remaining)) throw new Error("Malformed collection field binding.");
  return fields;
}
function substitute(value: string, fields: PageFields, known: Set<string>, escape: (value: string) => string): string {
  fieldsIn(value, known);
  return value.replace(/\{([a-z][a-z0-9_-]*)\}/g, (_, name: string) => escape(fields[name] ?? ""));
}
function validateAttributes(source: string, start: number, end: number): void {
  let tail = source.slice(start, end - 1);
  const seen = new Set<string>();
  while (tail.trim() && tail.trim() !== "/") {
    const match = /^\s+([^\s"'<>`=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/.exec(tail);
    if (!match) throw new Error("The collection template contains malformed attributes.");
    const name = match[1].toLowerCase();
    if (seen.has(name)) throw new Error(`The collection template repeats the ${name} attribute.`);
    seen.add(name);
    tail = tail.slice(match[0].length);
  }
}
/** Collection templates use explicit, balanced markup; browser repair would change the design. */
function validateTemplate(source: string): void {
  const tags = new Map(startTags(source).map((tag) => [tag.start, tag]));
  const stack: string[] = [];
  const raw = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);
  let at = 0;
  while (at < source.length) {
    const start = source.indexOf("<", at);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      if (end < 0) throw new Error("The collection template contains an incomplete comment.");
      at = end + 3; continue;
    }
    if (source.startsWith("</", start)) {
      const close = /^<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>/.exec(source.slice(start));
      if (!close || stack.pop() !== close[1].toLowerCase()) throw new Error("The collection template contains mismatched closing tags.");
      at = start + close[0].length; continue;
    }
    const tag = tags.get(start);
    if (!tag) {
      if (/[a-zA-Z!?]/.test(source[start + 1] ?? "")) throw new Error("The collection template contains malformed markup.");
      at = start + 1; continue;
    }
    if (source[tag.end - 1] !== ">") throw new Error("The collection template contains incomplete markup.");
    validateAttributes(source, tag.nameEnd, tag.end);
    at = tag.end;
    if (VOID_ELEMENTS.has(tag.name)) continue;
    if (raw.has(tag.name)) {
      const end = source.toLowerCase().indexOf(`</${tag.name}`, at);
      if (end < 0) throw new Error("The collection template contains incomplete markup.");
      at = end;
    }
    stack.push(tag.name);
  }
  if (stack.length) throw new Error("The collection template contains incomplete markup.");
}
/** Source-preserving binding: text and attribute values only, never tag names or comments. */
export function bindCollectionTemplate(template: string, fields: PageFields, knownFields = Object.keys(fields)): string {
  validateTemplate(template);
  const known = new Set([...builtinFields, ...knownFields]);
  const tree = parseSource(template);
  const raw = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);
  const render = (nodes: SourceNode[], from: number, to: number): string => {
    let output = "", cursor = from;
    for (const node of nodes) {
      output += template.slice(cursor, node.start);
      cursor = node.end;
      if (node.type === "text") {
        if (/<\/?\{/.test(template.slice(node.start, node.end))) throw new Error("Bindings are allowed only in text and attribute values.");
        output += substitute(template.slice(node.start, node.end), fields, known, escapeText);
        continue;
      }
      if ((!VOID_ELEMENTS.has(node.name) && !node.close) || template[node.tag.end - 1] !== ">") throw new Error("The collection template contains incomplete markup.");
      if (node.name === "template" || attribute(template, node, "data-each") !== undefined) throw new Error("Nested collections and templates are not supported.");
      const condition = attribute(template, node, "data-if");
      if (condition !== undefined && (!fieldName.test(condition) || !known.has(condition))) throw new Error(`Unknown or malformed collection condition: ${condition}.`);
      let tag = template.slice(node.start, node.tag.end);
      const edits: CollectionEdit[] = [];
      // Attribute scanner covers quoted > and unquoted values. Attribute names cannot be bindings.
      const attrs = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      const attrSource = template.slice(node.tag.nameEnd, node.tag.end - 1);
      for (const match of attrSource.matchAll(attrs)) {
        const name = match[1].toLowerCase();
        if (/[{}]/.test(name)) throw new Error("Bindings are allowed only in text and attribute values.");
        const value = match[2] ?? match[3] ?? match[4];
        if (value === undefined) continue;
        if (name === "data-if") continue;
        const bound = fieldsIn(value, known);
        if (!bound.length) continue;
        if (name.startsWith("on") || ["style", "srcdoc", "srcset"].includes(name)) throw new Error(`Bindings are not supported in ${name}.`);
        const decoded = decodeHtmlEntities(value, true);
        const plain = substitute(decoded, fields, known, (text) => text);
        if (urlAttributes.has(name) && !safeCollectionUrl(plain)) throw new Error(`Unsafe collection URL in ${name}.`);
        const escaped = escapeText(plain).replace(/"/g, "&quot;");
        const start = node.tag.nameEnd - node.start + match.index!;
        edits.push({ start, end: start + match[0].length, text: ` ${name}="${escaped}"` });
      }
      tag = applyCollectionEdits(tag, edits);
      // Validate descendants even when a condition omits the entire element.
      let inner = "";
      if (raw.has(node.name)) {
        inner = template.slice(node.tag.end, node.close?.start ?? node.tag.end);
        if (/[{}]/.test(inner)) throw new Error(`Bindings are not supported inside ${node.name}.`);
      } else inner = render(node.children, node.tag.end, node.close?.start ?? node.tag.end);
      if (condition !== undefined && !fields[condition]?.trim()) continue;
      output += tag + inner + (node.close ? template.slice(node.close.start, node.close.end) : "");
    }
    return output + template.slice(cursor, to);
  };
  return render(tree, 0, template.length);
}

/** Computes all dependent listing edits as one fail-closed, immutable source plan. */
export function planBake(sources: Record<string, string>, routes: Record<string, string>, identity: CollectionIdentity): BakeResult {
  try {
    const edits: BakePlan["edits"] = {}, expectedSources: Record<string, string> = {}, collections: CollectionPreview[] = [];
    const pagePaths = [...new Set(Object.entries(routes).filter(([url, path]) => validCollectionRoute(url, path)).map(([, path]) => path))];
    for (const path of pagePaths) {
      if (sources[path] === undefined) throw new Error(`Load ${path} before baking collections.`);
      expectedSources[path] = sources[path];
    }
    for (const path of pagePaths) {
      const source = sources[path];
      for (const collection of readCollections(source)) {
        const { element, template, spec } = collection;
        const all = collectionRecords(sources, routes, identity, { ...spec, sort: "", filter: "", limit: Number.MAX_SAFE_INTEGER }, path);
        const known = [...new Set(all.flatMap((record) => Object.keys(record.fields)))];
        const markup = source.slice(template.tag.end, template.close!.start);
        // An empty list still validates its template instead of silently accepting a typo.
        bindCollectionTemplate(markup, Object.fromEntries([...builtinFields, ...known].map((field) => [field, ""])), known);
        const records = collectionRecords(sources, routes, identity, spec, path);
        const newline = source.includes("\r\n") ? "\r\n" : "\n";
        const output = records.map((record) => bindCollectionTemplate(markup, record.fields, known)).join(newline);
        const text = source.slice(template.start, template.end) + output;
        const edit = { start: element.tag.end, end: element.close!.start, text };
        if (source.slice(edit.start, edit.end) !== text) (edits[path] ??= []).push(edit);
        collections.push({ path, start: element.start, folder: spec.folder, records, template: markup, output });
      }
    }
    return { edits, expectedSources, collections };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The collections could not be baked." };
  }
}

/** Combines a page edit with its dependent listings without overlapping range edits. */
export function planCollectionChange(before: Record<string, string>, after: Record<string, string>, routes: Record<string, string>, identity: CollectionIdentity): BakeResult {
  const baked = planBake(after, routes, identity);
  if ("error" in baked) return baked;
  const edits: BakePlan["edits"] = {};
  for (const path of Object.keys(baked.expectedSources)) {
    const final = applyCollectionEdits(after[path], baked.edits[path] ?? []);
    if (final !== before[path]) edits[path] = [{ start: 0, end: before[path].length, text: final }];
  }
  return { ...baked, edits, expectedSources: Object.fromEntries(Object.keys(baked.expectedSources).map((path) => [path, before[path]])) };
}
