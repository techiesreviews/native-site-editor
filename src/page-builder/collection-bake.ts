import { startTags, VOID_ELEMENTS } from "../../shared/html-source";
import { descendants, parseSource, type SourceNode } from "./component-model";
import { builtinFields, fieldName, ownPageField, resolvePageFields, type CollectionIdentity, type PageDataRecord, type PageFields } from "./collection-fields";
import { attribute, collectionRecords, knownCollectionField, readCollections, validCollectionRoute, type CollectionRecord, type SourceCollection } from "./collection-model";
import { decodeHtmlEntities } from "./html-entities";
import { escapeText } from "./site-head";

export interface CollectionEdit { start: number; end: number; text: string }
export interface CollectionPreview { path: string; start: number; folder: string; folders: string[]; records: CollectionRecord[]; template: string; output: string }
/** A listing whose own recipe cannot be read or baked. `start` is -1 when its page's listings cannot be told apart. */
export interface BrokenListing { path: string; start: number; error: string }
export interface BakePlan {
  edits: Record<string, CollectionEdit[]>;
  expectedSources: Record<string, string>;
  collections: CollectionPreview[];
  /** With `skipBroken` only: listings left out of the bake, each with its own reason. */
  broken?: BrokenListing[];
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
const urlAttributes = new Set(["href", "src", "data", "action", "formaction", "poster", "cite", "xlink:href"]);
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
  return value.replace(/\{([a-z][a-z0-9_-]*)\}/g, (_, name: string) => escape(ownPageField(fields, name)));
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
      // data-if="field" renders when the field has text; data-if="!field" only when it is empty.
      const negated = condition?.startsWith("!") ?? false;
      const conditionField = negated ? condition!.slice(1) : condition;
      if (conditionField !== undefined && (!fieldName.test(conditionField) || !known.has(conditionField))) throw new Error(`Unknown or malformed collection condition: ${condition}.`);
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
        if (node.name === "script") throw new Error("Bindings are not supported on script elements.");
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
      if (conditionField !== undefined && !ownPageField(fields, conditionField).trim() !== negated) continue;
      output += tag + inner + (node.close ? template.slice(node.close.start, node.close.end) : "");
    }
    return output + template.slice(cursor, to);
  };
  return render(tree, 0, template.length);
}

/** Filter, stable sort and limit over already resolved records, as both recipe kinds apply them. */
export function selectCollectionRecords(records: CollectionRecord[], spec: { filter: string; sort: string; limit: number }, declared: readonly string[]): CollectionRecord[] {
  let out = records;
  if (spec.filter) {
    const at = spec.filter.indexOf("=");
    const field = spec.filter.slice(0, at), value = spec.filter.slice(at + 1);
    if (!knownCollectionField(field, records, declared)) throw new Error(`Unknown collection field: ${field}.`);
    out = out.filter((record) => ownPageField(record.fields, field) === value);
  }
  if (spec.sort) {
    const descending = spec.sort.startsWith("-");
    const field = descending ? spec.sort.slice(1) : spec.sort;
    if (!knownCollectionField(field, records, declared)) throw new Error(`Unknown collection field: ${field}.`);
    out = out.map((record, index) => ({ record, index })).sort((a, b) => {
      const av = ownPageField(a.record.fields, field), bv = ownPageField(b.record.fields, field);
      const comparison = av < bv ? -1 : av > bv ? 1 : 0;
      return comparison ? comparison * (descending ? -1 : 1) : a.index - b.index;
    }).map(({ record }) => record);
  }
  return out.slice(0, spec.limit);
}

/**
 * Page records from the editor's JSON for a bake. Hosts build it from the whole
 * file graph (see `bakePageData`), which refuses a JSON that exists but is not
 * read or not valid. Read only when a page has an inline listing.
 */
export type BakePageData = () => { pages: Readonly<Record<string, PageDataRecord>> };

const reason = (error: unknown) => error instanceof Error ? error.message : "The collection could not be baked.";
/** Where a page's first listing starts, found without validating it (-1 when it cannot be found). */
function firstListingStart(source: string): number {
  try { return [...descendants(parseSource(source))].find((element) => attribute(source, element, "data-each") !== undefined)?.start ?? -1; }
  catch { return -1; }
}
/** One listing's finished cards, or the reason its own recipe cannot be baked. */
function bakeListing(sources: Record<string, string>, routes: Record<string, string>, identity: CollectionIdentity, pages: Readonly<Record<string, PageDataRecord>>, path: string, collection: SourceCollection) {
  const source = sources[path];
  const { element, template, spec } = collection;
  const all = collectionRecords(sources, routes, identity, { ...spec, sort: "", filter: "", limit: Number.MAX_SAFE_INTEGER }, path)
    .map((record) => ({ ...record, fields: resolvePageFields(record.fields, Object.hasOwn(pages, record.path) ? pages[record.path] : undefined) }));
  const known = [...new Set([...collection.fields, ...all.flatMap((record) => Object.keys(record.fields))])];
  validateTemplate(source.slice(template.start, template.end));
  const markup = source.slice(template.tag.end, template.close!.start);
  // An empty list still validates its template instead of silently accepting a typo.
  bindCollectionTemplate(markup, Object.fromEntries([...builtinFields, ...known].map((field) => [field, ""])), known);
  const records = selectCollectionRecords(all, spec, collection.fields);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const output = records.map((record) => bindCollectionTemplate(markup, record.fields, known)).join(newline);
  const text = source.slice(template.start, template.end) + output;
  const edit = { start: element.tag.end, end: element.close!.start, text };
  const preview: CollectionPreview = { path, start: element.start, folder: spec.folder, folders: spec.folders, records, template: markup, output };
  return { ...(source.slice(edit.start, edit.end) !== text ? { edit } : {}), preview };
}

/**
 * Computes all dependent listing edits as one fail-closed, immutable source plan.
 * With `skipBroken`, a listing whose own recipe cannot be read or baked is left
 * out (no edit: its bytes stay exactly as they are) and named in `broken`.
 * Graph inputs (a missing page source, unreadable page data) still fail the plan.
 */
export function planBake(sources: Record<string, string>, routes: Record<string, string>, identity: CollectionIdentity, pageData?: BakePageData, options: { skipBroken?: boolean } = {}): BakeResult {
  try {
    const edits: BakePlan["edits"] = {}, expectedSources: Record<string, string> = {}, collections: CollectionPreview[] = [], broken: BrokenListing[] = [];
    // Without page data (standalone callers), cards read the pages' HTML fields only.
    let pages: Readonly<Record<string, PageDataRecord>> | undefined;
    const pagePaths = [...new Set(Object.entries(routes).filter(([url, path]) => validCollectionRoute(url, path)).map(([, path]) => path))];
    for (const path of pagePaths) {
      if (sources[path] === undefined) throw new Error(`Load ${path} before baking collections.`);
      expectedSources[path] = sources[path];
    }
    for (const path of pagePaths) {
      const source = sources[path];
      let parsed: SourceCollection[];
      try { parsed = readCollections(source); }
      catch (error) {
        if (!options.skipBroken) throw error;
        broken.push({ path, start: firstListingStart(source), error: reason(error) });
        continue;
      }
      for (const collection of parsed) {
        // Page data is a graph input: unreadable, it fails the whole plan.
        pages ??= pageData ? pageData().pages : {};
        let baked: { edit?: CollectionEdit; preview: CollectionPreview };
        try { baked = bakeListing(sources, routes, identity, pages, path, collection); }
        catch (error) {
          if (!options.skipBroken) throw error;
          broken.push({ path, start: collection.element.start, error: reason(error) });
          continue;
        }
        if (baked.edit) (edits[path] ??= []).push(baked.edit);
        collections.push(baked.preview);
      }
    }
    return { edits, expectedSources, collections, ...(options.skipBroken ? { broken } : {}) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The collections could not be baked." };
  }
}

/** Combines a page edit with its dependent listings without overlapping range edits. */
export function planCollectionChange(before: Record<string, string>, after: Record<string, string>, routes: Record<string, string>, identity: CollectionIdentity, pageData?: BakePageData): BakeResult {
  const baked = planBake(after, routes, identity, pageData);
  if ("error" in baked) return baked;
  const edits: BakePlan["edits"] = {};
  for (const path of Object.keys(baked.expectedSources)) {
    const final = applyCollectionEdits(after[path], baked.edits[path] ?? []);
    if (final !== before[path]) edits[path] = [{ start: 0, end: before[path].length, text: final }];
  }
  return { ...baked, edits, expectedSources: Object.fromEntries(Object.keys(baked.expectedSources).map((path) => [path, before[path]])) };
}
