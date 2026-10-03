import { nativePageRoute, NATIVE_NOT_FOUND_PAGE } from "../../shared/native-routes";
import { startTagAttribute, VOID_ELEMENTS } from "../../shared/html-source";
import { descendants, parseSource, type SourceElement } from "./component-model";
import { escapeText } from "./site-head";
import { decodeHtmlEntities } from "./html-entities";
import { fieldName, ownPageField, readPageFields, type CollectionIdentity, type PageFields } from "./collection-fields";

export interface CollectionSpec {
  folder: string;
  folders: string[];
  sort: string;
  filter: string;
  limit: number;
}
export interface CollectionRecord { path: string; url: string; fields: PageFields }
export interface SourceCollection {
  element: SourceElement;
  template: SourceElement;
  spec: CollectionSpec;
}
export const MAX_COLLECTION_ITEMS = 500;
export function attribute(source: string, el: SourceElement, name: string): string | undefined {
  const found = startTagAttribute(source, el.tag, name);
  return found ? decodeHtmlEntities(found.value, true) : undefined;
}
export interface CollectionInput { folder?: string; folders?: readonly string[]; sort?: string; filter?: string; limit?: string }
/** HTML token lists split only on ASCII whitespace; each token remains a canonical URL. */
export function collectionFolders(input: Pick<CollectionInput, "folder" | "folders">): string[] {
  const tokens = input.folders ?? (input.folder ?? "").split(/[\t\n\f\r ]+/).filter(Boolean);
  if (!tokens.length || tokens.some((folder) => !/^\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)*$/.test(folder))) throw new Error("Collection sources must be nonempty absolute folder URLs ending in /.");
  return [...new Set(tokens)];
}
export function collectionSpec(input: CollectionInput): CollectionSpec {
  const folders = collectionFolders(input);
  const folder = folders.join(" ");
  const sort = input.sort ?? "";
  if (sort && !/^-?[a-z][a-z0-9_-]*$/.test(sort)) throw new Error("Sort by a field, optionally prefixed with -.");
  const filter = input.filter ?? "";
  if (filter && !/^[a-z][a-z0-9_-]*=[^\r\n]*$/.test(filter)) throw new Error("Filter must be an exact field=value match.");
  const rawLimit = input.limit ?? "";
  if (rawLimit && (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > MAX_COLLECTION_ITEMS)) throw new Error(`Limit must be between 1 and ${MAX_COLLECTION_ITEMS}.`);
  return { folder, folders, sort, filter, limit: rawLimit ? Number(rawLimit) : MAX_COLLECTION_ITEMS };
}
export function readCollections(source: string): SourceCollection[] {
  const result: SourceCollection[] = [];
  for (const element of descendants(parseSource(source))) {
    const folder = attribute(source, element, "data-each");
    if (folder === undefined) continue;
    for (let parent = element.parent; parent; parent = parent.parent) if (attribute(source, parent, "data-each") !== undefined) throw new Error("Nested collections are not supported.");
    const children = element.children.filter((node): node is SourceElement => node.type === "element");
    const templates = children.filter((node) => node.name === "template");
    if (!element.close || templates.length !== 1 || !templates[0].close) throw new Error("A collection needs one complete direct-child template.");
    const template = templates[0];
    for (const el of descendants([template])) {
      if ((!VOID_ELEMENTS.has(el.name) && !el.close) || source[el.tag.end - 1] !== ">") throw new Error("The collection template contains incomplete markup.");
      if (el !== template && el.name === "template") throw new Error("Nested templates are not supported in collections.");
    }
    const spec = collectionSpec({ folder, sort: attribute(source, element, "data-sort"), filter: attribute(source, element, "data-filter"), limit: attribute(source, element, "data-limit") });
    result.push({ element, template, spec });
  }
  return result;
}
/** Mirrors native route eligibility, also guarding hidden encoded route segments. */
export function validCollectionRoute(url: string, path: string): boolean {
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.split("/").some((segment) => segment.startsWith(".") || segment.startsWith("_"))) return false;
    return nativePageRoute(path) === url;
  } catch { return false; }
}
/** Stable route order breaks equal sort values; self and every selected folder index are excluded. */
export function collectionRecords(sources: Record<string, string>, routes: Record<string, string>, identity: CollectionIdentity, spec: Omit<CollectionSpec, "folders"> & { folders?: readonly string[] }, self: string): CollectionRecord[] {
  const folders = collectionFolders(spec);
  const paths = new Set<string>();
  let records = Object.entries(routes).filter(([url, path]) => {
    if (!validCollectionRoute(url, path) || path === NATIVE_NOT_FOUND_PAGE || path === self || folders.includes(url) || !folders.some((folder) => url.startsWith(folder)) || paths.has(path)) return false;
    paths.add(path);
    return true;
  }).map(([url, path]) => {
    if (sources[path] === undefined) throw new Error(`Load ${path} before baking its collection.`);
    return { path, url, fields: readPageFields(sources[path], url, identity) };
  });
  const knownRecords = records;
  if (spec.filter) {
    const at = spec.filter.indexOf("=");
    const field = spec.filter.slice(0, at);
    if (!knownCollectionField(field, knownRecords)) throw new Error(`Unknown collection field: ${field}.`);
    const value = spec.filter.slice(at + 1);
    records = records.filter((record) => ownPageField(record.fields, field) === value);
  }
  if (spec.sort) {
    const descending = spec.sort.startsWith("-");
    const field = descending ? spec.sort.slice(1) : spec.sort;
    if (!knownCollectionField(field, knownRecords)) throw new Error(`Unknown collection field: ${field}.`);
    records = records.map((record, index) => ({ record, index })).sort((a, b) => {
      const av = ownPageField(a.record.fields, field), bv = ownPageField(b.record.fields, field);
      const comparison = av < bv ? -1 : av > bv ? 1 : 0;
      return comparison ? comparison * (descending ? -1 : 1) : a.index - b.index;
    }).map(({ record }) => record);
  }
  return records.slice(0, spec.limit);
}
export function knownCollectionField(field: string, records: CollectionRecord[]): boolean {
  return fieldName.test(field) && (["title", "description", "image", "date", "url"].includes(field) || records.some((record) => Object.hasOwn(record.fields, field)));
}

export function makeGridCollection(source: string, start: number, input: CollectionInput & { template: string }): string {
  const el = [...descendants(parseSource(source))].find((item) => item.start === start);
  if (!el?.close || el.name === "template") throw new Error("Choose a complete grid in the page source.");
  const collections = readCollections(source);
  const existing = collections.find((collection) => collection.element.start === start);
  if (collections.some((collection) => collection.element.start < start && collection.element.end > start)) throw new Error("Edit the existing collection template instead of nesting a collection.");
  const spec = collectionSpec(input);
  const value = (text: string) => escapeText(text).replace(/"/g, "&quot;");
  let opening = source.slice(el.start, el.tag.end - 1);
  const attributes = ["data-each", "data-sort", "data-filter", "data-limit"].flatMap((name) => {
    const found = startTagAttribute(source, el.tag, name);
    return found ? [found] : [];
  });
  for (const found of attributes.sort((a, b) => b.start - a.start)) opening = opening.slice(0, found.start - el.start) + opening.slice(found.end - el.start);
  const tag = opening + ` data-each="${value(spec.folder)}"${spec.sort ? ` data-sort="${value(spec.sort)}"` : ""}${spec.filter ? ` data-filter="${value(spec.filter)}"` : ""}${input.limit ? ` data-limit="${spec.limit}"` : ""}>`;
  // Preserve the authoring wrapper exactly, including attributes and line endings.
  const template = existing
    ? source.slice(existing.template.start, existing.template.tag.end) + input.template + source.slice(existing.template.close!.start, existing.template.end)
    : `<template>${input.template}</template>`;
  return source.slice(0, el.start) + tag + template + source.slice(el.close.start);
}
