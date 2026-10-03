import { type StartTag } from "../../shared/html-source";
import { descendants, parseSource, startTagAttributes } from "./component-model";
import { decodeHtmlEntities } from "./html-entities";
import { escapeText, headTags, upsertHeadTag, withAttribute } from "./site-head";

export interface CollectionIdentity { name: string }
export type PageFields = Record<string, string>;
export const fieldName = /^[a-z][a-z0-9_-]*$/;
export const builtinFields = ["title", "description", "image", "date", "url"] as const;

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
    if (name.startsWith("field:") && fieldName.test(name.slice(6)) && !builtinFields.includes(name.slice(6) as typeof builtinFields[number])) fields[name.slice(6)] = value;
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

/** Updates metadata in place. URL is owned by page navigation, never a metadata field. */
export function withPageField(source: string, field: string, value: string, identity: CollectionIdentity): string {
  if (!fieldName.test(field) || field === "url") throw new Error("Choose a valid editable page field.");
  if (field === "title") return upsertHeadTag(source, "title", value && identity.name ? `${value} | ${identity.name}` : value);
  if (field === "description") return upsertHeadTag(source, "description", value);
  if (field === "image") return upsertHeadTag(source, "og:image", value);
  const { tags, end } = headTags(source);
  const name = field === "date" ? "date" : `field:${field}`;
  const matches = tags.filter((tag) => tag.name === "meta" && decodeHtmlEntities(pageAttribute(source, tag, "name")?.value ?? "", true) === name);
  if (matches.length) {
    for (const tag of matches.reverse()) source = withAttribute(source, tag, "content", value);
    return source;
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const escaped = escapeText(value).replace(/"/g, "&quot;");
  return source.slice(0, end) + `  <meta name="${name}" content="${escaped}">${newline}` + source.slice(end);
}

/** The custom-field entry point must never reinterpret a reserved built-in name. */
export function withCustomPageField(source: string, field: string, value: string, identity: CollectionIdentity): string {
  if (builtinFields.includes(field as typeof builtinFields[number])) throw new Error(`${field} is a built-in field. Edit its own control above.`);
  return withPageField(source, field, value, identity);
}
export function ownPageField(fields: PageFields, name: string): string {
  return Object.hasOwn(fields, name) ? fields[name] : "";
}
