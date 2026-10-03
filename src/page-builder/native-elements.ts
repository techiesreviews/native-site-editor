// Static, portable HTML. Keys identify editor choices, never published attributes.
import { decodeHtmlEntities } from "./html-entities";
import type { AddChoice } from "./add-catalog";

export type NativeElementKind = "heading" | "text" | "image" | "link-button" | "list" | "columns" | "grid" | "video" | "embed" | "divider" | "form" | "input" | "textarea" | "select" | "checkbox" | "submit";
export interface NativeElementOptions {
  text?: string;
  className?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  src?: string;
  href?: string;
  alt?: string;
  title?: string;
  items?: readonly string[];
  action?: string;
  method?: "get" | "post";
  name?: string;
  label?: string;
  type?: "text" | "email" | "tel" | "number" | "date";
}
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
function url(value: string) {
  const decoded = decodeHtmlEntities(value, true);
  const normalized = decoded.replace(/[\u0000-\u0020\u007f]/g, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^(?:https?:|mailto:|tel:|about:blank$)/i.test(normalized)) throw new Error("Use a relative URL or an HTTP(S) URL.");
  return escape(decoded);
}
export const nativeElementChoices: readonly AddChoice[] = [
  ["heading", "Heading", "Elements"], ["text", "Text", "Elements"], ["image", "Image", "Elements"],
  ["link-button", "Link button", "Elements"], ["list", "List", "Elements"], ["video", "Video", "Elements"],
  ["embed", "Iframe embed", "Elements"], ["divider", "Divider", "Elements"],
  ["columns", "Columns", "Layout"], ["grid", "Grid", "Layout"],
  ["form", "Form", "Forms"], ["input", "Input field", "Forms"], ["textarea", "Text area", "Forms"],
  ["select", "Select field", "Forms"], ["checkbox", "Checkbox", "Forms"], ["submit", "Submit button", "Forms"],
].map(([kind, label, group]) => ({ tag: `native:${kind}`, label, group, kind: "native" }));

/** No generated CSS/classes, backend, runtime, or editor metadata. */
export function nativeElementMarkup(kind: NativeElementKind, options: NativeElementOptions = {}): string {
  const text = escape(options.text ?? (kind === "heading" ? "Heading" : "Text"));
  const cls = options.className ? ` class="${escape(options.className)}"` : "";
  const name = escape(options.name ?? "field");
  const label = escape(options.label ?? "Label");
  switch (kind) {
    case "heading": {
      const level = options.level ?? 2;
      if (![1, 2, 3, 4, 5, 6].includes(level)) throw new Error("Invalid heading level.");
      return `<h${level}${cls}>${text}</h${level}>`;
    }
    case "text": return `<p${cls}>${text}</p>`;
    case "image": return `<img${cls} src="${url(options.src ?? "image.jpg")}" alt="${escape(options.alt ?? "")}">`;
    case "link-button": return `<a${cls} href="${url(options.href ?? "#")}">${escape(options.text ?? "Learn more")}</a>`;
    case "list": return `<ul${cls}>\n${(options.items ?? ["First item", "Second item"]).map((item) => `  <li>${escape(item)}</li>`).join("\n")}\n</ul>`;
    case "columns": return `<div${cls} style="display: flex; flex-wrap: wrap; gap: 1rem">\n  <div style="flex: 1 1 16rem"><p>First column</p></div>\n  <div style="flex: 1 1 16rem"><p>Second column</p></div>\n</div>`;
    case "grid": return `<div${cls} style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem">\n  <div><p>First item</p></div>\n  <div><p>Second item</p></div>\n</div>`;
    case "video": return `<video${cls} controls src="${url(options.src ?? "video.mp4")}"></video>`;
    case "embed": return `<iframe${cls} src="${url(options.src ?? "about:blank")}" title="${escape(options.title ?? "Embedded content")}" sandbox="" loading="lazy"></iframe>`;
    case "divider": return `<hr${cls}>`;
    case "form": return `<form${cls} action="${url(options.action ?? "")}" method="${options.method === "get" ? "get" : "post"}">\n  <label>${label} <input type="text" name="${name}"></label>\n  <button type="submit">Submit</button>\n</form>`;
    case "input": {
      const type = options.type ?? "text";
      if (!["text", "email", "tel", "number", "date"].includes(type)) throw new Error("Invalid input type.");
      return `<label${cls}>${label} <input type="${type}" name="${name}"></label>`;
    }
    case "textarea": return `<label${cls}>${label} <textarea name="${name}">${escape(options.text ?? "")}</textarea></label>`;
    case "select": return `<label${cls}>${label} <select name="${name}">${(options.items ?? ["Choose an option"]).map((item) => `<option>${escape(item)}</option>`).join("")}</select></label>`;
    case "checkbox": return `<label${cls}><input type="checkbox" name="${name}"> ${label}</label>`;
    case "submit": return `<button${cls} type="submit">${escape(options.text ?? "Submit")}</button>`;
    default: throw new Error("Unknown native element.");
  }
}
export function nativeChoiceMarkup(key: string, options?: NativeElementOptions) {
  const choice = nativeElementChoices.find((item) => item.tag === key);
  return choice ? nativeElementMarkup(key.slice(7) as NativeElementKind, options) : undefined;
}
