// Conservative source operations: explicit balanced HTML only, never parser repairs.
import { VOID_ELEMENTS, startTags, startTagAttribute, decodeEntity } from "../../shared/html-source";
import type { InsertPoint } from "../components/insert-controls";

export interface SourceEdit { start: number; end: number; text: string }
export interface GuardedSourceEdit extends SourceEdit { original: string; source: string }
interface SourceNode { name: string; start: number; openEnd: number; closeStart: number; end: number; children: SourceNode[]; parent?: SourceNode }
const raw = new Set(["script", "style", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext"]);
const textNodes = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em", "code", "pre", "a", "button", "option"]);
const containers = new Set(["body", "main", "section", "article", "aside", "nav", "header", "footer", "div", "form", "fieldset", "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "blockquote", "select", "optgroup"]);
const interactive = new Set(["a", "button", "input", "select", "textarea", "label", "details"]);

/** A strict tokenizer uses quoted start-tag bounds; comments never become nodes. */
function tree(source: string): SourceNode | undefined {
  const root: SourceNode = { name: "", start: 0, openEnd: 0, closeStart: source.length, end: source.length, children: [] };
  const stack = [root];
  let at = 0;
  while (at < source.length) {
    const parent = stack[stack.length - 1];
    const lt = source.indexOf("<", at);
    if (lt < 0) break;
    if (raw.has(parent.name)) {
      const close = new RegExp(`</${parent.name}\\s*>`, "ig");
      close.lastIndex = at;
      const match = close.exec(source);
      if (!match) return undefined;
      parent.closeStart = match.index; parent.end = match.index + match[0].length;
      stack.pop(); at = parent.end; continue;
    }
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      if (end < 0) return undefined;
      at = end + 3; continue;
    }
    const tail = source.slice(lt);
    const doctype = /^<!doctype\s+html\s*>/i.exec(tail);
    if (doctype && stack.length === 1) { at = lt + doctype[0].length; continue; }
    const close = /^<\/([a-z][\w:-]*)\s*>/i.exec(tail);
    if (close) {
      if (stack.length === 1 || parent.name !== close[1].toLowerCase()) return undefined;
      parent.closeStart = lt; parent.end = lt + close[0].length;
      stack.pop(); at = parent.end; continue;
    }
    const tag = startTags(tail)[0];
    if (!tag || tag.start !== 0 || tail[tag.end - 1] !== ">" || !/^[a-z][\w:-]*$/i.test(tag.name)) return undefined;
    // Non-void HTML self-closing syntax is ambiguous in the browser.
    if (/\/\s*>$/.test(tail.slice(0, tag.end)) && !VOID_ELEMENTS.has(tag.name)) return undefined;
    const attributes = tail.slice(tag.nameEnd, tag.end - 1).replace(/\/\s*$/, "");
    if (!/^(?:\s+[a-z_:][\w:.-]*(?:\s*=\s*(?:"[^"<>]*"|'[^'<>]*'|[^\s"'=<>`]+))?)*\s*$/i.test(attributes)) return undefined;
    const child: SourceNode = { name: tag.name, start: lt, openEnd: lt + tag.end, closeStart: lt + tag.end, end: lt + tag.end, children: [], parent };
    parent.children.push(child);
    if (!VOID_ELEMENTS.has(child.name)) stack.push(child);
    at = child.openEnd;
  }
  if (stack.length !== 1 || !semanticTree(root)) return undefined;
  // The preview removes scripts and refresh metadata before counting children.
  const visible = (node: SourceNode) => {
    node.children = node.children.filter((child) => {
      if (child.name === "script") return false;
      if (child.name !== "meta") return true;
      const tag = startTags(source.slice(child.start, child.openEnd))[0];
      const refresh = tag && startTagAttribute(source.slice(child.start, child.openEnd), tag, "http-equiv");
      return refresh?.value.toLowerCase() !== "refresh";
    });
    node.children.forEach(visible);
  };
  visible(root);
  // Body paths match native preview. Full documents must have explicit single roots.
  const html = root.children.find((node) => node.name === "html");
  if (html) {
    if (root.children.length !== 1 || html.children.some((node) => !["head", "body"].includes(node.name))) return undefined;
    const bodies = html.children.filter((node) => node.name === "body");
    if (html.children.filter((node) => node.name === "head").length > 1 || html.children[html.children.length - 1]?.name !== "body" || bodies.length !== 1) return undefined;
    return bodies[0];
  }
  if (root.children.some((node) => ["head", "body"].includes(node.name))) return undefined;
  return root;
}
function atPath(root: SourceNode, path: readonly number[]) {
  let node: SourceNode | undefined = root;
  for (const step of path) {
    if (!Number.isInteger(step) || step < 0) return undefined;
    node = node?.children[step];
  }
  return node;
}
function all(node: SourceNode): SourceNode[] { return [node, ...node.children.flatMap(all)]; }
function canContain(parent: SourceNode, children: SourceNode[]) {
  if (!containers.has(parent.name) || raw.has(parent.name) || textNodes.has(parent.name)) return false;
  const names = children.map((child) => child.name);
  const descendants = children.flatMap(all);
  for (let ancestor: SourceNode | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "form" && descendants.some((node) => node.name === "form")) return false;
    if (["a", "button"].includes(ancestor.name) && descendants.some((node) => interactive.has(node.name))) return false;
    if (ancestor.name === "label" && descendants.some((node) => node.name === "label")) return false;
  }
  if (parent.name === "ul" || parent.name === "ol") return names.every((name) => name === "li");
  if (parent.name === "dl") return names.every((name) => name === "dt" || name === "dd");
  if (["select", "optgroup"].includes(parent.name)) return names.every((name) => name === "option" || parent.name === "select" && name === "optgroup");
  return !names.some((name) => ["html", "head", "body", "title", "meta", "link", "base", "li", "dt", "dd", "option", "optgroup", "tr", "td", "th", "tbody", "thead", "tfoot"].includes(name));
}
const phrasing = new Set(["strong", "em", "span", "br", "code", "small", "b", "i", "u", "a", "img", "mark", "time", "s", "sub", "sup", "wbr", "abbr", "cite", "q", "kbd"]);
function semanticTree(root: SourceNode) {
  return all(root).every((node) => {
    if (["svg", "math", "template", "noscript", "plaintext", "xmp", "noembed", "noframes"].includes(node.name)) return false;
    if (node.name === "table" && node.children.some((child) => !["caption", "colgroup", "thead", "tbody", "tfoot"].includes(child.name))) return false;
    if (["thead", "tbody", "tfoot"].includes(node.name) && node.children.some((child) => child.name !== "tr")) return false;
    if (node.name === "tr" && (node.children.some((child) => !["td", "th"].includes(child.name)) || !["thead", "tbody", "tfoot"].includes(node.parent?.name ?? ""))) return false;
    if (["td", "th"].includes(node.name) && node.parent?.name !== "tr") return false;
    if (node.name === "li" && node.parent?.name && !["ul", "ol"].includes(node.parent.name)) return false;
    if (node.name === "option" && node.children.length) return false;
    if (node.name === "button" && node.children.some((child) => !phrasing.has(child.name))) return false;
    if (textNodes.has(node.name) && !["pre", "button", "option"].includes(node.name) && node.children.some((child) => !phrasing.has(child.name))) return false;
    if (["ul", "ol"].includes(node.name) && node.children.some((child) => child.name !== "li")) return false;
    if (node.name === "dl" && node.children.some((child) => !["dt", "dd"].includes(child.name))) return false;
    if (["select", "optgroup"].includes(node.name) && node.children.some((child) => child.name !== "option" && !(node.name === "select" && child.name === "optgroup"))) return false;
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
      if (node.name === "form" && ancestor.name === "form") return false;
      if (interactive.has(node.name) && ["a", "button"].includes(ancestor.name)) return false;
      if (node.name === "label" && ancestor.name === "label") return false;
    }
    return true;
  });
}
function validFragment(root: SourceNode, source: string) {
  if (startTags(source).some((tag) => ["script", "style", "meta", "link", "base", "html", "head", "body"].includes(tag.name))) return false;
  if (all(root).some((node) => {
    const tag = source.slice(node.start, node.openEnd);
    if (/\s+on[\w-]+\s*=/i.test(tag)) return true;
    const parsed = startTags(tag)[0];
    if (parsed) {
      for (const attribute of ["href", "src", "action", "formaction"]) {
        const value = startTagAttribute(tag, parsed, attribute)?.value;
        if (!value) continue;
        const decoded = value.replace(/&(?:#\d+|#[xX][0-9a-f]+|[a-z]+);/gi, (entity) => decodeEntity(entity, 0)?.text ?? entity).replace(/[\u0000-\u0020\u007f]/g, "");
        if (/^(?:javascript|vbscript|data):/i.test(decoded)) return true;
      }
      if (node.name === "iframe" && (!startTagAttribute(tag, parsed, "sandbox") || startTagAttribute(tag, parsed, "srcdoc"))) return true;
    }
    if (node.name === "form" && (!/\saction\s*=/i.test(tag) || !/\smethod\s*=\s*["']?(?:get|post)["']?(?=[\s>])/i.test(tag))) return true;
    return false;
  })) return false;
  return all(root).every((node) => !["script", "style", "html", "head", "body", "meta", "link", "base"].includes(node.name) && !node.name.includes("-"));
}
export type NativePlacement = "before" | "after" | "inside";
export interface NativeDestination { point: InsertPoint; description: string; placement: NativePlacement; selection: number[] }
/** Geometry is supplied by the host; these are source destinations, not canvas gaps. */
export function nativeDestinations(source: string, path: string, selection: readonly number[]): NativeDestination[] {
  const root = tree(source);
  const selected = root && atPath(root, selection);
  if (!selected || !selection.length) return [];
  const make = (parent: SourceNode, parentPath: number[], index: number, placement: NativePlacement): NativeDestination => ({
    point: { path, parent: parentPath, index, top: 0, left: 0, width: 0, before: parent.children[index]?.name ?? "", tag: parent.name },
    description: placement === "inside" ? `Inside ${selected.name}, at the end` : `${placement === "before" ? "Before" : "After"} ${selected.name}, inside ${parent.name || "page"}`,
    placement, selection: [...selection],
  });
  const destinations: NativeDestination[] = [];
  const parent = selected.parent;
  if (parent && containers.has(parent.name)) {
    const index = selection[selection.length - 1];
    destinations.push(make(parent, selection.slice(0, -1), index, "before"), make(parent, selection.slice(0, -1), index + 1, "after"));
  }
  if (containers.has(selected.name) && !textNodes.has(selected.name)) destinations.push(make(selected, [...selection], selected.children.length, "inside"));
  return destinations;
}
function insertion(source: string, parent: SourceNode, index: number, markup: string): SourceEdit {
  const next = parent.children[index];
  const previous = parent.children[index - 1];
  const anchor = next ?? previous ?? parent;
  const line = source.lastIndexOf("\n", anchor.start - 1) + 1;
  const lead = source.slice(line, anchor.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const nl = source.includes("\r\n") ? "\r\n" : "\n";
  const childIndent = !next && !previous ? `${indent}  ` : indent;
  const text = markup.replace(/\r\n?|\n/g, `${nl}${childIndent}`);
  if (next) return { start: next.start, end: next.start, text: `${text}${nl}${indent}` };
  if (previous) return { start: previous.end, end: previous.end, text: `${nl}${indent}${text}` };
  // Insert without deleting a single comment, text character, or whitespace.
  return { start: parent.closeStart, end: parent.closeStart, text: `${nl}${childIndent}${text}${nl}${indent}` };
}
/** A distinct markup API. The component nativeInsertEdit contract is unchanged. */
export function nativeMarkupInsertEdit(source: string, parentPath: readonly number[], index: number, markup: string): GuardedSourceEdit | undefined {
  const root = tree(source);
  const fragment = tree(markup);
  const parent = root && atPath(root, parentPath);
  if (!parent || !fragment || fragment.name || !fragment.children.length || !validFragment(fragment, markup) || !Number.isInteger(index) || index < 0 || index > parent.children.length || !canContain(parent, fragment.children)) return undefined;
  const edit = insertion(source, parent, index, markup);
  return { ...edit, original: source.slice(edit.start, edit.end), source };
}
/** One replacement, guarded against stale source; removal never takes neighbours. */
export function nativeMoveEdit(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">): GuardedSourceEdit | undefined {
  const root = tree(source);
  const moving = root && atPath(root, from);
  const parent = root && atPath(root, destination.parent);
  if (!moving || !from.length || !parent || !Number.isInteger(destination.index) || destination.index < 0 || destination.index > parent.children.length) return undefined;
  for (let node: SourceNode | undefined = parent; node; node = node.parent) if (node === moving) return undefined;
  if (!canContain(parent, [moving])) return undefined;
  const index = from[from.length - 1];
  if (moving.parent === parent && [index, index + 1].includes(destination.index)) return undefined;
  const lineStart = source.lastIndexOf("\n", moving.start - 1) + 1;
  const lead = source.slice(lineStart, moving.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const markup = source.slice(moving.start, moving.end).split(/\r?\n/).map((line, index) => index && indent && line.startsWith(indent) ? line.slice(indent.length) : line).join("\n");
  const insert = insertion(source, parent, destination.index, markup);
  const start = Math.min(moving.start, insert.start);
  const end = Math.max(moving.end, insert.end);
  const original = source.slice(start, end);
  const text = insert.start <= moving.start
    ? insert.text + source.slice(insert.start, moving.start) + source.slice(moving.end, end)
    : source.slice(start, moving.start) + source.slice(moving.end, insert.start) + insert.text;
  return { start, end, text, original, source };
}
export function applyGuardedSourceEdit(source: string, edit: GuardedSourceEdit) {
  return source === edit.source && source.slice(edit.start, edit.end) === edit.original ? source.slice(0, edit.start) + edit.text + source.slice(edit.end) : undefined;
}

/** Resolve the same before/after/inside contract used by insertion, then move once. */
export function nativeMoveToEdit(source: string, from: readonly number[], selected: readonly number[], placement: NativePlacement) {
  const destination = nativeDestinations(source, "", selected).find((item) => item.placement === placement);
  return destination ? nativeMoveEdit(source, from, destination.point) : undefined;
}
