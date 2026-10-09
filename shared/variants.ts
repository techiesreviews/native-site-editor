// Read component and site variant rules without a DOM or CSSOM so the editor
// and Worker share the same choices, conditions and warnings.
// Leaving an attribute off gives the default look; comments carry no metadata.

import { splitSelectorList } from "./cascade";
import { blockEnd, preludeEnd, skipSpace, withoutComments } from "./slotted-css";

/** Statically named attributes written by site scripts; dynamic names are unknown. */
export function scriptSetAttributes(source: string): string[] {
  const tokens = source.match(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\w$]+|\?\.|\|\|=|&&=|\?\?=|[+*/%-]=|\+\+|--|===|==|=>|\S/g)?.filter((token) => !token.startsWith("//") && !token.startsWith("/*")) ?? [];
  const names = new Set<string>();
  const literal = (token = "") => /^(["'`])[\w-]+\1$/.test(token) ? token.slice(1, -1) : undefined;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (tokens[index - 1] !== "." && tokens[index - 1] !== "?.") continue;
    if ((token === "setAttribute" || token === "toggleAttribute") && tokens[index + 1] === "(") {
      const name = literal(tokens[index + 2]);
      if (name && [",", ")"].includes(tokens[index + 3])) names.add(name.toLowerCase());
    }
    if (token !== "dataset") continue;
    let key: string | undefined, end: number;
    if (tokens[index + 1] === ".") {
      key = /^[a-z_$][\w$]*$/i.test(tokens[index + 2] ?? "") ? tokens[index + 2] : undefined;
      end = index + 3;
    } else if (tokens[index + 1] === "[" && tokens[index + 3] === "]") {
      key = literal(tokens[index + 2]);
      end = index + 4;
    } else continue;
    if (key && /^(?:=|[+*/%-]=|\|\|=|&&=|\?\?=|\+\+|--)$/.test(tokens[end] ?? ""))
      names.add("data-" + key.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase()));
  }
  return [...names];
}

// The latest scan of each script path, so the edit bar and the code pane
// rescan only scripts whose content changed; paths no longer passed drop out.
const scriptCache = new Map<string, { source: string; names: string[] }>();

/** `scriptSetAttributes` over a site's scripts, cached per path and content. */
export function scriptsSetAttributes(scripts: Iterable<{ path: string; source: string }>): string[] {
  const seen = new Set<string>(), names = new Set<string>();
  for (const { path, source } of scripts) {
    seen.add(path);
    let cached = scriptCache.get(path);
    if (cached?.source !== source) scriptCache.set(path, cached = { source, names: scriptSetAttributes(source) });
    for (const name of cached.names) names.add(name);
  }
  for (const path of scriptCache.keys()) if (!seen.has(path)) scriptCache.delete(path);
  return [...names];
}

export interface VariantValue { value: string; label: string; conditions: string[] }
export interface Variant {
  attribute: string;
  label: string;
  kind: "choice" | "yes-no";
  /** Yes/no writes presence when any rule uses it; otherwise the value "true". */
  form?: "bare" | "true";
  values: VariantValue[];
  conditions: string[];
  defaultValue?: string;
}
export type VariantWarning =
  | { kind: "host-without-parentheses"; selector: string; attribute: string; fix: string; offset: number }
  | { kind: "no-default-look" };

interface StyleRule {
  selectors: { authored: string; resolved: string }[];
  conditions: string[];
  offset: number;
}
const GROUPING = new Set(["media", "supports", "layer", "container", "scope"]);

// Visit source-order rules with resolved complex selectors. Kept separate from
// the host subject reader so site stylesheet discovery can reuse this walk.
function walkStyleRules(css: string, visit: (rule: StyleRule) => void) {
  interface Context { parents: string[]; conditions: string[]; style: boolean }
  const stack: Context[] = [];
  let context: Context = { parents: [], conditions: [], style: false };
  let pos = 0;
  while (pos < css.length) {
    pos = skipSpace(css, pos);
    if (pos >= css.length) break;
    if (css[pos] === "}") {
      context = stack.pop() ?? { parents: [], conditions: [], style: false };
      pos++;
      continue;
    }
    const stop = preludeEnd(css, pos);
    if (css[stop] !== "{") {
      pos = css[stop] === ";" ? stop + 1 : stop;
      continue;
    }
    const prelude = css.slice(pos, stop);
    const text = selectorText(prelude).trim();
    if (text.startsWith("@")) {
      // A comment separates tokens here (`@media/**/print`).
      const rule = selectorText(prelude, true).replace(/\s+/g, " ").trim();
      const name = /^@([\w-]+)/.exec(rule)?.[1].toLowerCase() ?? "";
      if (!GROUPING.has(name)) { pos = blockEnd(css, stop); continue; }
      stack.push(context);
      context = { ...context, conditions: name === "media" || name === "container" ? [...context.conditions, rule] : context.conditions };
    } else if (context.style && /^--(?:[\w-]|\\[\da-f]{1,6}\s?|\\[\s\S]|[^\x00-\x7f])*\s*:/i.test(text)) {
      pos = blockEnd(css, stop);
      continue;
    } else {
      const selectors = authoredSelectors(prelude).flatMap((authored) =>
        context.parents.length
          ? context.parents.map((parent) => ({ authored, resolved: resolveNested(selectorText(authored), parent) }))
          : [{ authored, resolved: selectorText(authored) }]);
      visit({ selectors, conditions: context.conditions, offset: pos });
      stack.push(context);
      context = { ...context, parents: selectors.map(({ resolved }) => resolved), style: true };
    }
    pos = stop + 1;
  }
}

// The existing comment remover expects unquoted text. Keep strings and escapes
// intact, including literal comment delimiters inside an attribute value.
function selectorText(text: string, maskComments = false) {
  let out = "";
  for (let pos = 0; pos < text.length;) {
    const end = atomEnd(text, pos);
    out += text.startsWith("/*", pos)
      ? maskComments ? " ".repeat(end - pos) : withoutComments(text.slice(pos, end)).trim()
      : text.slice(pos, end);
    pos = end;
  }
  return out;
}

// Mask comments while splitting, then recover the authored spans. Commas in a
// comment must not split a list; warning text must still retain that comment.
function authoredSelectors(text: string) {
  const masked = selectorText(text, true);
  let cursor = 0;
  return splitSelectorList(masked).map((part) => {
    const start = masked.indexOf(part, cursor);
    const comma = masked.indexOf(",", start + part.length);
    const end = comma < 0 ? text.length : comma;
    const authored = text.slice(cursor, end).trim();
    cursor = end + 1;
    return authored;
  });
}

function escapeEnd(text: string, pos: number) {
  let end = pos + 1;
  const hex = /^[\da-f]{1,6}/i.exec(text.slice(end))?.[0];
  if (!hex) return Math.min(text.length, end + 1);
  end += hex.length;
  if (/\s/.test(text[end] ?? "")) end += text.slice(end, end + 2) === "\r\n" ? 2 : 1;
  return end;
}

// Advance over a string, escape or comment, or one ordinary character.
function atomEnd(text: string, pos: number) {
  if (text[pos] === "\\") return escapeEnd(text, pos);
  if (text.startsWith("/*", pos)) {
    const close = text.indexOf("*/", pos + 2);
    return close < 0 ? text.length : close + 2;
  }
  const quote = text[pos];
  if (quote !== '"' && quote !== "'") return pos + 1;
  let end = pos + 1;
  while (end < text.length) {
    if (text[end] === "\\") end = escapeEnd(text, end);
    else if (text[end++] === quote) break;
  }
  return end;
}

function closing(text: string, open: number) {
  const close = text[open] === "[" ? "]" : ")";
  let depth = 1;
  for (let pos = open + 1; pos < text.length;) {
    const end = atomEnd(text, pos);
    if (end === pos + 1) {
      if (text[pos] === text[open]) depth++;
      else if (text[pos] === close && --depth === 0) return pos;
    }
    pos = end;
  }
  return text.length;
}

function resolveNested(selector: string, parent: string) {
  let out = "", found = false;
  for (let pos = 0; pos < selector.length;) {
    const end = atomEnd(selector, pos);
    if (selector[pos] === "&" && end === pos + 1) { out += parent; found = true; }
    else out += selector.slice(pos, end);
    pos = end;
  }
  return found ? out : `${parent} ${selector}`;
}

function compoundEnd(selector: string) {
  for (let pos = 0; pos < selector.length;) {
    if (/[\s>+~|]/.test(selector[pos])) return pos;
    if (selector[pos] === "(" || selector[pos] === "[") pos = closing(selector, pos) + 1;
    else pos = atomEnd(selector, pos);
  }
  return selector.length;
}

function unescapeCss(text: string) {
  return text.replace(/\\(?:([\da-f]{1,6})(?:\r\n|\s)?|\r\n|[\n\r\f]|(.))/gi, (_, hex: string | undefined, char: string | undefined) => {
    if (!hex) return char ?? "";
    const point = parseInt(hex, 16);
    return String.fromCodePoint(!point || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) ? 0xfffd : point);
  });
}

function identifierEnd(text: string, pos: number) {
  while (pos < text.length) {
    if (text[pos] === "\\") pos = escapeEnd(text, pos);
    else if (/[\w\-\u0080-\uffff]/.test(text[pos])) pos++;
    else break;
  }
  return pos;
}

interface Attribute { name: string; operator: string; value?: string; absent: boolean; negated: boolean; raw: string }
function readAttribute(raw: string): Omit<Attribute, "absent" | "negated"> | undefined {
  const text = raw.slice(1, -1).trim();
  let pos = identifierEnd(text, 0);
  if (!pos) return undefined;
  const name = unescapeCss(text.slice(0, pos)).toLowerCase();
  pos = skipSpace(text, pos);
  if (pos === text.length) return { name, operator: "", raw };
  const operator = /^(?:[~|^$*]?=)/.exec(text.slice(pos))?.[0];
  if (!operator) return undefined;
  pos = skipSpace(text, pos + operator.length);
  const quoted = text[pos] === '"' || text[pos] === "'";
  const end = quoted ? atomEnd(text, pos) : identifierEnd(text, pos);
  if (end === pos || (quoted && text[end - 1] !== text[pos])) return undefined;
  const value = unescapeCss(text.slice(pos + (quoted ? 1 : 0), end - (quoted ? 1 : 0)));
  if (!/^(?:[is])?$/i.test(text.slice(end).trim())) return undefined;
  return { name, operator, value, raw };
}

// Reading attributes and testing the absent state share the same compound walk.
// Boolean possibilities preserve :is/:where alternatives and nested :not;
// non-data selectors may match with the variant attributes absent.
interface CompoundAttributes { attributes: Attribute[]; canBeTrue: boolean; canBeFalse: boolean }
function readCompoundAttributes(text: string, negated = false): CompoundAttributes {
  const attributes: Attribute[] = [];
  let canBeTrue = true, canBeFalse = false;
  for (let pos = 0; pos < text.length;) {
    let state: CompoundAttributes | undefined;
    if (text[pos] === "[") {
      const end = closing(text, pos);
      const attribute = readAttribute(text.slice(pos, end + 1));
      if (attribute?.name.startsWith("data-")) {
        state = { attributes: [{ ...attribute, absent: negated && !attribute.operator, negated }], canBeTrue: false, canBeFalse: true };
      } else state = { attributes: [], canBeTrue: true, canBeFalse: true };
      pos = end + 1;
    } else if (text[pos] === ":") {
      const end = identifierEnd(text, pos + 1);
      const name = text.slice(pos + 1, end).toLowerCase();
      if (text[end] === "(") {
        const close = closing(text, end);
        if (name === "is" || name === "where" || name === "not" || name === "host") {
          const parts = splitSelectorList(text.slice(end + 1, close)).map((part) => readCompoundAttributes(part, name === "not" ? !negated : negated));
          const yes = parts.some((part) => part.canBeTrue), no = parts.every((part) => part.canBeFalse);
          state = { attributes: parts.flatMap((part) => part.attributes), canBeTrue: name === "not" ? no : yes, canBeFalse: name === "not" ? yes : no };
        }
        pos = close + 1;
      } else pos = Math.max(pos + 1, end);
      state ??= { attributes: [], canBeTrue: true, canBeFalse: true };
    } else {
      // Classes, type selectors and other non-data constraints are unknown.
      if (!/\s/.test(text[pos])) state = { attributes: [], canBeTrue: true, canBeFalse: true };
      pos = atomEnd(text, pos);
    }
    if (state) {
      attributes.push(...state.attributes);
      canBeTrue &&= state.canBeTrue;
      canBeFalse ||= state.canBeFalse;
    }
  }
  return { attributes, canBeTrue, canBeFalse };
}

interface Occurrences { unconditional: boolean; conditions: string[] }
// Parsed site sheets are cached and shared, so callers only get read-only views.
interface ReadOccurrences { readonly unconditional: boolean; readonly conditions: readonly string[] }
interface ReadAxis {
  readonly presence: boolean;
  readonly values: ReadonlyMap<string, ReadOccurrences>;
  readonly rules: ReadOccurrences;
  readonly choices: ReadOccurrences;
  readonly defaultValue?: string;
}
function recordCondition(occurrences: Occurrences, chain: string[]) {
  if (!chain.length) occurrences.unconditional = true;
  else {
    const condition = chain.join(" and ");
    if (!occurrences.conditions.includes(condition)) occurrences.conditions.push(condition);
  }
}
const newOccurrences = (): Occurrences => ({ unconditional: false, conditions: [] });
const conditionsOf = (occurrences: ReadOccurrences) => occurrences.unconditional ? [] : occurrences.conditions;

interface Axis {
  presence: boolean;
  values: Map<string, Occurrences>;
  rules: Occurrences;
  choices: Occurrences;
  defaultValue?: string;
}
type Axes = Map<string, Axis>;
interface Subject { key: string; attributes: Attribute[]; bare: boolean }
interface SubjectAxes { readonly key: string; readonly axes: ReadonlyMap<string, ReadAxis> }
type SubjectReader = (selector: string, authored: string, offset: number) => Subject[];
const allowedAttribute = (name: string) => name !== "data-empty" && name !== "data-unloaded" && !name.startsWith("data-native-");

function readVariantAxes(css: string, read: SubjectReader, excluded: ReadonlySet<string>, onRule: (subjects: { key: string; axes: Axes }[]) => void) {
  walkStyleRules(css, ({ selectors, conditions, offset }) => {
    const ruleSubjects: { key: string; axes: Axes }[] = [];
    const matches = selectors.flatMap(({ authored, resolved }, selector) => read(resolved, authored, offset).map((subject) => ({ ...subject, selector })));
    for (const subject of matches) {
      const axes: Axes = new Map();
      ruleSubjects.push({ key: subject.key, axes });
      for (const attribute of subject.attributes) {
        if (!allowedAttribute(attribute.name) || excluded.has(attribute.name) || attribute.absent || (attribute.operator && attribute.operator !== "=")) continue;
        let axis = axes.get(attribute.name);
        if (!axis) { axis = { presence: false, values: new Map(), rules: newOccurrences(), choices: newOccurrences() }; axes.set(attribute.name, axis); }
        recordCondition(axis.rules, conditions);
        // `[data-x=""]` matches the bare attribute, so it reads as presence.
        if (!attribute.value) axis.presence = true;
        if (attribute.value) {
          recordCondition(axis.choices, conditions);
          let occurrences = axis.values.get(attribute.value);
          if (!occurrences) { occurrences = newOccurrences(); axis.values.set(attribute.value, occurrences); }
          recordCondition(occurrences, conditions);
        }
      }
    }
    for (const [index, subject] of matches.entries()) for (const attribute of subject.attributes) {
      if (attribute.operator !== "=" || !attribute.value || attribute.negated) continue;
      const axis = ruleSubjects[index].axes.get(attribute.name);
      // Only another selector in the list is an alternative; a second compound
      // of the same selector (`x[data-a=v] x`) must match as well.
      if (axis && axis.defaultValue === undefined && matches.some((other) => other.selector !== subject.selector && other.key === subject.key && (other.bare || other.attributes.some((absent) => absent.name === attribute.name && absent.absent))))
        axis.defaultValue = attribute.value;
    }
    onRule(ruleSubjects);
  });
}

function variantsOf(axes: ReadonlyMap<string, ReadAxis>): Variant[] {
  return [...axes].map(([attribute, axis]) => {
    const choice = [...axis.values.keys()].some((value) => value !== "true" && value !== "false");
    const values = choice ? [...axis.values].map(([value, occurrences]) => ({ value, label: valueLabel(value), conditions: [...conditionsOf(occurrences)] })) : [];
    const conditions = [...conditionsOf(choice ? axis.choices : axis.rules)];
    return { attribute, label: variantLabel(attribute), kind: choice ? "choice" : "yes-no", values, conditions, ...(choice ? {} : { form: axis.presence ? "bare" as const : "true" as const }), ...(axis.defaultValue === undefined ? {} : { defaultValue: axis.defaultValue }) };
  });
}

function readHost(compound: string, warn: (attribute: Attribute, fix: string) => void): CompoundAttributes | undefined {
  if (!/^:host(?:\(|(?=[^\w-]|$))/i.test(compound)) return undefined;
  const functional = compound[5] === "(";
  const close = functional ? closing(compound, 5) : 4;
  const rest = compound.slice(close + 1);
  if (rest && !rest.startsWith("::")) {
    // The host is featureless; trailing classes, attributes and pseudo-classes
    // never match. Only a pseudo-element can follow it.
    const argument = functional ? compound.slice(6, close) : "";
    const pseudo = rest.indexOf("::");
    const fix = pseudo < 0 ? `:host(${argument}${rest}) { … }` : `:host(${argument}${rest.slice(0, pseudo)})${rest.slice(pseudo)} { … }`;
    for (const attribute of readCompoundAttributes(pseudo < 0 ? rest : rest.slice(0, pseudo)).attributes) warn(attribute, fix);
    return undefined;
  }
  return readCompoundAttributes(functional ? compound.slice(6, close) : "");
}

function readComponent(css: string, scriptAttributes?: Iterable<string>) {
  const excluded = new Set(Array.from(scriptAttributes ?? [], (name) => name.toLowerCase()));
  const warnings: VariantWarning[] = [];
  const warned = new Set<string>();
  let defaultLook = false;
  const parts: Axes[] = [];
  readVariantAxes(css, (resolved, authored, offset) => {
    const compound = resolved.slice(0, compoundEnd(resolved));
    if (!/^:host(?:\(|(?=[^\w-]|$))/i.test(compound)) { defaultLook = true; return []; }
    const read = readHost(compound, (attribute, fix) => {
      const key = `${offset}:${authored}:${attribute.name}`;
      if (warned.has(key)) return;
      warned.add(key);
      warnings.push({ kind: "host-without-parentheses", selector: authored, attribute: attribute.name, fix, offset });
    });
    if (!read) return [];
    if (read.canBeTrue) defaultLook = true;
    return [{ key: "component", attributes: read.attributes, bare: compound[5] !== "(" }];
  }, excluded, (subjects) => parts.push(...subjects.map(({ axes }) => axes)));
  const axes = mergeAxes(parts);
  if (axes.size && !defaultLook) warnings.push({ kind: "no-default-look" });
  return { axes, warnings };
}

export function componentVariants(css: string, options: { scriptAttributes?: Iterable<string> } = {}): { variants: Variant[]; warnings: VariantWarning[] } {
  const { axes, warnings } = readComponent(css, options.scriptAttributes);
  return { variants: variantsOf(axes), warnings };
}

// One parsed site sheet: per rule, the variant axes of each subject that has
// any (`tag:x`, `class:x`, `every` for site `:host()`, `global`), kept in
// source order so merged values follow the cascade order of the site.
export interface SiteVariantSheet { readonly path: string; readonly rules: readonly SubjectAxes[] }
export interface SiteVariants { readonly sheets: readonly SiteVariantSheet[] }

// Compound boundaries ignore combinators inside strings and functional pseudos.
function selectorCompounds(selector: string) {
  const compounds: string[] = [];
  for (let pos = 0; pos < selector.length;) {
    if (/[\s>+~|]/.test(selector[pos])) { pos++; continue; }
    const end = pos + compoundEnd(selector.slice(pos));
    compounds.push(selector.slice(pos, end));
    pos = end;
  }
  return compounds;
}

// One compound per top-level `:is()`/`:where()` alternative (its subject
// compound), so each alternative's tag, class or global attributes stay apart.
function compoundAlternatives(compound: string): string[] {
  for (let pos = 0; pos < compound.length;) {
    if (compound[pos] === "[") { pos = closing(compound, pos) + 1; continue; }
    if (compound[pos] !== ":") { pos = atomEnd(compound, pos); continue; }
    const end = identifierEnd(compound, pos + 1);
    if (compound[end] !== "(") { pos = Math.max(pos + 1, end); continue; }
    const close = closing(compound, end);
    const name = compound.slice(pos + 1, end).toLowerCase();
    if (name !== "is" && name !== "where") { pos = close + 1; continue; }
    const rest = compound.slice(0, pos) + compound.slice(close + 1);
    return splitSelectorList(compound.slice(end + 1, close)).flatMap((alternative) => {
      const inner = selectorCompounds(alternative.trim()).at(-1) ?? "";
      // A type selector must lead the compound to be read as one.
      return compoundAlternatives(/^[\w\\\u0080-\uffff-]/.test(rest) ? rest + inner : inner + rest);
    });
  }
  return [compound];
}

// The tags and classes a compound names, or global when it names neither.
function compoundSubjects(compound: string): { keys: string[]; global: boolean } {
  const keys: string[] = [];
  let global = true;
  for (let pos = 0; pos < compound.length;) {
    const char = compound[pos];
    if (char === "[") { pos = closing(compound, pos) + 1; continue; }
    if (char === ":") {
      const end = identifierEnd(compound, pos + 1);
      const name = compound.slice(pos + 1, end).toLowerCase();
      if (name === "root" || name === "host" || name === "host-context" || compound[pos + 1] === ":") global = false;
      pos = compound[end] === "(" ? closing(compound, end) + 1 : Math.max(pos + 1, end);
      continue;
    }
    if (char === "." || char === "#") {
      const end = identifierEnd(compound, pos + 1);
      if (char === "." && end > pos + 1) keys.push(`class:${unescapeCss(compound.slice(pos + 1, end))}`);
      global = false;
      pos = Math.max(pos + 1, end);
      continue;
    }
    const end = identifierEnd(compound, pos);
    if (end > pos) {
      keys.push(`tag:${unescapeCss(compound.slice(pos, end)).toLowerCase()}`);
      global = false;
      pos = end;
    } else pos = atomEnd(compound, pos);
  }
  return { keys, global };
}

function readSiteSubjects(selector: string): Subject[] {
  const subjects: Subject[] = [];
  for (const [index, compound] of selectorCompounds(selector).entries()) {
    if (/^:host(?:\(|(?=[^\w-]|$))/i.test(compound)) {
      const read = index === 0 ? readHost(compound, () => {}) : undefined;
      if (read) subjects.push({ key: "every", attributes: read.attributes, bare: compound[5] !== "(" });
      continue;
    }
    for (const alternative of compoundAlternatives(compound)) {
      const { keys, global } = compoundSubjects(alternative);
      const read = readCompoundAttributes(alternative);
      if (global) keys.push("global");
      for (const key of new Set(keys)) subjects.push({ key, attributes: read.attributes, bare: !read.attributes.length });
    }
  }
  return subjects;
}

const SITE_CACHE_LIMIT = 128;
const siteCache = new Map<string, { source: string; sheet: SiteVariantSheet }>();
function sourceHash(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function readSiteSheet({ path, source }: { path: string; source: string }): SiteVariantSheet {
  const key = JSON.stringify([path, sourceHash(source)]);
  const cached = siteCache.get(key);
  // Compare source too so a hash collision never returns stale variants.
  if (cached?.source === source) return cached.sheet;
  const rules: SubjectAxes[] = [];
  readVariantAxes(source, readSiteSubjects, new Set(), (subjects) => rules.push(...subjects.filter(({ axes }) => axes.size)));
  const sheet = { path, rules };
  siteCache.delete(key);
  siteCache.set(key, { source, sheet });
  if (siteCache.size > SITE_CACHE_LIMIT) siteCache.delete(siteCache.keys().next().value!);
  return sheet;
}

export function siteVariants(sheets: readonly { path: string; source: string }[]): SiteVariants {
  return { sheets: sheets.map(readSiteSheet) };
}

function mergeOccurrences(target: Occurrences, source: ReadOccurrences) {
  target.unconditional ||= source.unconditional;
  for (const condition of source.conditions) if (!target.conditions.includes(condition)) target.conditions.push(condition);
}

function mergeAxes(sources: readonly ReadonlyMap<string, ReadAxis>[]) {
  const merged: Axes = new Map();
  for (const axes of sources) for (const [attribute, source] of axes) {
    let target = merged.get(attribute);
    if (!target) { target = { presence: false, values: new Map(), rules: newOccurrences(), choices: newOccurrences() }; merged.set(attribute, target); }
    target.presence ||= source.presence;
    mergeOccurrences(target.rules, source.rules);
    mergeOccurrences(target.choices, source.choices);
    target.defaultValue ??= source.defaultValue;
    for (const [value, occurrences] of source.values) {
      let values = target.values.get(value);
      if (!values) { values = newOccurrences(); target.values.set(value, values); }
      mergeOccurrences(values, occurrences);
    }
  }
  return merged;
}

export function variantsForComponent(tag: string, options: { css: string; site: SiteVariants; scriptAttributes?: Iterable<string> }): { variants: Variant[]; warnings: VariantWarning[] } {
  const { axes, warnings } = readComponent(options.css, options.scriptAttributes);
  const sources: ReadonlyMap<string, ReadAxis>[] = [axes];
  const keys = new Set([`tag:${tag.toLowerCase()}`, "every", "global"]);
  for (const sheet of options.site.sheets) for (const { key, axes } of sheet.rules) {
    if (keys.has(key)) sources.push(axes);
  }
  return { variants: variantsOf(mergeAxes(sources)), warnings };
}

export function variantsForClass(className: string, site: SiteVariants): Variant[] {
  const key = `class:${className}`;
  return variantsOf(mergeAxes(site.sheets.flatMap((sheet) => sheet.rules.filter((rule) => rule.key === key).map(({ axes }) => axes))));
}

/** Attribute-only site rules that style plain elements as well as component hosts. */
export function globalVariants(site: SiteVariants): Variant[] {
  return variantsOf(mergeAxes(site.sheets.flatMap((sheet) => sheet.rules.filter((rule) => rule.key === "global").map(({ axes }) => axes))));
}

export function valueLabel(value: string) {
  const label = value.replace(/[-_]+/g, " ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function variantLabel(attribute: string) { return valueLabel(attribute.replace(/^data-/i, "")); }
