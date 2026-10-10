// Conservative source operations: explicit balanced HTML only, never parser repairs.
import { VOID_ELEMENTS, startTags, startTagAttribute } from "../../shared/html-source";
import { decodeHtmlEntities } from "./html-entities";
import { HTML_PHRASING } from "./rules/text-level";
import type { InsertPoint } from "../components/insert-controls";

export interface SourceEdit { start: number; end: number; text: string }
export interface GuardedSourceEdit extends SourceEdit { original: string; source: string }
interface SourceNode { name: string; start: number; openEnd: number; closeStart: number; end: number; children: SourceNode[]; namespace?: "html" | "svg" | "math"; opaque?: boolean; interactive?: boolean; parent?: SourceNode }
const raw = new Set(["script", "style", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext", "noscript"]);
const textNodes = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "strong", "em", "code", "pre", "a", "button", "option"]);
const containers = new Set(["body", "main", "section", "article", "aside", "nav", "header", "footer", "div", "form", "fieldset", "ul", "ol", "li", "dl", "dt", "dd", "figure", "figcaption", "blockquote", "select", "optgroup", "td", "th", "details", "dialog", "address", "search", "picture"]);
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
/**
 * Whether a component's slot (by the component's tag; "" the unnamed slot) is
 * an items slot, whose page children are page blocks (component-model.ts
 * `templateSlots`). Inserts and moves open an instance's seal there and nowhere else.
 */
export type ItemsSlotRule = (tag: string, slot: string) => boolean;
/** The slot a component's child fills: its `slot` attribute, or "" for the unnamed slot. */
function slotOf(source: string, node: SourceNode) {
  const open = source.slice(node.start, node.openEnd), tag = startTags(open)[0];
  return tag ? decodeHtmlEntities(startTagAttribute(open, tag, "slot")?.value ?? "", true) : "";
}
const isInstance = (node: SourceNode) => (node.namespace ?? "html") === "html" && customName(node.name);
/** The node at `path`; components are sealed, except (with `items`) towards a child in an items slot. */
function atPath(root: SourceNode, path: readonly number[], open?: (instance: SourceNode, child: SourceNode) => boolean) {
  let node: SourceNode | undefined = root;
  for (const step of path) {
    if (!Number.isInteger(step) || step < 0) return undefined;
    const child: SourceNode | undefined = node?.children[step];
    if (node?.opaque && !(child && open && isInstance(node) && open(node, child))) return undefined;
    node = child;
  }
  return node;
}
/** `markup` with `slot="…"` on the start tag of its element `node`. */
function withSlot(markup: string, node: SourceNode, slot: string) {
  const at = node.start + 1 + node.name.length;
  return `${markup.slice(0, at)} slot="${slot.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"${markup.slice(at)}`;
}
const itemsOpener = (source: string, items: ItemsSlotRule | undefined) =>
  items && ((instance: SourceNode, child: SourceNode) => items(instance.name, slotOf(source, child)));
function all(node: SourceNode): SourceNode[] { return [node, ...node.children.flatMap(all)]; }
// Template content and foreign trees have their own outer phrasing scope.
function scopedDescendants(node: SourceNode): SourceNode[] {
  if (node.name === "template" || (node.namespace ?? "html") !== "html") return [node];
  return [node, ...node.children.flatMap(scopedDescendants)];
}
const isPhrasing = (node: SourceNode) => (node.namespace ?? "html") !== "html" || HTML_PHRASING.has(node.name) || customName(node.name) || ["svg", "math", "template", "slot"].includes(node.name);
/** Whether `children` may go in `parent`; `instance`: an instance's items slot, the one opening in its seal. */
const canContain = (parent: SourceNode, children: SourceNode[], instance = false) => !contentRefusal(parent, children, instance);
// Elements whose content is text and inline elements only: a link goes in a paragraph, a Div doesn't.
const phrasingOnly = (node: SourceNode) => (node.namespace ?? "html") === "html" && !VOID_ELEMENTS.has(node.name) && !["option", "picture"].includes(node.name) && (textNodes.has(node.name) || HTML_PHRASING.has(node.name));
// Flow content with no headings, sections, headers or footers in it (an <address> no other <address> either).
const plainFlow = new Set(["address", "dt", "th"]);
const outline = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "header", "footer", "section", "article", "aside", "nav"]);
/** "A <div> can't go inside a <p>." */
const cannot = (child: string, parent: string) => {
  const an = (name: string) => /^(?:[aeio]|h\d)/.test(name) ? "an" : "a";
  return `${an(child) === "an" ? "An" : "A"} <${child}> can't go inside ${an(parent)} <${parent}>.`;
};
/** Why `children` can't go in `parent` by HTML's content rules (or the seal of an instance), or nothing when they can. */
function contentRefusal(parent: SourceNode, children: SourceNode[], instance = false): string | undefined {
  // A template's <slot> is transparent: it holds what the element around it may (at the template's top, flow content).
  if (!instance && parent.name === "slot" && (parent.namespace ?? "html") === "html") {
    let around = parent.parent;
    while (around?.name === "slot") around = around.parent;
    if (around?.name) return contentRefusal(around, children);
  } else if (instance ? !isInstance(parent) : parent.opaque || raw.has(parent.name) || !containers.has(parent.name) && !phrasingOnly(parent)) {
    return parent.opaque ? "Its parts belong to the component: open it to change them." : cannot(children[0]?.name ?? "", parent.name);
  }
  const names = children.map((child) => child.name);
  const movingDescendants = (node: SourceNode): SourceNode[] => [node, ...(node.name === "template" && (node.namespace ?? "html") === "html" ? [] : node.children.flatMap(movingDescendants))];
  const descendants = children.flatMap(movingDescendants);
  if (!instance && phrasingOnly(parent)) {
    const block = children.flatMap(scopedDescendants).find((node) => !isPhrasing(node));
    if (block) return cannot(block.name, parent.name);
  }
  const definitionItems = (node: SourceNode): SourceNode | undefined => {
    if (node.name === "dl" || node.name === "template" || (node.namespace ?? "html") !== "html") return undefined;
    return ["dt", "dd"].includes(node.name) ? node : node.children.map(definitionItems).find(Boolean);
  };
  for (let ancestor: SourceNode | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "dl" || ancestor.name === "template" || (ancestor.namespace ?? "html") !== "html") break;
    const item = ["dt", "dd"].includes(ancestor.name) ? children.map(definitionItems).find(Boolean) : undefined;
    if (item) return cannot(item.name, ancestor.name);
  }
  for (let ancestor: SourceNode | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.name === "template" || (ancestor.namespace ?? "html") !== "html") break;
    const banned = plainFlow.has(ancestor.name)
      ? descendants.find((node) => outline.has(node.name) || ancestor!.name === "address" && node.name === "address") : undefined;
    if (banned) return cannot(banned.name, ancestor.name);
  }
  for (let ancestor: SourceNode | undefined = parent; ancestor; ancestor = ancestor.parent) {
    const nested = ancestor.name === "form" || ancestor.name === "label" ? descendants.find((node) => node.name === ancestor!.name)
      : ["a", "button"].includes(ancestor.name) ? descendants.find((node) => node.interactive) : undefined;
    if (nested) return cannot(nested.name, ancestor.name);
  }
  const only = parent.name === "ul" || parent.name === "ol" ? ["li"] : parent.name === "dl" ? ["dt", "dd"]
    : parent.name === "select" ? ["option", "optgroup"] : parent.name === "optgroup" ? ["option"] : parent.name === "picture" ? ["source", "img"] : undefined;
  const wrong = names.find((name) => only ? !only.includes(name)
    : ["html", "head", "body", "title", "meta", "link", "base", "li", "dt", "dd", "option", "optgroup", "caption", "colgroup", "col", "tr", "td", "th", "tbody", "thead", "tfoot"].includes(name));
  return wrong === undefined ? undefined : cannot(wrong, parent.name);
}
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
/** The indentation of an insert at `index` of `parent`: its neighbour's (`indent`), and the new line's (`childIndent`, one step in when it has none). */
function insertIndent(source: string, parent: SourceNode, index: number) {
  const next = parent.children[index];
  const previous = parent.children[index - 1];
  const anchor = next ?? previous ?? parent;
  const line = source.lastIndexOf("\n", anchor.start - 1) + 1;
  const lead = source.slice(line, anchor.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  return { next, previous, indent, childIndent: !next && !previous ? `${indent}  ` : indent, nl: source.includes("\r\n") ? "\r\n" : "\n" };
}
function insertion(source: string, parent: SourceNode, index: number, markup: string): SourceEdit {
  let around: SourceNode | undefined = parent;
  while (around?.name === "slot") around = around.parent;
  // In a line of text, on that line: a space apart from its neighbours, never a line of its own.
  if (around && phrasingOnly(around)) {
    const next = parent.children[index], previous = parent.children[index - 1];
    // At the end of the text: after its last word, before the line breaks that close it.
    let at = next ? next.start : previous ? previous.end : parent.closeStart;
    if (!next && !previous) while (at > parent.openEnd && /\s/.test(source[at - 1])) at--;
    const text = next ? `${markup} ` : !previous && at === parent.openEnd ? markup : ` ${markup}`;
    return { start: at, end: at, text };
  }
  const { next, previous, indent, childIndent, nl } = insertIndent(source, parent, index);
  const text = structuralIndent(markup, nl, childIndent);
  if (next) return { start: next.start, end: next.start, text: `${text}${nl}${indent}` };
  if (previous) return { start: previous.end, end: previous.end, text: `${nl}${indent}${text}` };
  // Insert without deleting a single comment, text character, or whitespace.
  return { start: parent.closeStart, end: parent.closeStart, text: `${nl}${childIndent}${text}${nl}${indent}` };
}
/**
 * A distinct markup API. The component nativeInsertEdit contract is unchanged.
 * With `items`, the parent may be an instance's items slot (`slot`, "" the
 * unnamed one): the markup's elements get its `slot` attribute. A path may
 * pass through instances only by their items slots' children.
 */
export function nativeMarkupInsertEdit(source: string, parentPath: readonly number[], index: number, markup: string, items?: ItemsSlotRule, slot = ""): GuardedSourceEdit | undefined {
  const root = tree(source);
  let fragment = tree(markup);
  const parent = root && atPath(root, parentPath, itemsOpener(source, items));
  if (!parent || !fragment || fragment.name || !fragment.children.length || !validFragment(fragment, markup) || !Number.isInteger(index) || index < 0 || index > parent.children.length) return undefined;
  const instance = isInstance(parent);
  if (instance) {
    if (!items?.(parent.name, slot) || fragment.children.some((node) => slotOf(markup, node))) return undefined;
    if (slot) {
      for (const node of [...fragment.children].reverse()) markup = withSlot(markup, node, slot);
      fragment = tree(markup);
      if (!fragment) return undefined;
    }
  }
  if (!canContain(parent, fragment.children, instance)) return undefined;
  const edit = insertion(source, parent, index, markup);
  return { ...edit, original: source.slice(edit.start, edit.end), source };
}
/**
 * A new component instance at `index` of the element at `parentPath`, as
 * nativeMarkupInsertEdit places blocks: into an instance only at an items
 * slot (`slot`, written on it). `markup` is one custom element with no
 * attributes but one variant (`data-…`, bare or with a quoted value; ticket
 * 09 §7) holding a copy of its template's fallbacks (`slotMarkup`), its
 * lines after the first indented relative to the first; they are indented
 * to its line.
 */
export function nativeInstanceInsertEdit(source: string, parentPath: readonly number[], index: number, markup: string, items?: ItemsSlotRule, slot = ""): GuardedSourceEdit | undefined {
  const root = tree(source);
  const fragment = tree(markup);
  const parent = root && atPath(root, parentPath, itemsOpener(source, items));
  const only = fragment?.children[0];
  if (!parent || !fragment || fragment.children.length !== 1 || !only || !isInstance(only) || !Number.isInteger(index) || index < 0 || index > parent.children.length) return undefined;
  const open = markup.slice(only.start, only.openEnd);
  const variant = open.slice(only.name.length + 1, -1);
  if (only.start !== 0 || only.end !== markup.length || !open.startsWith(`<${only.name}`) || !/^(?: data-[a-z\d-]+(?:="[^"<>]*")?)?$/.test(variant)) return undefined;
  // The content is a copy of the site's own template's fallbacks (card-slot.ts), which render there
  // already: read exactly and free of document parts, as written (a `srcset` included).
  const content = markup.slice(only.openEnd, only.closeStart);
  const inner = tree(content);
  if (!inner || startTags(content).some((tag) => ["script", "style", "html", "head", "body", "meta", "link", "base"].includes(tag.name))) return undefined;
  const instance = isInstance(parent);
  if (instance && !items?.(parent.name, slot)) return undefined;
  if (!canContain(parent, [only], instance)) return undefined;
  const { childIndent, nl } = insertIndent(source, parent, index);
  const attribute = instance && slot ? ` slot="${slot.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"` : "";
  const text = `<${only.name}${variant}${attribute}>${content}</${only.name}>`.replace(/\r?\n/g, `${nl}${childIndent}`);
  const edit = insertion(source, parent, index, text);
  return { ...edit, original: source.slice(edit.start, edit.end), source };
}
/** The level a new Heading block takes at this insert parent (ticket 10 §2). */
export function nativeHeadingLevel(source: string, parentPath: readonly number[], items?: ItemsSlotRule): 2 | 3 | 4 | undefined {
  const root = tree(source);
  const parent = root && atPath(root, parentPath, itemsOpener(source, items));
  if (!parent) return undefined;
  if (parent.name === "section") return 2;
  let divs = 0, instance = false;
  let section: SourceNode | undefined = parent;
  for (; section && section.name !== "section"; section = section.parent) {
    if (section.name === "div") divs++;
    if (section.name.includes("-")) instance = true;
  }
  // The section's own heading, or the first one anywhere in a direct header or hgroup.
  const within = (node: SourceNode): SourceNode[] => [node, ...node.children.flatMap(within)];
  const heading = section?.children.flatMap(node => ["header", "hgroup"].includes(node.name) ? within(node) : [node]).find(node => /^h[1-6]$/.test(node.name));
  const level = (heading ? Number(heading.name[1]) : 2) + (instance ? 1 : divs);
  return level >= 4 ? 4 : level === 3 ? 3 : 2;
}
/** An element of the page as the strict source tree holds it (body paths); components are `opaque`; `slot` is its `slot` attribute. */
export interface NativeOutline { name: string; className: string; slot: string; opaque: boolean; heading: string; children: NativeOutline[]; parent?: NativeOutline;
  /** A template's `<slot>`: its `name` ("" the unnamed slot). */
  slotName?: string }
/** The page's element tree for rules that read structure, not geometry; undefined when the source is not exact. */
export function nativeOutline(source: string): NativeOutline | undefined {
  const root = tree(source);
  if (!root) return undefined;
  const text = (node: SourceNode) => decodeHtmlEntities(source.slice(node.openEnd, node.closeStart).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
  const map = (node: SourceNode, parent?: NativeOutline): NativeOutline => {
    const open = source.slice(node.start, node.openEnd), tag = startTags(open)[0];
    const className = tag ? decodeHtmlEntities(startTagAttribute(open, tag, "class")?.value ?? "", true) : "";
    const heading = node.name === "section" ? node.children.find(child => /^h[1-6]$/.test(child.name)) : undefined;
    const out: NativeOutline = { name: node.name, className, slot: node === root ? "" : slotOf(source, node), opaque: Boolean(node.opaque), heading: heading ? text(heading) : "", children: [], parent };
    if (node.name === "slot" && (node.namespace ?? "html") === "html" && tag) out.slotName = decodeHtmlEntities(startTagAttribute(open, tag, "name")?.value ?? "", true);
    out.children = node.children.map(child => map(child, out));
    return out;
  };
  return map(root);
}
/**
 * Where a move may go, or why not. With `items`, the destination may be an
 * instance's items slot (`slot`, "" the unnamed one), as for inserts and source paths.
 */
function moveDestination(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">, items?: ItemsSlotRule, slot = ""):
  { moving: SourceNode; parent: SourceNode; instance: boolean } | { reason: string } {
  const root = tree(source);
  if (!root) return { reason: "The HTML here could not be read exactly. Fix it in the code first." };
  const moving = atPath(root, from, itemsOpener(source, items));
  const parent = atPath(root, destination.parent, itemsOpener(source, items));
  // A component instance moves whole (its bytes kept as they are); other opaque islands stay put.
  if (!moving || (moving.opaque && !isInstance(moving)) || !from.length) return { reason: "This element can't be moved." };
  if (!parent || !Number.isInteger(destination.index) || destination.index < 0 || destination.index > parent.children.length) return { reason: "That place is not there any more." };
  for (let node: SourceNode | undefined = parent; node; node = node.parent) if (node === moving) return { reason: "A block cannot go inside itself." };
  const instance = isInstance(parent);
  if (instance && !items?.(parent.name, slot)) return { reason: "Its parts belong to the component: open it to change them." };
  // A <details> keeps its <summary> first.
  if (parent.name === "details" && parent.children[0]?.name === "summary" && parent.children[0] !== moving && destination.index === 0) return { reason: "A <details> keeps its <summary> first." };
  const reason = contentRefusal(parent, [moving], instance);
  return reason ? { reason } : { moving, parent, instance };
}

/** Validate a move destination, including legitimate same-parent no-op positions. */
export function nativeMoveDestinationValid(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">, items?: ItemsSlotRule, slot = ""): boolean {
  return !("reason" in moveDestination(source, from, destination, items, slot));
}

/**
 * Why the element at `from` can't move into the element at `parent` (an
 * instance's items slot `slot` with `items`) by HTML's content rules
 * ("A <div> can't go inside a <p>."), or nothing when it can.
 */
export function nativeMoveRefusal(source: string, from: readonly number[], parent: readonly number[], items?: ItemsSlotRule, slot = ""): string | undefined {
  const valid = moveDestination(source, from, { parent: [...parent], index: 0 }, items, slot);
  return "reason" in valid ? valid.reason : undefined;
}

/** Whether `after` differs from `before` only inside the element at `path` (between its tags), as typing in it does. */
export function nativeEditInside(before: string, after: string, path: readonly number[]): boolean {
  if (before === after) return true;
  const root = tree(before);
  const node = root && path.length ? atPath(root, path) : undefined;
  if (!node || node.closeStart === node.openEnd && node.end === node.openEnd) return false;
  const max = Math.min(before.length, after.length);
  let start = 0, end = 0;
  while (start < max && before[start] === after[start]) start++;
  while (end < max && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  // The changed stretch (for an insertion, any point between the common ends) lies within the content,
  // and the element still ends where its bytes moved to (no tags were closed or opened across it).
  if (start < node.openEnd || before.length - end > node.closeStart) return false;
  const now = tree(after), same = now && atPath(now, path);
  return Boolean(same && same.start === node.start && same.openEnd === node.openEnd && same.end === node.end + after.length - before.length);
}

/**
 * Whether the element at `path` is a block a drag may move: inside <main>
 * (never <main> itself, the header or the footer), reached without passing
 * through a component instance except via its items slots with `items`,
 * and either no island or an instance itself.
 */
export function nativeMovableBlock(source: string, path: readonly number[], items?: ItemsSlotRule): boolean {
  const root = tree(source);
  const node = root && atPath(root, path, itemsOpener(source, items));
  if (!node || !path.length || (node.opaque && !isInstance(node))) return false;
  for (let at = node.parent; at; at = at.parent) if (at.name === "main") return true;
  return false;
}

/**
 * One replacement, guarded against stale source; standalone removal takes
 * its line, never neighbours. Across containers the block takes the destination slot
 * (`items`, `slot`), or loses its slot attribute in a plain container.
 */
export function nativeMoveEdit(source: string, from: readonly number[], destination: Pick<InsertPoint, "parent" | "index">, items?: ItemsSlotRule, slot = ""): GuardedSourceEdit | undefined {
  const valid = moveDestination(source, from, destination, items, slot);
  if ("reason" in valid) return undefined;
  const { moving, parent } = valid;
  const index = from[from.length - 1];
  const sameSlot = moving.parent === parent && (!valid.instance || slotOf(source, moving) === slot);
  // Where it is, in the slot it fills: nothing to write. Beside itself into another slot of its instance is a move.
  if (sameSlot && [index, index + 1].includes(destination.index)) return undefined;
  const lineStart = source.lastIndexOf("\n", moving.start - 1) + 1;
  const lead = source.slice(lineStart, moving.start);
  const indent = /^[ \t]*$/.test(lead) ? lead : "";
  const element = source.slice(moving.start, moving.end);
  let assigned = element;
  // Leaving an instance or entering another slot: the old assignment goes before the destination's is written, never doubled.
  if (!sameSlot && (valid.instance || (moving.parent && isInstance(moving.parent)))) {
    const tag = startTags(assigned)[0];
    const attribute = tag && startTagAttribute(assigned, tag, "slot");
    if (attribute) assigned = assigned.slice(0, attribute.start) + assigned.slice(attribute.end);
    if (valid.instance && slot) assigned = withSlot(assigned, { ...moving, start: 0 }, slot);
  }
  if (moving.parent === parent && [index, index + 1].includes(destination.index)) {
    return { start: moving.start, end: moving.end, text: assigned, original: element, source };
  }
  const nextLine = source.indexOf("\n", moving.end);
  const lineEnd = nextLine < 0 ? source.length : nextLine > 0 && source[nextLine - 1] === "\r" ? nextLine - 1 : nextLine;
  // Inside a <pre> the line breaks are content: only the element's bytes go, and nothing is re-laid.
  const inPre = (node: SourceNode | undefined) => { for (let at = node; at; at = at.parent) if (at.name === "pre") return true; return false; };
  const alone = !inPre(moving.parent) && /^[ \t]*$/.test(lead) && /^[ \t]*$/.test(source.slice(moving.end, lineEnd));
  let removeStart = moving.start;
  let removeEnd = moving.end;
  if (alone) {
    // Prefer the preceding newline; a first-line element takes the following one.
    removeStart = lineStart > 0 ? lineStart - (source[lineStart - 2] === "\r" ? 2 : 1) : 0;
    removeEnd = lineStart > 0 || nextLine < 0 ? lineEnd : nextLine + 1;
  }
  const markup = structuralIndent(assigned, source.includes("\r\n") ? "\r\n" : "\n", "", indent);
  const insert = insertion(source, parent, destination.index, markup);
  // An empty parent already on separate lines supplies the insertion's first newline.
  const closeLine = source.lastIndexOf("\n", parent.closeStart - 1) + 1;
  // (Not in a line of text: there the insertion stays on the text's line.)
  if (!parent.children.length && !inPre(parent) && !phrasingOnly(parent) && closeLine > parent.openEnd && /^[ \t]*$/.test(source.slice(closeLine, parent.closeStart))) {
    insert.start = closeLine;
    insert.text = insert.text.replace(/^\r?\n/, "");
  }
  const start = Math.min(removeStart, insert.start);
  const end = Math.max(removeEnd, insert.end);
  const original = source.slice(start, end);
  const text = insert.start <= removeStart
    ? insert.text + source.slice(insert.end, removeStart) + source.slice(removeEnd, end)
    : source.slice(start, removeStart) + source.slice(removeEnd, insert.start) + insert.text;
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
