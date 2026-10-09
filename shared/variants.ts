// A component's variants are the data-* attributes its own CSS styles on
// :host(). Read source rules, including nesting, without a DOM or CSSOM so
// the editor and Worker share the same choices, conditions and warnings.
// Leaving an attribute off gives the default look; comments carry no metadata.

import { splitSelectorList } from "./cascade";
import { blockEnd, preludeEnd, skipSpace, withoutComments } from "./slotted-css";

export interface VariantValue { value: string; label: string; conditions: string[] }
export interface Variant {
  attribute: string;
  label: string;
  kind: "choice" | "yes-no";
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
      const name = /^@([\w-]+)/.exec(text)?.[1].toLowerCase() ?? "";
      if (!GROUPING.has(name)) { pos = blockEnd(css, stop); continue; }
      stack.push(context);
      context = { ...context, conditions: name === "media" || name === "container" ? [...context.conditions, text] : context.conditions };
    } else if (context.style && /^--[\w-]*\s*:/.test(text)) {
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

interface Attribute { name: string; operator: string; value?: string; absent: boolean; raw: string }
function readAttribute(raw: string): Omit<Attribute, "absent"> | undefined {
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
        state = { attributes: [{ ...attribute, absent: negated && !attribute.operator }], canBeTrue: false, canBeFalse: true };
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
function recordCondition(occurrences: Occurrences, chain: string[]) {
  if (!chain.length) occurrences.unconditional = true;
  else {
    const condition = chain.join(" and ");
    if (!occurrences.conditions.includes(condition)) occurrences.conditions.push(condition);
  }
}
const newOccurrences = (): Occurrences => ({ unconditional: false, conditions: [] });
const conditionsOf = (occurrences: Occurrences) => occurrences.unconditional ? [] : occurrences.conditions;

export function componentVariants(css: string, options: { scriptAttributes?: Iterable<string> } = {}): { variants: Variant[]; warnings: VariantWarning[] } {
  const excluded = new Set(Array.from(options.scriptAttributes ?? [], (name) => name.toLowerCase()));
  const allowed = (name: string) => name !== "data-empty" && name !== "data-unloaded" && !name.startsWith("data-native-") && !excluded.has(name);
  const axes = new Map<string, { values: Map<string, Occurrences>; rules: Occurrences; choices: Occurrences; defaultValue?: string }>();
  const warnings: VariantWarning[] = [];
  const warned = new Set<string>();
  let defaultLook = false;
  walkStyleRules(css, ({ selectors, conditions, offset }) => {
    const hosts: { attributes: Attribute[]; bare: boolean }[] = [];
    for (const { authored, resolved } of selectors) {
      const compound = resolved.slice(0, compoundEnd(resolved));
      const host = /^:host(?:\(|(?=[^\w-]|$))/i.exec(compound);
      if (!host) { defaultLook = true; continue; }
      const functional = compound[5] === "(";
      const close = functional ? closing(compound, 5) : 4;
      const outside = readCompoundAttributes(compound.slice(close + 1)).attributes;
      if (outside.length) {
        for (const attribute of outside) {
          const key = `${offset}:${authored}:${attribute.name}`;
          if (warned.has(key)) continue;
          warned.add(key);
          const argument = functional ? compound.slice(6, close) : "";
          warnings.push({ kind: "host-without-parentheses", selector: authored, attribute: attribute.name, fix: `:host(${argument}${attribute.raw}) { … }`, offset });
        }
        continue;
      }
      const read = readCompoundAttributes(functional ? compound.slice(6, close) : "");
      if (read.canBeTrue) defaultLook = true;
      hosts.push({ attributes: read.attributes, bare: !functional });
      for (const attribute of read.attributes) {
        if (!allowed(attribute.name) || attribute.absent || (attribute.operator && attribute.operator !== "=")) continue;
        let axis = axes.get(attribute.name);
        if (!axis) { axis = { values: new Map(), rules: newOccurrences(), choices: newOccurrences() }; axes.set(attribute.name, axis); }
        recordCondition(axis.rules, conditions);
        // `[data-x=""]` matches the bare attribute, so it reads as presence.
        if (attribute.value) {
          recordCondition(axis.choices, conditions);
          let occurrences = axis.values.get(attribute.value);
          if (!occurrences) { occurrences = newOccurrences(); axis.values.set(attribute.value, occurrences); }
          recordCondition(occurrences, conditions);
        }
      }
    }
    for (const host of hosts) for (const attribute of host.attributes) {
      if (attribute.operator !== "=" || !attribute.value) continue;
      const axis = axes.get(attribute.name);
      if (axis && axis.defaultValue === undefined && hosts.some((other) => other !== host && (other.bare || other.attributes.some((absent) => absent.name === attribute.name && absent.absent))))
        axis.defaultValue = attribute.value;
    }
  });
  const variants: Variant[] = [];
  for (const [attribute, axis] of axes) {
    const choice = [...axis.values.keys()].some((value) => value !== "true" && value !== "false");
    const values = choice ? [...axis.values].map(([value, occurrences]) => ({ value, label: valueLabel(value), conditions: conditionsOf(occurrences) })) : [];
    const conditions = conditionsOf(choice ? axis.choices : axis.rules);
    variants.push({ attribute, label: variantLabel(attribute), kind: choice ? "choice" : "yes-no", values, conditions, ...(axis.defaultValue === undefined ? {} : { defaultValue: axis.defaultValue }) });
  }
  if (variants.length && !defaultLook) warnings.push({ kind: "no-default-look" });
  return { variants, warnings };
}

export function valueLabel(value: string) {
  const label = value.replace(/[-_]+/g, " ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}
export function variantLabel(attribute: string) { return valueLabel(attribute.replace(/^data-/i, "")); }
