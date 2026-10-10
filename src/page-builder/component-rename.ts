// Renaming a component (wayfinder components-and-builder build slice 76),
// from Edit component mode's bar. A pure plan over the site's sources: the
// component's folder and files move to the new tag's path, its instances on
// every page and in every other template take the new tag (attributes and
// content kept), and exact tag selectors that name it in the site's
// stylesheets (its own CSS too) follow. The host applies it as one operation
// (one undo step). The loader needs nothing: components/components.js finds
// a component by its tag.

import { descendants, parseSource, startTagAttributes, type RangeEdit } from "./component-model";
import { madeFrom, normaliseComponentName, normaliseName, type NameSource } from "./component-names";

export interface ComponentRenameInput {
  /** The component's tag now. */
  from: string;
  /** The name as typed (made valid here, with the prefix rule). */
  typed: string;
  /** The site's components, tag to template file. */
  components: Record<string, string>;
  /** Every file of the site. */
  files: readonly string[];
  /** The text of the pages, templates and stylesheets the plan reads (and the component's own files). */
  sources: Record<string, string>;
  /** The page files. */
  pages: readonly string[];
}

export type ComponentRenamePlan =
  | { unchanged: true }
  | { error: string }
  | {
    tag: string;
    /** The template's path after the move. */
    template: string;
    moves: { from: string; to: string }[];
    /** New text, by the path each file has after the moves. */
    edits: Map<string, string>;
    /** Pages and other templates whose instances follow. */
    pages: string[];
    templates: string[];
    /** Site stylesheets (not the component's own) whose rules now name the new tag, and how many rules. */
    stylesheets: { path: string; rules: number }[];
  };

/** What a template's root is, for a new name's prefix (decision 9): a section, a card, else a block. */
export function templateNameSource(template: string): NameSource {
  const root = [...descendants(parseSource(template))].find((el) => el.name !== "slot");
  return madeFrom(root?.name ?? "", root ? startTagAttributes(template, root.tag).find((entry) => entry.name === "class")?.value : undefined);
}

/** The component's own name, made valid, for `typed`: the prefix from what its template's root is. */
export function renamedTag(from: string, typed: string, template: string, taken: Iterable<string>) {
  const source = templateNameSource(template);
  const name = normaliseName(typed, true);
  if (!name) return undefined;
  const others = [...taken].filter((tag) => tag !== from);
  const { tag, problem } = normaliseComponentName(name, source, others);
  return tag === from ? undefined : { tag, problem };
}

export function componentRenamePlan(input: ComponentRenameInput): ComponentRenamePlan {
  const { from, components, sources } = input;
  const templatePath = components[from];
  const template = templatePath === undefined ? undefined : sources[templatePath];
  if (templatePath === undefined || template === undefined) return { error: `The component <${from}> is not there any more.` };
  const named = renamedTag(from, input.typed, template, Object.keys(components));
  if (!named) return { unchanged: true };
  if (named.problem) return { error: named.problem };
  const tag = named.tag;
  const cssPath = templatePath.replace(/\.html$/, ".css");

  // The folder (components/<tag>/<tag>.html) moves whole; a flat component (components/<tag>.html) its two files.
  const folder = `components/${from}/`;
  const foldered = templatePath === `${folder}${from}.html`;
  const own = (path: string) => (foldered ? path.startsWith(folder) : path === templatePath || path === cssPath);
  const target = (path: string) => {
    const rest = path.slice(foldered ? folder.length : "components/".length);
    const renamed = rest === `${from}.html` ? `${tag}.html` : rest === `${from}.css` ? `${tag}.css` : rest;
    return foldered ? `components/${tag}/${renamed}` : `components/${renamed}`;
  };
  const moves = [...new Set([...input.files, templatePath])].filter(own).sort().map((path) => ({ from: path, to: target(path) }));
  const newFolder = `components/${tag}/`;
  if (foldered && input.files.some((path) => path.startsWith(newFolder))) return { error: `There is a folder ${newFolder} already.` };
  const blocked = moves.find((move) => input.files.includes(move.to));
  if (blocked) return { error: `${blocked.to} already exists.` };
  const moved = new Map(moves.map((move) => [move.from, move.to]));
  const at = (path: string) => moved.get(path) ?? path;

  const edits = new Map<string, string>();
  const pages: string[] = [];
  const templates: string[] = [];
  const stylesheets: { path: string; rules: number }[] = [];
  const pageFiles = new Set(input.pages);
  const templateFiles = new Set(Object.values(components));
  for (const [path, text] of Object.entries(sources)) {
    if (pageFiles.has(path) || templateFiles.has(path)) {
      const next = renameInstances(text, from, tag);
      if (next === text) continue;
      edits.set(at(path), next);
      if (pageFiles.has(path)) pages.push(path);
      else if (path !== templatePath) templates.push(path);
    } else if (/\.css$/i.test(path)) {
      const next = renameTagSelectors(text, from, tag);
      if (!next.rules) continue;
      edits.set(at(path), next.css);
      if (!own(path)) stylesheets.push({ path, rules: next.rules });
    }
  }
  const order = (list: string[], all: Iterable<string>) => { const rank = [...all]; return list.sort((a, b) => rank.indexOf(a) - rank.indexOf(b)); };
  return { tag, template: at(templatePath), moves, edits, pages: order(pages, input.pages), templates: templates.sort(), stylesheets: stylesheets.sort((a, b) => a.path.localeCompare(b.path)) };
}

/** What the bar and the status line say of a rename: done and undone, and the note naming the stylesheets that changed. */
export function renameMessages(from: string, plan: { tag: string; pages: string[]; templates: string[]; stylesheets: { path: string; rules: number }[] }) {
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const followed = [plan.pages.length ? count(plan.pages.length, "page") : "", plan.templates.length ? count(plan.templates.length, "component") : ""].filter(Boolean);
  const sheets = plan.stylesheets.map((sheet) => `${sheet.path} (${count(sheet.rules, "rule")})`);
  const users = plan.pages.length + plan.templates.length;
  return {
    done: `Renamed <${from}> to <${plan.tag}>.${users ? ` ${followed.join(" and ")} using it ${users === 1 ? "follows" : "follow"}.` : ""}`,
    undone: `Undid renaming <${from}> to <${plan.tag}>.`,
    notes: sheets.length ? [`<${from}> renamed in ${sheets.join(", ")}.`] : [],
  };
}

/** `html` with every `<from>` element (as parsed: not in comments, scripts or text) named `to`, attributes and content kept. */
export function renameInstances(html: string, from: string, to: string): string {
  if (!html.toLowerCase().includes(`<${from}`)) return html;
  const edits: RangeEdit[] = [];
  for (const el of descendants(parseSource(html))) {
    if (el.name !== from) continue;
    edits.push({ start: el.tag.start + 1, end: el.tag.nameEnd, text: to });
    if (el.close) edits.push({ start: el.close.start + 2, end: el.close.start + 2 + from.length, text: to });
  }
  let out = html;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

const IDENT = /[a-zA-Z0-9_\-\u0080-\uffff\\]/;
// Functional pseudo-classes whose arguments are selectors.
const SELECTOR_FUNCTIONS = new Set(["is", "where", "not", "has", "matches", "any", "-webkit-any", "-moz-any", "nth-child", "nth-last-child", "host", "host-context", "slotted"]);

/** Skips a comment or string starting at `i`; the index after it, or `i` when there is none. */
function skipped(css: string, i: number) {
  if (css.startsWith("/*", i)) {
    const close = css.indexOf("*/", i + 2);
    return close < 0 ? css.length : close + 2;
  }
  const quote = css[i];
  if (quote === "\"" || quote === "'") {
    let j = i + 1;
    while (j < css.length && css[j] !== quote && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
    return Math.min(j + 1, css.length);
  }
  return i;
}

/**
 * `css` with each type selector naming exactly `from` renamed `to` (in rule
 * preludes, nested ones and selector functions too; never in declarations,
 * at-rule preludes, attribute selectors, comments or strings), and how many
 * rules changed.
 */
export function renameTagSelectors(css: string, from: string, to: string): { css: string; rules: number } {
  if (!css.toLowerCase().includes(from)) return { css, rules: 0 };
  const edits: RangeEdit[] = [];
  let rules = 0;
  const prelude = (start: number, end: number) => {
    let i = start;
    while (i < end) {
      const after = skipped(css, i);
      if (after !== i) { i = after; continue; }
      if (/\s/.test(css[i])) { i++; continue; }
      break;
    }
    // At-rule preludes (@media, @supports…) are not selectors; @scope's parentheses are.
    const scope = /^@scope(?![\w-])/i.test(css.slice(i, i + 7));
    if (css[i] === "@" && !scope) return;
    if (scope) i += 6;
    // Whether each open parenthesis holds selectors (:is(), :not()…, not :lang() or :nth-child(2n)'s formula alone).
    const open: boolean[] = [];
    let fn: string | undefined;
    let found = false;
    while (i < end) {
      const after = skipped(css, i);
      if (after !== i) { i = after; continue; }
      if (css[i] === "(") { open.push(fn ? SELECTOR_FUNCTIONS.has(fn) : scope && !open.length); fn = undefined; i++; continue; }
      if (css[i] === ")") { open.pop(); i++; continue; }
      if (css[i] === "[") {
        let j = i + 1;
        while (j < end && css[j] !== "]") { const next = skipped(css, j); j = next === j ? j + 1 : next; }
        i = j + 1;
        continue;
      }
      if (!IDENT.test(css[i])) { i++; continue; }
      let j = i;
      while (j < end && IDENT.test(css[j])) j++;
      const before = css[i - 1] ?? "";
      const word = css.slice(i, j);
      if (css[j] === "(") fn = word.toLowerCase();
      else if (word.toLowerCase() === from && !/[.#:@%]/.test(before) && (open.length ? open.at(-1) : !scope)) {
        edits.push({ start: i, end: j, text: to });
        found = true;
      }
      i = j;
    }
    if (found) rules++;
  };
  let segment = 0, depth = 0;
  for (let i = 0; i < css.length;) {
    const after = skipped(css, i);
    if (after !== i) { i = after; continue; }
    const char = css[i];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (!depth && char === "{") { prelude(segment, i); segment = i + 1; }
    else if (!depth && (char === "}" || char === ";")) segment = i + 1;
    i++;
  }
  let out = css;
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return { css: out, rules };
}
