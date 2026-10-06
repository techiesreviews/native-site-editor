// The CSS cascade for one element, as plain data: which declaration wins each
// property and which ones lose. The preview runtime reads the rules that match
// the selected element from the CSSOM (public/native-preview-runtime.js).
// This module supports code pane rule chips, static section selectors and
// slotted CSS. Matched rules are resolved following the browser's cascade
// across layers, multiple files, `@import`, conditions, nesting, shadow DOM
// and `!important`.
//
// Sorting follows CSS Cascading 5 for author styles: importance, context
// (shadow trees), element-attached styles (`style=""`), layers, specificity,
// order of appearance. Scope proximity (`@scope`) is not modelled.
//
// The browser stays the source of truth: the runtime also sends the element's
// computed value of every declared property and, per declaration, the value
// that declaration computes to on the element (see `probe` in the runtime).
// A winner counts only when its computed value is what the browser shows;
// otherwise nothing is claimed for that property (see `resolveCascade`).
//
// The module is pure: no DOM, usable from node tests with plain data.

/** Specificity as (ids, classes / attributes / pseudo-classes, types / pseudo-elements). */
export type Specificity = [number, number, number];

export function compareSpecificity(a: Specificity, b: Specificity) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** A selector list's parts, split on top-level commas (not inside parentheses, brackets or strings). */
export function splitSelectorList(selector: string) {
  const out: string[] = [];
  let start = 0, depth = 0, quote = "";
  for (let index = 0; index <= selector.length; index++) {
    const char = selector[index] ?? ",";
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\\") index++;
    else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (char === "," && depth === 0) {
      const part = selector.slice(start, index).trim();
      if (part) out.push(part);
      start = index + 1;
    }
  }
  return out;
}

/** The most specific part of a selector list (`:is()` semantics). */
export function listSpecificity(list: string): Specificity {
  let best: Specificity = [0, 0, 0];
  for (const part of splitSelectorList(list)) {
    const value = specificity(part);
    if (compareSpecificity(value, best) > 0) best = value;
  }
  return best;
}

const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
// Pseudo-classes whose specificity is that of their most specific argument.
const MAX_ARGUMENT = new Set(["is", "not", "has", "matches", "-webkit-any", "-moz-any"]);

/**
 * The specificity of one complex selector: `:where()` counts nothing,
 * `:is()`, `:not()` and `:has()` count their most specific argument,
 * `:nth-child(… of S)` one pseudo-class plus S, `:host()` / `:host-context()`
 * one pseudo-class plus the argument, `::slotted()` one pseudo-element plus
 * the argument. A nesting selector `&` should already be replaced by
 * `:is(<parent list>)` (the runtime does); a leftover one counts nothing.
 */
export function specificity(selector: string): Specificity {
  const total: Specificity = [0, 0, 0];
  const add = (value: Specificity) => { total[0] += value[0]; total[1] += value[1]; total[2] += value[2]; };
  const s = selector;
  let index = 0;
  const ident = () => {
    const start = index;
    while (index < s.length) {
      if (s[index] === "\\") index += 2;
      else if (/[\w\-\u0080-￿]/.test(s[index])) index++;
      else break;
    }
    return s.slice(start, index);
  };
  // The text inside the parentheses starting at `index` (which is on the "(").
  const argument = () => {
    let depth = 0, quote = "";
    const start = index + 1;
    for (; index < s.length; index++) {
      const char = s[index];
      if (quote) {
        if (char === "\\") index++;
        else if (char === quote) quote = "";
      } else if (char === "\\") index++;
      else if (char === "\"" || char === "'") quote = char;
      else if (char === "(") depth++;
      else if (char === ")" && --depth === 0) break;
    }
    const text = s.slice(start, index);
    index++;
    return text;
  };
  while (index < s.length) {
    const char = s[index];
    if (char === "#") {
      index++;
      ident();
      total[0]++;
    } else if (char === ".") {
      index++;
      ident();
      total[1]++;
    } else if (char === "[") {
      let quote = "";
      for (; index < s.length; index++) {
        const c = s[index];
        if (quote) {
          if (c === "\\") index++;
          else if (c === quote) quote = "";
        } else if (c === "\"" || c === "'") quote = c;
        else if (c === "]") break;
      }
      index++;
      total[1]++;
    } else if (char === ":") {
      const element = s[index + 1] === ":";
      index += element ? 2 : 1;
      const name = ident().toLowerCase();
      const arg = s[index] === "(" ? argument() : undefined;
      if (element || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        total[2]++;
        if (name === "slotted" && arg !== undefined) add(listSpecificity(arg));
      } else if (name === "where") {
        // Counts nothing.
      } else if (MAX_ARGUMENT.has(name)) {
        if (arg !== undefined) add(listSpecificity(arg));
      } else if ((name === "nth-child" || name === "nth-last-child") && arg !== undefined) {
        total[1]++;
        const of = /\sof\s/i.exec(arg);
        if (of) add(listSpecificity(arg.slice(of.index + of[0].length)));
      } else if ((name === "host" || name === "host-context") && arg !== undefined) {
        total[1]++;
        add(listSpecificity(arg));
      } else total[1]++;
    } else if (char === "*" || char === "&") {
      index++;
      if (s[index] === "|") index++;
    } else if (char === "\\" || /[a-zA-Z_\-\u0080-￿]/.test(char)) {
      ident();
      // A namespace prefix (`svg|circle`): the type after the bar counts.
      if (s[index] === "|" && s[index + 1] !== "=") {
        index++;
        if (s[index] === "*") index++;
        else {
          ident();
          total[2]++;
        }
      } else total[2]++;
    } else if (char === "|") {
      index++;
    } else index++;
  }
  return total;
}

/**
 * Layer ranks for one tree (the document or one shadow root). `order` lists
 * every layer the tree's sheets declare, as name paths (`["a", "b"]` for
 * `a.b`; an anonymous layer is a unique name the runtime gives it), in the
 * order the browser first meets them — `@layer` statements, first use of a
 * block, nested layers after their parent.
 *
 * A rule's rank is one sibling index per level of its layer path, ended by
 * `Infinity`: rules directly in a layer sit after that layer's sublayers,
 * and unlayered rules (`[Infinity]`) after every layer. Compared element by
 * element, a larger rank is a later layer.
 */
export function layerRanks(order: readonly (readonly string[])[]) {
  interface Node { children: Map<string, Node>; }
  const root: Node = { children: new Map() };
  const register = (path: readonly string[]) => {
    let node = root;
    for (const name of path) {
      let child = node.children.get(name);
      if (!child) {
        child = { children: new Map() };
        node.children.set(name, child);
      }
      node = child;
    }
  };
  for (const path of order) register(path);
  return (path: readonly string[] = []) => {
    // A layer the order does not list (it should not happen) goes last.
    register(path);
    const rank: number[] = [];
    let node = root;
    for (const name of path) {
      rank.push([...node.children.keys()].indexOf(name));
      node = node.children.get(name)!;
    }
    rank.push(Infinity);
    return rank;
  };
}

function compareRanks(a: readonly number[], b: readonly number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? -Infinity, y = b[index] ?? -Infinity;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface CascadeDeclaration {
  /** A longhand or custom property, as the CSSOM lists it. */
  property: string;
  value: string;
  important: boolean;
  /** The shorthand the value was written with, when the longhand has no value of its own (a `var()` shorthand). */
  shorthand?: string;
  /** What this declaration computes to on the element, when the runtime could tell. */
  computed?: string;
}

export interface CascadeRule {
  /**
   * The tree the rule comes from: 0 for the element's own tree, then the
   * shadow trees of the slots it is assigned to (for `::slotted()`), then
   * its own shadow root (for `:host`). A lower number is an outer context.
   */
  context: number;
  /** The element's `style` attribute. */
  inline?: boolean;
  /** Layer name path; empty for unlayered. */
  layer?: readonly string[];
  specificity: Specificity;
  /** Order of appearance within the context. */
  order: number;
  /** Behind a condition the runtime cannot evaluate (`@container`): it may or may not apply. */
  possible?: boolean;
  /** Matches only in a user-action state (`:hover`, `:focus` …): left out of the element's resting styles. */
  state?: boolean;
  /** A state rule whose state holds right now. */
  current?: boolean;
  declarations: readonly CascadeDeclaration[];
}

export interface CascadeInput {
  rules: readonly CascadeRule[];
  /** Layer order per context, as `layerRanks` takes it. */
  layers?: Readonly<Record<number, readonly (readonly string[])[]>>;
  /** The element's computed value per declared property. Without it, nothing is checked. */
  computed?: Readonly<Record<string, string>>;
}

/**
 * - `wins`: the declaration the element shows for its property.
 * - `overridden`: loses to the winner.
 * - `unverified`: the computed check disagreed or could not be done, so no
 *   winner is claimed for the property.
 * - `inactive`: behind a `@container` query the computed value shows is not met.
 * - `state`: in a user-action state rule (`:hover` …).
 */
export type DeclarationStatus = "wins" | "overridden" | "unverified" | "inactive" | "state";

/** `wins` when it wins a property, `overridden` when all its declarations lose, else `neutral`. */
export type RuleStatus = "wins" | "overridden" | "neutral";

export interface CascadeResult {
  /** Per rule, per declaration. */
  declarations: DeclarationStatus[][];
  rules: RuleStatus[];
  /** Rule indexes for display: rules that win a property, then neutral ones, then overridden ones; each group in cascade priority order. */
  order: number[];
  /** The winning declaration per property, when there is one. */
  winners: Record<string, { rule: number; declaration: number }>;
}

interface Candidate { rule: number; declaration: number; }

/**
 * Resolves the cascade per property. With `computed`, the model is checked
 * against the browser: the declaration that should apply right now (resting
 * rules plus state rules whose state holds) must compute to the element's
 * computed value. When it does, the resting winner wins and every other
 * resting declaration is overridden; when it does not, or a value is
 * missing, the property's declarations are `unverified`. A `@container`
 * declaration that would win but does not compute to what the element shows
 * is taken as not applying (`inactive`) and the next one is tried.
 */
export function resolveCascade(input: CascadeInput): CascadeResult {
  const { rules, computed } = input;
  const rankers = new Map<number, ReturnType<typeof layerRanks>>();
  const rankOf = (rule: CascadeRule) => {
    if (!rankers.has(rule.context)) rankers.set(rule.context, layerRanks(input.layers?.[rule.context] ?? []));
    return rankers.get(rule.context)!(rule.layer ?? []);
  };
  const ranks = rules.map(rankOf);
  // Positive when rule `a` beats rule `b` for declarations of `important`.
  const compareRules = (a: number, b: number, important: boolean) => {
    const x = rules[a], y = rules[b];
    if (x.context !== y.context) return important ? x.context - y.context : y.context - x.context;
    if (!!x.inline !== !!y.inline) return x.inline ? 1 : -1;
    const layer = compareRanks(ranks[a], ranks[b]);
    if (layer) return important ? -layer : layer;
    return compareSpecificity(x.specificity, y.specificity) || x.order - y.order || a - b;
  };
  const compare = (a: Candidate, b: Candidate) => {
    const x = rules[a.rule].declarations[a.declaration], y = rules[b.rule].declarations[b.declaration];
    if (x.important !== y.important) return x.important ? 1 : -1;
    return compareRules(a.rule, b.rule, x.important);
  };

  const declarations: DeclarationStatus[][] = rules.map((rule) => rule.declarations.map(() => "unverified" as DeclarationStatus));
  const byProperty = new Map<string, Candidate[]>();
  rules.forEach((rule, ruleIndex) => rule.declarations.forEach((declaration, index) => {
    if (!byProperty.has(declaration.property)) byProperty.set(declaration.property, []);
    byProperty.get(declaration.property)!.push({ rule: ruleIndex, declaration: index });
  }));

  const winners: CascadeResult["winners"] = {};
  for (const [property, candidates] of byProperty) {
    const sorted = candidates.slice().sort((a, b) => compare(b, a));
    const decl = (c: Candidate) => rules[c.rule].declarations[c.declaration];
    const set = (c: Candidate, status: DeclarationStatus) => { declarations[c.rule][c.declaration] = status; };
    const actual = computed?.[property];
    // Container queries the computed value rules out, from the top down.
    let now = sorted.filter((c) => !rules[c.rule].state || rules[c.rule].current);
    while (computed && now.length && rules[now[0].rule].possible && actual !== undefined &&
           decl(now[0]).computed !== undefined && decl(now[0]).computed !== actual) {
      set(now[0], "inactive");
      now = now.slice(1);
    }
    const inactive = (c: Candidate) => declarations[c.rule][c.declaration] === "inactive";
    const resting = sorted.filter((c) => !rules[c.rule].state && !inactive(c));
    for (const c of sorted) if (rules[c.rule].state) set(c, "state");
    const verified = !computed || (now.length > 0 && actual !== undefined && decl(now[0]).computed === actual);
    resting.forEach((c, index) => set(c, !verified ? "unverified" : index === 0 ? "wins" : "overridden"));
    if (verified && resting.length) winners[property] = { rule: resting[0].rule, declaration: resting[0].declaration };
  }

  const status: RuleStatus[] = declarations.map((list) =>
    list.includes("wins") ? "wins" : list.length && list.every((s) => s === "overridden") ? "overridden" : "neutral");
  const group = { wins: 0, neutral: 1, overridden: 2 };
  const order = rules.map((_, index) => index)
    .sort((a, b) => group[status[a]] - group[status[b]] || compareRules(b, a, false));
  return { declarations, rules: status, order, winners };
}
