import { expandStyleImports, resolveImportPath } from "../../shared/css-imports";
import { nativePageStylesheets } from "../../shared/native-project";
import { blockEnd, preludeEnd, skipSpace, withoutComments } from "../../shared/slotted-css";
import { descendants, parseSource, startTagAttributes, type SourceElement } from "./component-model";

export const COMPONENT_LOADER_PATH = "components/components.js";
export const COMPONENT_LOADER_SCRIPT = '<script type="module" src="/components/components.js"></script>';
export const COMPONENT_LOADER_RULE = `/* Components stay hidden until components.js has defined them, so a page
   never shows them unstyled. Only with scripting on: without JS, their
   content still shows. :not(:defined) matches custom elements only (every
   built-in element is defined); data-unloaded is the loader's mark on one it
   could not load, which then shows its own content. */
@media (scripting: enabled) {
  :not(:defined):not([data-unloaded]) {
    visibility: hidden;
  }
}`;

export interface ComponentLoaderPlan {
  creates: { path: string; content: string }[];
  edits: Map<string, string>;
  pages: string[];
  added: string;
  notes: string[];
}
export interface ComponentLoaderInput {
  pages: readonly string[];
  sources: Record<string, string>;
  exists: (path: string) => boolean;
  loader: string;
}

const headOf = (source: string) => [...descendants(parseSource(source))].find(element => element.name === "head");
const attribute = (source: string, element: SourceElement, name: string) => startTagAttributes(source, element.tag).find(item => item.name === name)?.value;

/** Only an actual script in the head counts; comments and body scripts do not. */
export function pageLoadsComponentLoader(source: string, path: string): boolean {
  const head = headOf(source);
  return Boolean(head && [...descendants(head.children)].some(element => element.name === "script" &&
    resolveImportPath(path, attribute(source, element, "src") ?? "") === COMPONENT_LOADER_PATH));
}

/** Keeps the document's line endings and the indentation of the preceding line. */
export function addComponentLoaderScript(source: string): string | undefined {
  const head = headOf(source);
  if (!head?.close) return;
  const link = [...descendants(head.children)].filter(element => element.name === "link" &&
    (attribute(source, element, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet")).at(-1);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const at = link?.end ?? head.close.start;
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const indent = /^[\t ]*/.exec(source.slice(lineStart, at))![0];
  if (link) {
    // When the link shares its line with another tag, give that tag its own line too.
    const tail = source.slice(at);
    const breakAfter = /^[\t ]*\r?\n/.test(tail) ? "" : newline + indent;
    return source.slice(0, at) + newline + indent + COMPONENT_LOADER_SCRIPT + breakAfter + tail;
  }
  if (/^[\t ]*$/.test(source.slice(lineStart, at))) {
    const previousStart = source.lastIndexOf("\n", Math.max(0, lineStart - 2)) + 1;
    const previousIndent = /^[\t ]*/.exec(source.slice(previousStart, lineStart))![0];
    return source.slice(0, lineStart) + previousIndent + COMPONENT_LOADER_SCRIPT + newline + source.slice(lineStart);
  }
  return source.slice(0, at) + newline + indent + COMPONENT_LOADER_SCRIPT + newline + indent + source.slice(at);
}

/** Reads selector preludes, including grouping and nested rules, without treating declarations as selectors. */
export function stylesheetHasUndefinedRule(source: string): boolean {
  function read(from: number, to: number): boolean {
    let at = from;
    while (at < to) {
      at = skipSpace(source, at);
      const stop = Math.min(preludeEnd(source, at), to);
      if (source[stop] !== "{") { at = stop + 1; continue; }
      const end = Math.min(blockEnd(source, stop), to);
      const prelude = withoutComments(source.slice(at, stop)).trim();
      if (prelude.startsWith("@")) {
        if (/^@(media|supports|layer|container|scope|starting-style|document|-moz-document)\b/i.test(prelude) && read(stop + 1, end - 1)) return true;
      } else if (!/^--[\w-]*\s*:/.test(prelude)) {
        const selector = prelude.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
        if (/:not\(\s*:defined\s*\)/i.test(selector) || read(stop + 1, end - 1)) return true;
      }
      at = end;
    }
    return false;
  }
  return read(0, source.length);
}

/** Adds the site's own loader only alongside a component action, never a rule-only repair. */
export function componentLoaderPlan(input: ComponentLoaderInput): ComponentLoaderPlan | undefined {
  const { sources, loader, exists } = input;
  const pages = [...new Set(input.pages)];
  const creates = exists(COMPONENT_LOADER_PATH) ? [] : [{ path: COMPONENT_LOADER_PATH, content: loader }];
  const edits = new Map<string, string>(), addedPages: string[] = [], notes: string[] = [];
  for (const path of pages) {
    const source = sources[path];
    if (source !== undefined && pageLoadsComponentLoader(source, path)) continue;
    const next = source === undefined ? undefined : addComponentLoaderScript(source);
    if (next === undefined) notes.push(source === undefined
      ? `${path} could not be read, so the component loader was not added to it.`
      : `${path} has no head to place the component loader in; the page was left out.`);
    else { edits.set(path, next); addedPages.push(path); }
  }
  if (!creates.length && !addedPages.length)
    return notes.length ? { creates, edits, pages: [], added: "", notes } : undefined;
  const linked = pages.map(path => nativePageStylesheets(sources[path] ?? "", path));
  const all = [...new Set(linked.flat())];
  const hasRule = expandStyleImports(all, path => sources[path]).sheets.some(sheet =>
    stylesheetHasUndefinedRule(sheet.source));
  const home = pages.indexOf("index.html");
  const main = all.includes("styles/site.css") ? "styles/site.css" :
    linked[home < 0 ? 0 : home]?.find(path => linked.every(sheets => sheets.includes(path)));
  let rulePath: string | undefined;
  if (!hasRule) {
    if (main && sources[main] !== undefined) {
      const source = sources[main], newline = source.includes("\r\n") ? "\r\n" : "\n";
      edits.set(main, source.replace(/\s*$/, "") + newline + newline + COMPONENT_LOADER_RULE.replace(/\n/g, newline) + newline);
      rulePath = main;
    } else notes.push("No shared main stylesheet was found; the :not(:defined) rule was left out.");
  }
  const where = addedPages.length === 1 ? " to the page" : addedPages.length ? ` to ${addedPages.length} pages` : "";
  const added = `Added the component loader${where}${rulePath ? `, and its :not(:defined) rule to ${rulePath}` : ""}${creates.length ? ` (components/components.js created)` : ""}.`;
  return { creates, edits, pages: addedPages, added, notes };
}
