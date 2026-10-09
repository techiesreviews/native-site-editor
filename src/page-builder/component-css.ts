// Make component's page CSS (build ticket 64): the rules of the page's
// stylesheets that styled the element, copied into the new component's CSS
// and rewritten to start at the element, so the component looks as the
// element did. The site's stylesheets are never edited.
//
// The loader clones the page's stylesheets into each shadow root, so page
// rules still reach the template's own elements, but not what the page slots
// in (`<h2 slot="title">` sits outside `.intro` in the page). A copied rule
// reaches it through the `::slotted()` twin the loader and the preview give
// every component selector (shared/slotted-css.ts):
//   - compounds that matched ancestors outside the element are dropped
//     (`main .intro h2` → `.intro h2`); one that matched the element through
//     its `id`, which moves to the instance, becomes `:host`;
//   - `@media`, `@supports`, `@container` and `@starting-style` wrappers and
//     the rules' order are kept, `@layer` is dropped (component CSS is
//     unlayered), `url()`s are rewritten for the component's folder;
//   - a rule whose subject sits inside a slotted element (`.intro h2 a`) can't
//     be reached from the shadow root (`::slotted()` takes the slotted element
//     only): nothing is copied, the plan's notes list it. So is a rule that
//     depends on what stands beside the element (`.hero + .intro`);
//   - rules for the items that became a card component go to the card's CSS,
//     rewritten to start at the item.
//
// Matching is done on the page source with a small selector matcher. A
// state the page is not in (`:hover`, `:focus`, `:checked` …) counts as
// matching, so state rules come along with the resting ones. No DOM here, so
// it runs in the unit tests as it does in the editor; the editor loads it
// when Make component opens.

import { compareSpecificity, specificity, splitSelectorList } from "../../shared/cascade";
import { resolveImportPath, rewriteCssUrls } from "../../shared/css-imports";
import { blockEnd, preludeEnd, skipSpace, slottedTwin } from "../../shared/slotted-css";
import { parseSource, startTagAttributes, type InstanceRange, type MakeComponentPlan, type PlannedSlot, type SourceElement, type SourceNode } from "./component-model";

// ---- Stylesheets as flat style rules. ----

/** A style rule with its nesting resolved, inside the wrappers that condition it. */
export interface FlatRule {
  /** The repository path of the stylesheet it is in. */
  path: string;
  /** Its selector list's parts, nesting resolved. */
  selectors: string[];
  /** Its declarations as written (`color: red`, `margin: 0 !important`), comments out. */
  declarations: string[];
  /** The preludes of the conditions it sits in, outermost first (`@media (min-width: 40em)`). */
  wrappers: string[];
}

// Conditions a copied rule keeps; `@layer` blocks are read through and dropped.
const KEPT = new Set(["media", "supports", "container", "starting-style"]);

/**
 * The style rules of `css` in order of appearance, nested rules flattened
 * (`.a { & b {} }` → `.a b`; declarations after a nested rule a rule of
 * their own after it). `@layer` blocks are read through; `@keyframes`,
 * `@font-face`, `@scope` and other at-rules are left out.
 */
export function flatRules(css: string, path: string): FlatRule[] {
  const out: FlatRule[] = [];
  const read = (start: number, end: number, wrappers: string[], parent?: string[]) => {
    // The rule the declarations read now go to: a new one after each nested block.
    let own: FlatRule | undefined;
    const declare = (text: string) => {
      if (!parent) return;
      if (!own) out.push(own = { path, selectors: parent, declarations: [], wrappers });
      own.declarations.push(text);
    };
    let pos = start;
    while (pos < end) {
      pos = skipSpace(css, pos);
      if (pos >= end) break;
      const stop = Math.min(preludeEnd(css, pos), end);
      if (css[stop] !== "{" || stop >= end) {
        // A declaration, or a statement at-rule (`@import`, `@layer a, b;`).
        const text = clean(css.slice(pos, stop));
        if (!text.startsWith("@") && /^[\w-]+\s*:/.test(text)) declare(text);
        pos = stop + 1;
        continue;
      }
      const close = Math.min(blockEnd(css, stop), end);
      const prelude = clean(css.slice(pos, stop), true);
      if (parent && /^--[\w-]*\s*:/.test(prelude)) {
        // A custom property whose value holds a block.
        declare(clean(css.slice(pos, close)));
        pos = close;
        continue;
      }
      if (prelude.startsWith("@")) {
        const name = /^@([\w-]+)/.exec(prelude)?.[1].toLowerCase() ?? "";
        if (KEPT.has(name)) read(stop + 1, close - 1, [...wrappers, prelude], parent);
        else if (name === "layer") read(stop + 1, close - 1, wrappers, parent);
      } else read(stop + 1, close - 1, wrappers, nested(prelude, parent));
      own = undefined;
      pos = close;
    }
  };
  read(0, css.length, []);
  return out;
}

/** `text` without comments and trimmed; `collapse`: runs of white space made one space. Strings stay as written. */
function clean(text: string, collapse = false) {
  let out = "", quote = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      out += char;
      if (char === "\\") out += text[++index] ?? "";
      else if (char === quote) quote = "";
    } else if (char === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      index = close < 0 ? text.length : close + 1;
      if (!out.endsWith(" ")) out += " ";
    } else if (collapse && /\s/.test(char)) {
      if (!out.endsWith(" ")) out += " ";
    } else if (char === "\\") out += char + (text[++index] ?? "");
    else {
      if (char === "\"" || char === "'") quote = char;
      out += char;
    }
  }
  return out.trim();
}

// A nested rule's selectors with the parent's put in: `&` replaced (by the
// parent part as written where that is exact, else `:is(…)`), a relative one
// (`> b`, `b`) put after it. A parent list whose parts differ in specificity
// stays one `:is(…)`, which counts as the most specific, as nesting does.
function nested(prelude: string, parent?: string[]) {
  const parts = splitSelectorList(prelude);
  if (!parent) return parts;
  // `& + &` pairs every part with every other, which one list does and a part at a time doesn't.
  if (parent.some((outer) => compareSpecificity(specificity(outer), specificity(parent[0]))) || parent.length > 1 && parts.some((part) => /&[\s\S]*&/.test(part))) {
    const list = `:is(${parent.join(", ")})`;
    return parts.map((part) => (/&/.test(part) ? part.replace(/&/g, list) : `${list} ${part}`));
  }
  return parts.flatMap((part) => parent.map((outer) => {
    if (!/&/.test(part)) return `${outer} ${part}`;
    const plain = compoundsOf(outer)?.length === 1 || /^&(?![\w-])/.test(part) && !/&/.test(part.slice(1));
    return part.replace(/&/g, plain ? outer : `:is(${outer})`);
  }));
}

// ---- Selectors: compounds and simple selectors. ----

type Simple =
  | { type: "tag"; name: string; start: number; end: number }
  | { type: "id" | "class"; name: string; start: number; end: number }
  | { type: "attribute"; name: string; operator?: string; value?: string; insensitive: boolean; start: number; end: number }
  | { type: "pseudo"; name: string; argument?: string; element: boolean; start: number; end: number }
  | { type: "nesting"; start: number; end: number };

interface Compound {
  /** The combinator before it: "" for the first. */
  combinator: "" | " " | ">" | "+" | "~";
  start: number;
  end: number;
  simples: Simple[];
}

const IDENT = /[\w\-\u0080-\uffff]/;

/** A CSS identifier at `index` (escapes decoded) and where it ends. */
function ident(text: string, index: number) {
  let value = "";
  while (index < text.length) {
    const char = text[index];
    if (char === "\\") {
      const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(text.slice(index + 1, index + 8));
      if (hex) {
        value += String.fromCodePoint(Math.min(parseInt(hex[0], 16), 0x10ffff) || 0xfffd);
        index += 1 + hex[0].length;
      } else {
        value += text[index + 1] ?? "";
        index += 2;
      }
    } else if (IDENT.test(char)) {
      value += char;
      index++;
    } else break;
  }
  return { value, end: index };
}

// Past the bracket or parenthesis closing the one at `index`, strings skipped.
function closing(text: string, index: number) {
  let depth = 0, quote = "";
  for (; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\\") index++;
    else if (char === "\"" || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && --depth === 0) return index + 1;
  }
  return -1;
}

const parsed = new Map<string, Compound[] | undefined>();

/** A complex selector's compounds, or undefined when it can't be read (`||`, a stray character). */
export function compoundsOf(selector: string): Compound[] | undefined {
  if (parsed.has(selector)) return parsed.get(selector);
  const out: Compound[] = [];
  const s = selector.trim();
  let index = 0, combinator: Compound["combinator"] = "";
  let ok = true;
  while (index < s.length && ok) {
    const start = index;
    const simples: Simple[] = [];
    while (index < s.length && ok) {
      const char = s[index], from = index;
      if (char === "#" || char === ".") {
        const name = ident(s, index + 1);
        if (!name.value) ok = false;
        simples.push({ type: char === "#" ? "id" : "class", name: name.value, start: from, end: (index = name.end) });
      } else if (char === "[") {
        const end = closing(s, index);
        if (end < 0) { ok = false; break; }
        const inner = /^\s*(?:[\w-]*\|)?([\w\-\\:]+)\s*(?:([~|^$*]?=)\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s\]]+)\s*([is])?)?\s*$/i.exec(s.slice(index + 1, end - 1));
        if (!inner) { ok = false; break; }
        const raw = inner[3];
        const value = raw === undefined ? undefined : /^["']/.test(raw) ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : ident(raw, 0).value;
        simples.push({ type: "attribute", name: inner[1].toLowerCase(), operator: inner[2], value, insensitive: inner[4]?.toLowerCase() === "i", start: from, end: (index = end) });
      } else if (char === ":") {
        const element = s[index + 1] === ":";
        const name = ident(s, index + (element ? 2 : 1));
        if (!name.value) { ok = false; break; }
        index = name.end;
        let argument: string | undefined;
        if (s[index] === "(") {
          const end = closing(s, index);
          if (end < 0) { ok = false; break; }
          argument = s.slice(index + 1, end - 1).trim();
          index = end;
        }
        simples.push({ type: "pseudo", name: name.value.toLowerCase(), argument, element, start: from, end: index });
      } else if (char === "&") {
        simples.push({ type: "nesting", start: from, end: ++index });
      } else if (char === "*" || char === "\\" || IDENT.test(char) || char === "|") {
        if (simples.length) { ok = false; break; }
        let name = "*";
        if (char === "*") index++;
        else if (char !== "|") ({ value: name, end: index } = ident(s, index));
        // A namespace prefix: the name after the bar counts.
        if (s[index] === "|" && s[index + 1] !== "=") {
          index++;
          if (s[index] === "*") { name = "*"; index++; } else ({ value: name, end: index } = ident(s, index));
        }
        simples.push({ type: "tag", name: name.toLowerCase(), start: from, end: index });
      } else break;
    }
    if (!ok || index === start) { ok = false; break; }
    out.push({ combinator, start, end: index, simples });
    // The combinator to the next compound.
    let next: Compound["combinator"] = "";
    while (index < s.length && /[\s>+~]/.test(s[index])) {
      if (s[index] !== " " && !/\s/.test(s[index])) {
        if (next && next !== " ") { ok = false; break; }
        next = s[index] as Compound["combinator"];
      } else if (!next) next = " ";
      index++;
    }
    if (index < s.length && !next) ok = false;
    combinator = next;
  }
  const result = ok && out.length ? out : undefined;
  parsed.set(selector, result);
  return result;
}

// ---- Matching on the page source. ----

interface Match {
  html: string;
  /** The page's top-level elements: the siblings of an element without a parent. */
  top: SourceElement[];
  /** Matching stops here: no parent, no siblings (the element on its own, as in its template). */
  boundary?: SourceElement;
  /** What `:scope` matches (the anchor of a `:has()` argument). */
  scope?: SourceElement;
  /** The page as it will be: parents, siblings, attributes and names that differ from the source's. */
  parents?: Map<SourceElement, SourceElement>;
  siblings?: Map<SourceElement, SourceElement[]>;
  attributes?: Map<SourceElement, Map<string, string>>;
  names?: Map<SourceElement, string>;
}

const elementsOf = (nodes: SourceNode[]) => nodes.filter((node): node is SourceElement => node.type === "element");
const sourceAttributes = new WeakMap<SourceElement, Map<string, string>>();
function attributesOf(m: Match, el: SourceElement) {
  const own = m.attributes?.get(el);
  if (own) return own;
  let map = sourceAttributes.get(el);
  if (!map) {
    map = new Map();
    for (const item of startTagAttributes(m.html, el.tag)) if (!map.has(item.name)) map.set(item.name, item.value);
    sourceAttributes.set(el, map);
  }
  return map;
}
const attributeOf = (m: Match, el: SourceElement, name: string) => attributesOf(m, el).get(name);
const nameOf = (m: Match, el: SourceElement) => m.names?.get(el) ?? el.name;
const parentOf = (m: Match, el: SourceElement) => (el === m.boundary ? undefined : m.parents?.get(el) ?? el.parent);
const siblingsOf = (m: Match, el: SourceElement) =>
  (el === m.boundary ? [el] : m.siblings?.get(el) ?? (el.parent ? elementsOf(el.parent.children) : m.top));

// Pseudo-classes matched exactly; any other (`:hover`, `:focus-visible`, `:checked`, `:lang()` …) is a
// state or condition the page may be in, so it counts as matching.
const EXACT = new Set(["is", "where", "matches", "-webkit-any", "not", "has", "root", "scope", "empty", "link", "any-link", "host", "host-context",
  "first-child", "last-child", "only-child", "first-of-type", "last-of-type", "only-of-type", "nth-child", "nth-last-child", "nth-of-type", "nth-last-of-type"]);

// `An+B`: whether the 1-based `index` is one of its terms.
function nth(formula: string, index: number) {
  const f = formula.replace(/\s+/g, "").toLowerCase();
  const [a, b] = f === "odd" ? [2, 1] : f === "even" ? [2, 0] : (() => {
    const match = /^([+-]?\d*)n([+-]\d+)?$|^([+-]?\d+)$/.exec(f);
    if (!match) return [NaN, NaN];
    if (match[3] !== undefined) return [0, Number(match[3])];
    const step = match[1] === "" || match[1] === "+" ? 1 : match[1] === "-" ? -1 : Number(match[1]);
    return [step, Number(match[2] ?? 0)];
  })();
  if (Number.isNaN(a)) return false;
  if (a === 0) return index === b;
  return (index - b) / a >= 0 && Number.isInteger((index - b) / a);
}

function matchPseudo(m: Match, el: SourceElement, name: string, argument: string | undefined): boolean {
  switch (name) {
    case "is": case "where": case "matches": case "-webkit-any":
      return splitSelectorList(argument ?? "").some((part) => matches(m, el, part));
    case "not":
      // An inexact pseudo-class inside: the page may be in the state that makes it match.
      if ([...(argument ?? "").matchAll(/:([\w-]+)/g)].some(([, inner]) => !EXACT.has(inner.toLowerCase()))) return true;
      return !splitSelectorList(argument ?? "").some((part) => matches(m, el, part));
    case "has": {
      const inside = (node: SourceElement): SourceElement[] => elementsOf(node.children).flatMap((child) => [child, ...inside(child)]);
      const siblings = siblingsOf(m, el);
      const after = siblings.slice(siblings.indexOf(el) + 1);
      return splitSelectorList(argument ?? "").some((part) => {
        const candidates = /^[+~]/.test(part) ? after.flatMap((sibling) => [sibling, ...inside(sibling)]) : inside(el);
        const scoped = { ...m, scope: el };
        return candidates.some((candidate) => matches(scoped, candidate, `:scope ${part}`));
      });
    }
    case "root": return !el.parent && el.name === "html" && el !== m.boundary;
    case "scope": return m.scope ? el === m.scope : !el.parent && el.name === "html" && el !== m.boundary;
    case "empty": return !el.children.length;
    case "link": case "any-link": return (el.name === "a" || el.name === "area") && attributeOf(m, el, "href") !== undefined;
    case "host": case "host-context": return false;
  }
  if (!EXACT.has(name)) return true;
  const siblings = siblingsOf(m, el);
  const ofType = siblings.filter((sibling) => nameOf(m, sibling) === nameOf(m, el));
  const among = (list: SourceElement[], last: boolean) => (last ? list.length - list.indexOf(el) : list.indexOf(el) + 1);
  switch (name) {
    case "first-child": return siblings[0] === el;
    case "last-child": return siblings.at(-1) === el;
    case "only-child": return siblings.length === 1;
    case "first-of-type": return ofType[0] === el;
    case "last-of-type": return ofType.at(-1) === el;
    case "only-of-type": return ofType.length === 1;
    case "nth-of-type": case "nth-last-of-type": return nth(argument ?? "", among(ofType, name === "nth-last-of-type"));
    default: {
      // nth-child, nth-last-child, with an optional `of S`.
      const of = /\sof\s/i.exec(argument ?? "");
      const list = of ? siblings.filter((sibling) => sibling === el || matches(m, sibling, argument!.slice(of.index + of[0].length))) : siblings;
      if (of && !matches(m, el, argument!.slice(of.index + of[0].length))) return false;
      return nth(of ? argument!.slice(0, of.index) : argument ?? "", among(list, name === "nth-last-child"));
    }
  }
}

function matchCompound(m: Match, el: SourceElement, compound: Compound): boolean {
  return compound.simples.every((simple) => {
    switch (simple.type) {
      case "tag": return simple.name === "*" || simple.name === nameOf(m, el);
      case "id": return attributeOf(m, el, "id") === simple.name;
      case "class": return (attributeOf(m, el, "class") ?? "").split(/[\t\n\f\r ]+/).includes(simple.name);
      case "attribute": {
        const raw = attributeOf(m, el, simple.name);
        if (raw === undefined) return false;
        if (simple.operator === undefined) return true;
        const fold = (text: string) => (simple.insensitive ? text.toLowerCase() : text);
        const value = fold(raw), wanted = fold(simple.value ?? "");
        switch (simple.operator) {
          case "=": return value === wanted;
          case "~=": return value.split(/[\t\n\f\r ]+/).includes(wanted);
          case "|=": return value === wanted || value.startsWith(`${wanted}-`);
          case "^=": return !!wanted && value.startsWith(wanted);
          case "$=": return !!wanted && value.endsWith(wanted);
          default: return !!wanted && value.includes(wanted);
        }
      }
      // A pseudo-element styles a part of the element; one that crosses a shadow boundary doesn't match here.
      case "pseudo": return simple.element || ["before", "after", "first-line", "first-letter"].includes(simple.name)
        ? !["slotted", "part"].includes(simple.name)
        : matchPseudo(m, el, simple.name, simple.argument);
      default: return false;
    }
  });
}

// Whether compounds `from`..`index` match with compound `index` on `el`.
function matchFrom(m: Match, el: SourceElement, compounds: Compound[], index: number, from: number): boolean {
  if (!matchCompound(m, el, compounds[index])) return false;
  if (index === from) return true;
  const combinator = compounds[index].combinator;
  if (combinator === ">" || combinator === " ") {
    for (let up = parentOf(m, el); up; up = combinator === ">" ? undefined : parentOf(m, up)) {
      if (matchFrom(m, up, compounds, index - 1, from)) return true;
    }
    return false;
  }
  const siblings = siblingsOf(m, el);
  const at = siblings.indexOf(el);
  const before = combinator === "+" ? siblings.slice(Math.max(at - 1, 0), at) : siblings.slice(0, at);
  return before.some((sibling) => matchFrom(m, sibling, compounds, index - 1, from));
}

function matches(m: Match, el: SourceElement, selector: string) {
  const compounds = compoundsOf(selector);
  return !!compounds && matchFrom(m, el, compounds, compounds.length - 1, 0);
}

// ---- What each element of the made component becomes. ----

/** In the template (the component's CSS reaches it), slotted whole (its `::slotted()` twin does), or inside a slotted element (nothing does). */
type Reach = "template" | "slotted" | "inside";

/** Where copied rules go: the new component's CSS, or a card component's. */
interface Bucket {
  rules: { wrappers: string[]; selectors: string[]; declarations: string[]; path: string }[];
  /** Selectors whose rules can't follow, as written. */
  stranded: string[];
}

/** The new component, or one of the items that became a card component's instances. */
interface Territory {
  /** The element (or the item) as it is in the page. */
  root: SourceElement;
  /** The tag of its template's root element (a link-wrapped card's is an `article`). */
  rootTag: string;
  /** Its slotted elements, in source order. */
  slotted: SourceElement[];
  /** Its plan's slots, as `PlannedSlot` paths from the root. */
  slots: readonly PlannedSlot[];
  bucket: Bucket;
}

const at = (root: SourceElement, path: readonly number[]) =>
  path.reduce<SourceElement | undefined>((el, index) => (el ? elementsOf(el.children)[index] : undefined), root);

/**
 * The elements of `root` the plan's slots take whole, in source order
 * (`skip`: items that became card instances, which `names` still gets);
 * `names` gets the slot each one fills ("" for the unnamed slot).
 */
function slottedOf(root: SourceElement, slots: readonly PlannedSlot[], skip: ReadonlySet<SourceElement>, names: Map<SourceElement, string>) {
  const out = new Set<SourceElement>();
  for (const slot of slots) {
    if (slot.fixed) continue;
    if (slot.items) for (const path of slot.items) {
      const item = at(root, path);
      if (item) names.set(item, slot.name);
      if (item && !skip.has(item)) out.add(item);
    }
    // The element's own unnamed slot: its children are the fills.
    else if (!slot.path.length && !slot.name) for (const child of elementsOf(root.children)) out.add(child);
    else {
      const el = at(root, slot.path);
      if (el) out.add(el);
      if (el) names.set(el, slot.name);
    }
  }
  return [...out].sort((a, b) => a.start - b.start);
}

/** The template's root tag; the element's own when the template slots it whole. */
function rootTagOf(template: string, el: SourceElement) {
  const name = elementsOf(parseSource(template))[0]?.name;
  return !name || name === "slot" ? el.name : name;
}

/**
 * `plan` with the page's CSS for the element carried into its CSS and its
 * cards' (see the head of this file). `sheets` are the page's stylesheets
 * with imports expanded (`expandStyleImports`), in cascade order; `range` is
 * the element in `source`, as `makeComponentPlan` took it. A rule is copied
 * only where the page's own rule stops reaching an element: once the element
 * is an instance, a rule like `p a` or `h2` still reaches what the page slots
 * in, and one like `.intro .actions` the template's own elements.
 */
export function withPageCss(plan: MakeComponentPlan, source: string, range: InstanceRange, tag: string, sheets: readonly { path: string; source: string }[]): MakeComponentPlan {
  const top = elementsOf(parseSource(source));
  const all = (nodes: SourceElement[]): SourceElement[] => nodes.flatMap((el) => [el, ...all(elementsOf(el.children))]);
  const element = all(top).find((el) => el.start === range.start && el.name === range.tag.name);
  if (!element) return plan;
  const page: Match = { html: source, top };
  const own: Bucket = { rules: [], stranded: [] };
  const buckets = plan.cards.map((): Bucket => ({ rules: [], stranded: [] }));

  // Card items that became instances are territories of their own, in their card's bucket.
  const cardOf = new Map<SourceElement, number>();
  plan.cards.forEach((card, index) => {
    for (const path of card.instances) {
      const item = at(element, path);
      if (item) cardOf.set(item, index);
    }
  });
  // The slot each slotted element fills: the page writes it as its `slot` attribute.
  const slotNames = new Map<SourceElement, string>();
  const withSlot = (el: SourceElement, attributes: Map<string, string>) => {
    const name = slotNames.get(el);
    return name ? new Map([...attributes, ["slot", name]]) : attributes;
  };
  const main: Territory = { root: element, rootTag: rootTagOf(plan.template, element), slotted: slottedOf(element, plan.slots, new Set(cardOf.keys()), slotNames), slots: plan.slots, bucket: own };
  const items = new Map([...cardOf].map(([item, index]): [SourceElement, Territory] => {
    const card = plan.cards[index];
    return [item, { root: item, rootTag: rootTagOf(card.template, item), slotted: slottedOf(item, card.slots, new Set(), slotNames), slots: card.slots, bucket: buckets[index] }];
  }));
  const territoryOf = new Map<SourceElement, Territory>();
  const reachOf = new Map<SourceElement, Reach>();
  const walk = (el: SourceElement, territory: Territory, reach: Reach) => {
    const item = items.get(el);
    const here = item ?? territory;
    const now: Reach = item ? "template" : reach !== "template" ? "inside" : territory.slotted.includes(el) ? "slotted" : "template";
    territoryOf.set(el, here);
    reachOf.set(el, now);
    for (const child of elementsOf(el.children)) walk(child, here, now === "template" ? "template" : "inside");
  };
  walk(element, main, "template");

  // The page once the element is an instance: its slotted parts are the instance's children, a card's under its card
  // instance; the instances carry only the ids.
  const after: Match = { html: source, top, parents: new Map(), siblings: new Map(), attributes: new Map() };
  const idOnly = (el: SourceElement) => {
    const id = attributeOf(page, el, "id");
    return new Map(id === undefined ? [] : [["id", id]]);
  };
  const instance = (el: SourceElement, name: string, parent: SourceElement | undefined): SourceElement => {
    const made: SourceElement = { type: "element", name, tag: el.tag, start: el.start, end: el.end, children: [], parent };
    after.attributes!.set(made, withSlot(el, idOnly(el)));
    return made;
  };
  const host = instance(element, tag, element.parent);
  // The element slotted whole (a link wrapper) carries the slot attribute, not its instance.
  after.attributes!.set(host, idOnly(element));
  after.siblings!.set(host, siblingsOf(page, element).map((el) => (el === element ? host : el)));
  const fill = (parent: SourceElement, children: SourceElement[]) => {
    for (const child of children) {
      after.parents!.set(child, parent);
      after.siblings!.set(child, children);
      if (!after.attributes!.has(child)) after.attributes!.set(child, withSlot(child, attributesOf(page, child)));
    }
  };
  const cardHosts = new Map([...items].map(([item]) => [item, instance(item, plan.cards[cardOf.get(item)!].tag, host)]));
  fill(host, [...main.slotted, ...cardHosts.keys()].sort((a, b) => a.start - b.start).map((el) => cardHosts.get(el) ?? el));
  for (const [item, territory] of items) fill(cardHosts.get(item)!, territory.slotted);
  // A template on its own (`bare`): the root without its id, under its template tag. As its shadow root holds it
  // (`shadow`), each part slotted whole is a `<slot>` where it was, a repeated group one `<slot>` where its items were.
  const templates = new Map<Territory, { bare: Match; shadow: Match }>();
  const templateOf = (territory: Territory) => {
    let made = templates.get(territory);
    if (made) return made;
    const root = territory.root;
    const attributes = new Map(attributesOf(page, root));
    attributes.delete("id");
    // The slotted elements carry their `slot` attributes, as the page writes them.
    const bare: Match = { html: source, top, boundary: root, attributes: new Map([[root, attributes], ...territory.slotted.map((el): [SourceElement, Map<string, string>] => [el, withSlot(el, attributesOf(page, el))])]), names: new Map([[root, territory.rootTag]]) };
    const shadow: Match = { ...bare, attributes: new Map(bare.attributes), names: new Map(bare.names), siblings: new Map() };
    const gone = new Set<SourceElement>();
    for (const slot of territory.slots) {
      if (slot.fixed || !slot.path.length) continue;
      const group = (slot.items ?? [slot.path]).map((path) => at(root, path)).filter((el) => el !== undefined);
      if (!group.length) continue;
      shadow.names!.set(group[0], "slot");
      shadow.attributes!.set(group[0], new Map(slot.name ? [["name", slot.name]] : []));
      for (const item of group.slice(1)) gone.add(item);
    }
    for (const parent of new Set([...gone].map((el) => el.parent))) {
      const kept = parent ? elementsOf(parent.children).filter((el) => !gone.has(el)) : [];
      for (const el of kept) shadow.siblings!.set(el, kept);
    }
    templates.set(territory, made = { bare, shadow });
    return made;
  };

  const nodes = [...territoryOf.keys()];
  for (const sheet of sheets) {
    for (const rule of flatRules(sheet.source, sheet.path)) {
      const found = new Map<Bucket, string[]>();
      for (const part of rule.selectors) {
        const compounds = compoundsOf(part);
        if (!compounds) continue;
        for (const node of nodes) {
          if (!matches(page, node, part)) continue;
          const territory = territoryOf.get(node)!, reach = reachOf.get(node)!;
          // Still reached as it is: by the page, or in the template by the stylesheets its shadow root clones.
          const { bare, shadow } = templateOf(territory);
          if (matches(reach === "template" ? shadow : after, node, part)) continue;
          const bucket = territory.bucket;
          const rewritten = reach === "inside" ? undefined : rewrite(page, node, part, compounds, territory);
          // The copy must reach it: in the template, or slotted through its `::slotted()` twin.
          const rest = rewritten?.replace(/^:host(?:\s*>\s*|\s+|$)/, "");
          if (rewritten === undefined || rest === undefined
            || rest && (reach === "template" ? !matches(shadow, node, rest) : !twinReaches(rewritten, rest, node, bare, shadow))) {
            if (!bucket.stranded.includes(part)) bucket.stranded.push(part);
            continue;
          }
          const list = found.get(bucket) ?? [];
          if (!list.includes(rewritten)) list.push(rewritten);
          found.set(bucket, list);
        }
      }
      for (const [bucket, selectors] of found) bucket.rules.push({ wrappers: rule.wrappers, selectors, declarations: rule.declarations, path: rule.path });
    }
  }

  const cssPath = (name: string) => `components/${name}/${name}.css`;
  return {
    ...plan,
    css: plan.css + written(own.rules, cssPath(tag)),
    notes: [...plan.notes, ...strandedNote(own.stranded)],
    cards: plan.cards.map((card, index) => ({
      ...card,
      css: card.css + written(buckets[index].rules, cssPath(card.tag)),
      notes: [...card.notes, ...strandedNote(buckets[index].stranded)],
    })),
  };
}

/**
 * Whether the `::slotted()` twin of `selector` (`rest`: without a leading
 * `:host`) reaches `node`, slotted whole: its last compound matches the node,
 * and what comes before matches the `<slot>` that stands in its place.
 */
function twinReaches(selector: string, rest: string, node: SourceElement, bare: Match, shadow: Match) {
  const compounds = compoundsOf(rest);
  if (!slottedTwin(selector) || !compounds) return false;
  const last = compounds[compounds.length - 1];
  const prefix = rest.trim().slice(0, last.start);
  return matches(bare, node, rest.trim().slice(last.start)) && matches(shadow, node, `${prefix}*`);
}

function strandedNote(stranded: string[]) {
  if (!stranded.length) return [];
  const one = stranded.length === 1;
  return [`${one ? "1 rule" : `${stranded.length} rules`} can't follow the parts into the component: ${stranded.join(", ")}. `
    + `The component's CSS can't reach what ${one ? "it styles" : "they style"} once the element is a component; nothing was copied for ${one ? "it" : "them"}.`];
}

/**
 * `part`, which matches `node` in the page, rewritten to start at the
 * territory's root: the fewest compounds dropped so that the rest matches
 * `node` with the root on its own. Undefined when no such rest exists, or
 * when what was dropped stood beside the root (`.hero + .intro`).
 */
function rewrite(page: Match, node: SourceElement, part: string, compounds: Compound[], territory: Territory) {
  const alone: Match = { ...page, boundary: territory.root };
  const from = compounds.findIndex((_, index) => matchFrom(alone, node, compounds, compounds.length - 1, index));
  if (from < 0 || from > 0 && /[+~]/.test(compounds[from].combinator)) return undefined;
  const first = compounds[from];
  const s = part.trim();
  let lead = s.slice(first.start, first.end);
  const root = territory.root;
  if (matchCompound(alone, root, first)) {
    // The root's id moves to the instance: a compound that matched it by that id is the host.
    const id = attributeOf(page, root, "id");
    const ids = first.simples.filter((simple) => simple.type === "id" && simple.name === id);
    // A root whose tag changes (a link-wrapped card becomes an `article`) is matched by its new tag.
    const tags = root.name !== territory.rootTag ? first.simples.filter((simple) => simple.type === "tag" && simple.name === root.name) : [];
    if (ids.length || tags.length) {
      let text = "", cursor = first.start;
      for (const simple of [...ids, ...tags].sort((a, b) => a.start - b.start)) {
        text += s.slice(cursor, simple.start) + (simple.type === "tag" ? territory.rootTag : "");
        cursor = simple.end;
      }
      text += s.slice(cursor, first.end);
      // What is left of the compound after the id, when it names no element (`:hover`, `::before`), takes the root's tag.
      lead = text ? (/^[:[]/.test(text) ? `${territory.rootTag}${text}` : text)
        : compounds[from + 1]?.combinator === ">" ? `:host > ${territory.rootTag}` : ":host";
    }
  }
  return lead + s.slice(first.end);
}

// ---- Writing the copied rules. ----

// The path of `to` (a repository path) from the folder of `from`.
function relative(from: string, to: string) {
  const a = from.split("/").slice(0, -1), b = to.split("/");
  let common = 0;
  while (common < a.length && common < b.length - 1 && a[common] === b[common]) common++;
  return [...a.slice(common).map(() => ".."), ...b.slice(common)].join("/");
}

/** The copied rules as CSS for the component's stylesheet at `cssPath`, after its own rules; "" for none. */
function written(rules: Bucket["rules"], cssPath: string) {
  if (!rules.length) return "";
  const paths = [...new Set(rules.map((rule) => rule.path))];
  let out = `\n/* The rules that styled this element in ${paths.join(", ")}, rewritten to start at it. The site's stylesheets are unchanged. */\n`;
  let open: string[] = [];
  for (const rule of rules) {
    let same = 0;
    while (same < open.length && same < rule.wrappers.length && open[same] === rule.wrappers[same]) same++;
    for (let depth = open.length; depth > same; depth--) out += `${"  ".repeat(depth - 1)}}\n`;
    for (let depth = same; depth < rule.wrappers.length; depth++) out += `${"  ".repeat(depth)}${rule.wrappers[depth]} {\n`;
    open = rule.wrappers;
    const indent = "  ".repeat(open.length);
    const url = (value: string) => {
      if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(value.trim())) return undefined;
      const suffix = /[?#].*$/s.exec(value.trim())?.[0] ?? "";
      const target = resolveImportPath(rule.path, value);
      return target === undefined ? undefined : relative(cssPath, target) + suffix;
    };
    const declarations = rule.declarations.map((text) => `${indent}  ${rewriteCssUrls(text, url).replace(/\s*\n\s*/g, `\n${indent}    `)};\n`).join("");
    out += `${indent}${rule.selectors.join(`,\n${indent}`)} {\n${declarations}${indent}}\n`;
  }
  for (let depth = open.length; depth > 0; depth--) out += `${"  ".repeat(depth - 1)}}\n`;
  return out;
}
