// Conservative source operations: explicit balanced HTML only, never parser repairs.
import { VOID_ELEMENTS, startTags, startTagAttribute } from "../../shared/html-source";
import { decodeHtmlEntities } from "./html-entities";
import type { InsertPoint } from "../components/insert-controls";

export interface SourceEdit { start: number; end: number; text: string }
export interface GuardedSourceEdit extends SourceEdit { original: string; source: string }
interface SourceNode { name: string; start: number; openEnd: number; closeStart: number; end: number; children: SourceNode[]; namespace?: "html" | "svg" | "math"; opaque?: boolean; interactive?: boolean; parent?: SourceNode }
const raw = new Set(["script", "style", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext", "noscript"]);
const textNodes = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em", "code", "pre", "a", "button", "option"]);
const containers = new Set(["body", "main", "section", "article", "aside", "nav", "header", "footer", "div", "form", "fieldset", "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "blockquote", "select", "optgroup"]);
const interactive = new Set(["a", "button", "input", "select", "textarea", "label", "details"]);

// Only actual HTML names; editor catalogue keys and foreign/custom names are not HTML.
const htmlNames = new Set("a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr".split(" "));
const foreignBreakouts = new Set("b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var".split(" "));
const reservedCustom = new Set("annotation-xml color-profile font-face font-face-src font-face-uri font-face-format font-face-name missing-glyph".split(" "));
const customName = (name: string) => /^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(name) && !reservedCustom.has(name);
function namespaceFor(parent: SourceNode, name: string, source: string): "html" | "svg" | "math" {
  let namespace = parent.namespace ?? "html";
  if (namespace === "svg" && ["foreignobject", "desc", "title"].includes(parent.name)) namespace = "html";
  if (namespace === "math" && ["mi", "mo", "mn", "ms", "mtext"].includes(parent.name) && !["mglyph", "malignmark"].includes(name)) namespace = "html";
  if (namespace === "math" && parent.name === "annotation-xml") {
    const text = source.slice(parent.start, parent.openEnd), tag = startTags(text)[0];
    const encoding = tag && startTagAttribute(text, tag, "encoding");
    if (encoding && /^(?:text\/html|application\/xhtml\+xml)$/i.test(decodeHtmlEntities(encoding.value, true))) namespace = "html";
  }
  return namespace === "html" && (name === "svg" || name === "math") ? name : namespace;
}
/** Read attribute states before interpreting a trailing slash as syntax. */
function startTagTail(text: string): { selfClosing: boolean } | undefined {
  let at = 0;
  while (at < text.length) {
    const before = at;
    while (/[\t\n\f\r ]/.test(text[at] ?? "") && at < text.length) at++;
    if (at === text.length) return { selfClosing: false };
    if (text[at] === "/") return at === text.length - 1 ? { selfClosing: true } : undefined;
    if (at === before) return;
    const name = /^[a-z_:][\w:.-]*/i.exec(text.slice(at));
    if (!name) return;
    at += name[0].length;
    const afterName = at;
    while (/[\t\n\f\r ]/.test(text[at] ?? "") && at < text.length) at++;
    if (text[at] !== "=") { at = afterName; continue; }
    at++;
    while (/[\t\n\f\r ]/.test(text[at] ?? "") && at < text.length) at++;
    if (text[at] === '"' || text[at] === "'") {
      const quote = text[at++], end = text.indexOf(quote, at);
      if (end < 0 || /[<>]/.test(text.slice(at, end))) return;
      at = end + 1;
    } else {
      const value = /^[^\t\n\f\r "'=<>`]+/.exec(text.slice(at));
      if (!value) return;
      // In an unquoted value, `/` is a value character, including just before `>`.
      at += value[0].length;
    }
  }
  return { selfClosing: false };
}
/** A strict tokenizer uses quoted start-tag bounds; comments never become nodes. */
function tree(source: string): SourceNode | undefined {
  const root: SourceNode = { name: "", start: 0, openEnd: 0, closeStart: source.length, end: source.length, children: [] };
  const stack = [root];
  let at = 0;
  while (at < source.length) {
    const parent = stack[stack.length - 1];
    const lt = source.indexOf("<", at);
    if (lt < 0) break;
    if ((parent.namespace ?? "html") === "html" && raw.has(parent.name)) {
      const close = new RegExp(`</${parent.name}(?=[\\t\\n\\f\\r />])`, "ig");
      close.lastIndex = at;
      const match = close.exec(source);
      if (!match) return undefined;
      const closing = new RegExp(`^</${parent.name}[\\t\\n\\f\\r ]*>`, "i").exec(source.slice(match.index));
      if (!closing) return undefined;
      parent.closeStart = match.index; parent.end = match.index + closing[0].length;
      stack.pop(); at = parent.end; continue;
    }
    if (source.startsWith("<!--", lt)) {
      // Browsers abruptly close these empty comments; do not swallow following nodes.
      if (source.startsWith("<!-->", lt) || source.startsWith("<!--->", lt)) return undefined;
      const end = source.indexOf("-->", lt + 4);
      if (end < 0) return undefined;
      const bangEnd = source.indexOf("--!>", lt + 4);
      const nested = source.indexOf("<!--", lt + 4);
      // Alternate endings can expose nodes before our canonical end; nested
      // comment syntax is outside this conservative tokenizer's bounds.
      if (bangEnd >= 0 && bangEnd < end || nested >= 0 && nested < end) return undefined;
      at = end + 3; continue;
    }
    const tail = source.slice(lt);
    const doctype = /^<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/i.exec(tail);
    if (doctype && stack.length === 1) { at = lt + doctype[0].length; continue; }
    const close = /^<\/([a-z][\w:-]*)[\t\n\f\r ]*>/i.exec(tail);
    if (close) {
      if (stack.length === 1 || parent.name !== close[1].toLowerCase()) return undefined;
      parent.closeStart = lt; parent.end = lt + close[0].length;
      stack.pop(); at = parent.end; continue;
    }
    const tag = startTags(tail)[0];
    if (!tag || tag.start !== 0 || tail[tag.end - 1] !== ">" || !/^[a-z][\w:-]*$/i.test(tag.name)) return undefined;
    // Shared scanners may split names on JS whitespace; HTML recognizes only ASCII spaces.
    if (!/[\t\n\f\r />]/.test(tail[tag.nameEnd] ?? "")) return undefined;
    const namespace = namespaceFor(parent, tag.name, source);
    if (namespace === "html" && !htmlNames.has(tag.name) && !["svg", "math"].includes(tag.name) && !customName(tag.name)) return undefined;
    // HTML breakouts escape a foreign island and change the page's child paths.
    if (namespace !== "html" && (foreignBreakouts.has(tag.name) || tag.name === "font" && ["color", "face", "size"].some(name => !!startTagAttribute(tail, tag, name)))) return undefined;
    const parsedTail = startTagTail(tail.slice(tag.nameEnd, tag.end - 1));
    if (!parsedTail) return undefined;
    const { selfClosing } = parsedTail;
    if (namespace === "html" && selfClosing && !VOID_ELEMENTS.has(tag.name)) return undefined;
    const child: SourceNode = { namespace, opaque: namespace !== "html" || customName(tag.name) || ["template", "noscript", "xmp", "noembed", "noframes"].includes(tag.name), name: tag.name, start: lt, openEnd: lt + tag.end, closeStart: lt + tag.end, end: lt + tag.end, children: [], interactive: interactive.has(tag.name) || ["audio", "video"].includes(tag.name) && !!startTagAttribute(tail, tag, "controls"), parent };
    parent.children.push(child);
    if (!(namespace === "html" ? VOID_ELEMENTS.has(child.name) : selfClosing)) stack.push(child);
    at = child.openEnd;
  }
  if (stack.length !== 1 || !semanticTree(root, source)) return undefined;
  // The preview removes scripts and refresh metadata before counting children.
  const visible = (node: SourceNode) => {
    node.children = node.children.filter((child) => {
      if (child.name === "script") return false;
      if (child.name !== "meta") return true;
      const tag = startTags(source.slice(child.start, child.openEnd))[0];
      const refresh = tag && startTagAttribute(source.slice(child.start, child.openEnd), tag, "http-equiv");
      return (refresh && decodeHtmlEntities(refresh.value, true).toLowerCase()) !== "refresh";
    });
    // Template content is a separate DocumentFragment, absent from element.children.
    if (node.name === "template" && (node.namespace ?? "html") === "html") node.children = [];
    else node.children.forEach(visible);
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
    if (node?.opaque) return undefined;
    node = node?.children[step];
  }
  return node;
}
function all(node: SourceNode): SourceNode[] { return [node, ...node.children.flatMap(all)]; }
// Template content and foreign trees have their own outer phrasing scope.
function scopedDescendants(node: SourceNode): SourceNode[] {
  if (node.name === "template" || (node.namespace ?? "html") !== "html") return [node];
  return [node, ...node.children.flatMap(scopedDescendants)];
}
const isPhrasing = (node: SourceNode) => (node.namespace ?? "html") !== "html" || phrasing.has(node.name) || customName(node.name) || ["svg", "math", "template"].includes(node.name);
function canContain(parent: SourceNode, children: SourceNode[]) {
  if (parent.opaque || !containers.has(parent.name) || raw.has(parent.name) || textNodes.has(parent.name)) return false;
  const names = children.map((child) => child.name);
  const movingDescendants = (node: SourceNode): SourceNode[] => [node, ...(node.name === "template" && (node.namespace ?? "html") === "html" ? [] : node.children.flatMap(movingDescendants))];
  const descendants = children.flatMap(movingDescendants);
  const definitionItems = (node: SourceNode): boolean => {
    if (node.name === "dl" || node.name === "template" || (node.namespace ?? "html") !== "html") return false;
    return ["dt", "dd"].includes(node.name) || node.children.some(definitionItems);
  };
  for (let ancestor: SourceNode | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "dl" || ancestor.name === "template" || (ancestor.namespace ?? "html") !== "html") break;
    if (["dt", "dd"].includes(ancestor.name) && children.some(definitionItems)) return false;
  }
  for (let ancestor: SourceNode | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "form" && descendants.some((node) => node.name === "form")) return false;
    if (["a", "button"].includes(ancestor.name) && descendants.some((node) => node.interactive)) return false;
    if (ancestor.name === "label" && descendants.some((node) => node.name === "label")) return false;
  }
  if (parent.name === "ul" || parent.name === "ol") return names.every((name) => name === "li");
  if (parent.name === "dl") return names.every((name) => name === "dt" || name === "dd");
  if (["select", "optgroup"].includes(parent.name)) return names.every((name) => name === "option" || parent.name === "select" && name === "optgroup");
  return !names.some((name) => ["html", "head", "body", "title", "meta", "link", "base", "li", "dt", "dd", "option", "optgroup", "caption", "colgroup", "col", "tr", "td", "th", "tbody", "thead", "tfoot"].includes(name));
}
const phrasing = new Set(["strong", "em", "span", "br", "code", "small", "b", "i", "u", "a", "img", "mark", "time", "s", "sub", "sup", "wbr", "abbr", "cite", "q", "kbd"]);
function semanticTree(root: SourceNode, source: string) {
  return all(root).every((node) => {
    if (node.name === "plaintext") return false;
    if (node.name === "html" && node.parent !== root) return false;
    if (["head", "body"].includes(node.name) && node.parent?.name !== "html") return false;
    if ((node.namespace ?? "html") !== "html") return true;
    if (["caption", "colgroup", "thead", "tbody", "tfoot"].includes(node.name) && node.parent?.name !== "table") return false;
    if (node.name === "col" && node.parent?.name !== "colgroup") return false;
    if (node.name === "colgroup") {
      if (node.children.some((child) => child.name !== "col")) return false;
      // HTML closes colgroup on non-space character tokens (including entities).
      let at = node.openEnd;
      for (const child of [...node.children, { start: node.closeStart, end: node.closeStart }]) {
        const text = source.slice(at, child.start).replace(/<!--[\s\S]*?-->/g, "");
        if (/[^\t\n\f\r ]/.test(decodeHtmlEntities(text))) return false;
        at = child.end;
      }
    }
    if (["rt", "rp", "rb", "rtc"].includes(node.name)) {
      // Ruby annotation start tags can close earlier annotations in this scope.
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.name === "ruby" || ancestor.name === "template" || (ancestor.namespace ?? "html") !== "html") break;
        if (["rt", "rp", "rb", "rtc"].includes(ancestor.name)) return false;
      }
    }
    if (node.name === "table" && node.children.some((child) => !["caption", "colgroup", "thead", "tbody", "tfoot"].includes(child.name))) return false;
    if (["thead", "tbody", "tfoot"].includes(node.name) && node.children.some((child) => child.name !== "tr")) return false;
    if (node.name === "tr" && (node.children.some((child) => !["td", "th"].includes(child.name)) || !["thead", "tbody", "tfoot"].includes(node.parent?.name ?? ""))) return false;
    if (["td", "th"].includes(node.name) && node.parent?.name !== "tr") return false;
    if (node.name === "li" && node.parent?.name && !["ul", "ol", "template"].includes(node.parent.name)) return false;
    if (node.name === "option" && node.children.length) return false;
    if (node.name === "button" && node.children.flatMap(scopedDescendants).some((child) => !isPhrasing(child))) return false;
    if (textNodes.has(node.name) && !["pre", "button", "option"].includes(node.name) && node.children.flatMap(scopedDescendants).some((child) => !isPhrasing(child))) return false;
    if (["ul", "ol"].includes(node.name) && node.children.some((child) => !["li", "template", "script"].includes(child.name))) return false;
    if (["dt", "dd"].includes(node.name)) {
      // A new definition item closes an earlier item in the same list scope.
      // A nested dl establishes its own scope and remains valid.
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.name === "dl" || ancestor.name === "template" || (ancestor.namespace ?? "html") !== "html") break;
        if (["dt", "dd"].includes(ancestor.name)) return false;
      }
    }
    if (node.name === "dl" && node.children.some((child) => !["dt", "dd"].includes(child.name))) return false;
    if (["select", "optgroup"].includes(node.name) && node.children.some((child) => child.name !== "option" && !(node.name === "select" && child.name === "optgroup"))) return false;
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
      if (ancestor.name === "template" && (ancestor.namespace ?? "html") === "html") break;
      if (node.name === "form" && ancestor.name === "form") return false;
      if (node.interactive && ["a", "button"].includes(ancestor.name)) return false;
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
      for (const attribute of ["href", "src", "action", "formaction", "poster", "cite", "data", "background", "longdesc", "manifest", "usemap"]) {
        const value = startTagAttribute(tag, parsed, attribute)?.value;
        if (!value) continue;
        const decoded = decodeHtmlEntities(value, true).replace(/[\u0000-\u0020\u007f]/g, "");
        if (/^(?:javascript|vbscript|data):/i.test(decoded)) return true;
      }
      // URL lists require a separate candidate parser; fail closed rather than guess.
      if (["srcset", "imagesrcset", "ping", "archive"].some((attribute) => startTagAttribute(tag, parsed, attribute))) return true;
      if (node.name === "iframe" && (!startTagAttribute(tag, parsed, "sandbox") || startTagAttribute(tag, parsed, "srcdoc"))) return true;
    }
    if (node.name === "form" && (!parsed || !startTagAttribute(tag, parsed, "action") || !/^(?:get|post)$/i.test(decodeHtmlEntities(startTagAttribute(tag, parsed, "method")?.value ?? "", true)))) return true;
    return false;
  })) return false;
  return all(root).every((node) => !["script", "style", "html", "head", "body", "meta", "link", "base"].includes(node.name) && !node.opaque && !node.name.includes("-"));
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
  if (!selected.opaque && containers.has(selected.name) && !textNodes.has(selected.name)) destinations.push(make(selected, [...selection], selected.children.length, "inside"));
  return destinations;
}
/** Preserve all content bytes in whitespace-sensitive elements, including line endings. */
function structuralIndent(markup: string, newline: string, indent: string, remove = "") {
  const protectedRanges: [number, number][] = [];
  const parsed = tree(markup);
  if (parsed) for (const node of all(parsed)) if (node.opaque) protectedRanges.push([node.start, node.end]);
  for (const tag of startTags(markup)) {
    if (!raw.has(tag.name) && tag.name !== "pre") continue;
    const close = new RegExp(`</${tag.name}[\\t\\n\\f\\r ]*>`, "ig");
    close.lastIndex = tag.end;
    const match = close.exec(markup);
    if (match) protectedRanges.push([tag.end, match.index]);
  }
  return markup.replace(/(\r\n?|\n)([ \t]*)/g, (match, _linebreak: string, spaces: string, offset: number) => {
    if (protectedRanges.some(([start, end]) => offset >= start && offset < end)) return match;
    return `${newline}${indent}${remove && spaces.startsWith(remove) ? spaces.slice(remove.length) : spaces}`;
  });
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
  const text = structuralIndent(markup, nl, childIndent);
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
function moveDestination(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">) {
  const root = tree(source);
  const moving = root && atPath(root, from);
  const parent = root && atPath(root, destination.parent);
  if (!moving || moving.opaque || !from.length || !parent || !Number.isInteger(destination.index) || destination.index < 0 || destination.index > parent.children.length) return undefined;
  for (let node: SourceNode | undefined = parent; node; node = node.parent) if (node === moving) return undefined;
  if (!canContain(parent, [moving])) return undefined;
  return { moving, parent };
}

/** Validate a move destination, including legitimate same-parent no-op positions. */
export function nativeMoveDestinationValid(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">): boolean {
  return Boolean(moveDestination(source, from, destination));
}

/** One replacement, guarded against stale source; removal never takes neighbours. */
export function nativeMoveEdit(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">): GuardedSourceEdit | undefined {
  const valid = moveDestination(source, from, destination);
  if (!valid) return undefined;
  const { moving, parent } = valid;
  const index = from[from.length - 1];
  if (moving.parent === parent && [index, index + 1].includes(destination.index)) return undefined;
  const lineStart = source.lastIndexOf("\n", moving.start - 1) + 1;
  const lead = source.slice(lineStart, moving.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const markup = structuralIndent(source.slice(moving.start, moving.end), source.includes("\r\n") ? "\r\n" : "\n", "", indent);
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
