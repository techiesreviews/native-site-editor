import { type StartTag } from "../../shared/html-source";
import { descendants, parseSource, startTagAttributes } from "./component-model";
import { decodeHtmlEntities } from "./html-entities";

export interface CollectionIdentity { name: string }
export type PageFields = Record<string, string>;
export const collectionFieldName = /^[a-z][a-z0-9_-]*$/;
export const builtinCollectionFields = ["title", "description", "image", "date", "url"] as const;

/** Exact parsed attribute boundaries; a name inside another value is never an attribute. */
function pageAttribute(source: string, tag: StartTag, name: string): { value: string } | undefined {
  const attribute = startTagAttributes(source, tag).find((item) => item.name === name);
  if (!attribute) return undefined;
  const raw = source.slice(attribute.start, attribute.end);
  const match = /^\s+[^\s=]+(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(raw);
  return { value: match?.[1] ?? match?.[2] ?? match?.[3] ?? "" };
}
/** Reads a page as its collection record, without changing its source. */
export function readPageFields(source: string, url: string, identity: CollectionIdentity): PageFields {
  const tree = [...descendants(parseSource(source))];
  const head = tree.find((el) => el.name === "head");
  const fields: PageFields = { title: "", description: "", image: "", date: "", url };
  if (head) for (const el of descendants(head.children)) {
    if (el.name === "title") fields.title = decodeHtmlEntities(source.slice(el.tag.end, el.close?.start ?? el.tag.end));
    if (el.name !== "meta") continue;
    const name = decodeHtmlEntities((pageAttribute(source, el.tag, "name") ?? pageAttribute(source, el.tag, "property"))?.value ?? "", true);
    const value = decodeHtmlEntities(pageAttribute(source, el.tag, "content")?.value ?? "", true);
    if (name === "description") fields.description = value;
    if (name === "og:image") fields.image = value;
    if (name === "date") fields.date = value;
    if (name.startsWith("field:") && collectionFieldName.test(name.slice(6)) && !builtinCollectionFields.includes(name.slice(6) as typeof builtinCollectionFields[number])) fields[name.slice(6)] = value;
  }
  if (identity.name) for (const separator of [" | ", " · ", " — ", " - "]) {
    const suffix = separator + identity.name;
    if (fields.title.endsWith(suffix)) { fields.title = fields.title.slice(0, -suffix.length); break; }
  }
  if (!fields.title) {
    const h1 = tree.find((el) => el.name === "h1" && !inside(el, "head") && !inside(el, "template"));
    if (h1) fields.title = decodeHtmlEntities(source.slice(h1.tag.end, h1.close?.start ?? h1.tag.end).replace(/<[^>]*>/g, "")).trim();
  }
  if (!fields.date) {
    const time = tree.find((el) => el.name === "time" && pageAttribute(source, el.tag, "datetime") !== undefined && !inside(el, "template"));
    fields.date = time ? decodeHtmlEntities(pageAttribute(source, time.tag, "datetime")?.value ?? "", true) : "";
  }
  return fields;
}
function inside(el: { parent?: import("./component-model").SourceElement }, name: string): boolean {
  for (let parent = el.parent; parent; parent = parent.parent) if (parent.name === name) return true;
  return false;
}

export function ownPageField(fields: PageFields, name: string): string {
  return Object.hasOwn(fields, name) ? fields[name] : "";
}

/** One page's record in the editor's JSON, as far as collection fields read it. */
export interface PageDataRecord { [key: string]: unknown; date?: unknown }
/**
 * A page's collection fields: its own HTML fields, an authored JSON date only
 * where the page has none. Legacy JSON custom fields are ignored.
 */
export function resolvePageFields(html: PageFields, page: PageDataRecord | undefined): PageFields {
  const fields: PageFields = { ...html };
  if (typeof page?.date === "string" && !fields.date) fields.date = page.date;
  return fields;
}
