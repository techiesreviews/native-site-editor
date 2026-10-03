import { asciiLower, startTags, startTagAttribute, type StartTag } from "../../shared/html-source";
import { attributeEdit, parseSource, type SourceNode, type RangeEdit } from "./component-model";
import { nativeElementUrlProblem } from "./native-elements";
import { decodeHtmlEntities } from "./html-entities";

export interface NativeElementField {
  property: string;
  label: string;
  kind: "text" | "url" | "choice";
  value: string;
  options?: readonly { value: string; label: string; disabled?: boolean }[];
}
export interface LocatedNativeFieldElement { tag: StartTag; expectedSource: string }
const value = (source: string, tag: StartTag, name: string) => {
  const attr = startTagAttribute(source, tag, name);
  return attr ? decodeHtmlEntities(attr.value, true) : "";
};

// Read attribute boundaries without interpreting whitespace inside quoted values.
function attributeNames(source: string, tag: StartTag): string[] | undefined {
  const names: string[] = [];
  let at = tag.nameEnd;
  while (at < tag.end - 1) {
    if (source[at] === ">") return undefined;
    while (/[\t\n\f\r /]/.test(source[at] ?? "") && at < tag.end - 1) at++;
    const from = at;
    while (at < tag.end - 1 && !/[\t\n\f\r =/>]/.test(source[at])) at++;
    if (at === from) { at++; continue; }
    if (/["'<]/.test(source.slice(from, at))) return undefined;
    names.push(asciiLower(source.slice(from, at)));
    while (/[\t\n\f\r ]/.test(source[at] ?? "")) at++;
    if (source[at] !== "=") continue;
    at++;
    while (/[\t\n\f\r ]/.test(source[at] ?? "")) at++;
    const quote = source[at];
    if (quote === '"' || quote === "'") {
      const end = source.indexOf(quote, at + 1);
      if (end < 0 || end >= tag.end) return undefined;
      at = end + 1;
    } else while (at < tag.end - 1 && !/[\t\n\f\r >]/.test(source[at])) {
      if (/["'<]/.test(source[at])) return undefined;
      at++;
    }
  }
  return names;
}

/** Capture the source snapshot with an exact parsed start tag; foreign/inert content is excluded. */
export function locateNativeFieldElement(source: string, tag: StartTag): LocatedNativeFieldElement | { error: string } {
  const actual = startTags(source).find((item) => item.start === tag.start);
  if (!actual || actual.name !== tag.name || actual.end !== tag.end || actual.nameEnd !== tag.nameEnd || source[actual.end - 1] !== ">") return { error: "That element no longer matches the source." };
  if (!attributeNames(source, actual)) return { error: "That start tag has an incomplete attribute value." };
  let blocked = false;
  let ambiguous = false;
  const visit = (nodes: SourceNode[], opaque: boolean) => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      if (["template", "noscript", "svg", "math"].includes(node.name) && !node.close) {
        const slash = node.tag.end - 2;
        const selfClosed = ["svg", "math"].includes(node.name) && source[slash] === "/" &&
          attributeNames(source, node.tag)?.every((name) => { const attr = startTagAttribute(source, node.tag, name); return !attr || attr.valueEnd <= slash; });
        if (!selfClosed) ambiguous = true;
      }
      const next = opaque || ["svg", "math", "template", "noscript"].includes(node.name);
      if (node.start === actual.start) blocked = next;
      visit(node.children, next);
    }
  };
  visit(parseSource(source), false);
  if (ambiguous) return { error: "The source has an ambiguous foreign or inert boundary. Repair it before editing fields." };
  if (blocked) return { error: "Fields are unavailable inside foreign or inert content." };
  return { tag: { ...actual }, expectedSource: source };
}

/** Values are DOM attribute values, decoded exactly once. No caption or backend edits. */
export function nativeElementFields(source: string, tag: StartTag): NativeElementField[] {
  if ("error" in locateNativeFieldElement(source, tag)) return [];
  const fields: NativeElementField[] = [];
  const add = (property: string, label: string, kind: NativeElementField["kind"] = "text") => fields.push({ property, label, kind, value: value(source, tag, property) });
  if (tag.name === "video") { add("src", "Video URL", "url"); add("poster", "Poster URL", "url"); add("title", "Title"); }
  if (tag.name === "iframe") { add("src", "Embed URL", "url"); add("title", "Title"); }
  if (tag.name === "form") {
    add("action", "Action URL", "url");
    const current = value(source, tag, "method");
    const options: { value: string; label: string; disabled?: boolean }[] = [{ value: "", label: "Default (GET)" }, ...["get", "post", "dialog"].map((item) => ({ value: item, label: item === "dialog" ? "dialog" : item.toUpperCase() }))];
    const canonical = asciiLower(current);
    if (current && !options.some((item) => item.value === canonical)) options.push({ value: current, label: `Current: ${current}`, disabled: true });
    fields.push({ property: "method", label: "Method", kind: "choice", value: options.some((item) => item.value === canonical) ? canonical : current, options });
  }
  if (["input", "textarea", "select", "button"].includes(tag.name)) { add("name", "Name"); add("aria-label", "Accessible label"); }
  const type = asciiLower(value(source, tag, "type"));
  if ((tag.name === "input" && ["submit", "image"].includes(type)) || (tag.name === "button" && !["button", "reset"].includes(type))) add("formaction", "Submit action URL", "url");
  return fields;
}

function urlProblem(raw: string, name: string, tag: StartTag) {
  const allowed = ["http", "https"];
  if (tag.name === "iframe" && name === "src") allowed.push("about:blank");
  if (["action", "formaction"].includes(name)) allowed.push("mailto", "tel");
  return nativeElementUrlProblem(raw, allowed, false);
}

/** One guarded start-tag replacement. Validate every field before returning any edits. */
export function nativeElementAttributeEdits(source: string, located: LocatedNativeFieldElement, patch: Readonly<Record<string, string | null>>): { edits: RangeEdit[]; expectedSource: string } | { error: string } {
  if (source !== located.expectedSource) return { error: "The source changed. Select the element again." };
  const verified = locateNativeFieldElement(source, located.tag);
  if ("error" in verified) return verified;
  const fields = nativeElementFields(source, verified.tag);
  for (const [name, next] of Object.entries(patch)) {
    const field = fields.find((item) => item.property === name);
    if (attributeNames(source, verified.tag)!.filter((item) => item === name).length > 1) return { error: `${name}: remove duplicate attributes in Code first.` };
    if (!field) return { error: `That element does not support ${name}.` };
    if (next === null) continue;
    if (typeof next !== "string") return { error: `${field.label}: use a text value.` };
    if (field.kind === "choice" && !["", "get", "post", "dialog"].includes(asciiLower(next))) return { error: `${field.label}: choose GET, POST, or dialog.` };
    if (field.kind === "url") { const problem = urlProblem(next, name, verified.tag); if (problem) return { error: `${field.label}: ${problem}` }; }
  }
  let open = source.slice(verified.tag.start, verified.tag.end);
  for (const [name, next] of Object.entries(patch)) {
    const local = startTags(open)[0];
    const removed = next === null || (name === "method" && next === "");
    let edit = attributeEdit(open, local, name, removed ? undefined : next);
    // A slash attached to an unquoted value is part of that value, not a self-closing delimiter.
    if (!startTagAttribute(open, local, name) && !removed && open.endsWith("/>")) {
      const slash = open.length - 2;
      for (const attribute of attributeNames(open, local)!) {
        const attr = startTagAttribute(open, local, attribute);
        if (attr && attr.valueStart <= slash && attr.valueEnd > slash) edit = { ...edit, start: open.length - 1, end: open.length - 1 };
      }
    }
    open = open.slice(0, edit.start) + edit.text + open.slice(edit.end);
  }
  return { expectedSource: source, edits: open === source.slice(verified.tag.start, verified.tag.end) ? [] : [{ start: verified.tag.start, end: verified.tag.end, text: open }] };
}
