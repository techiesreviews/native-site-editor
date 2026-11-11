// The Tweak section of the design board's right panel (Orbit TOOLS-204): a part's real CSS values, read from the
// stylesheets that style it (the theme tokens from src/theme.css its rules use, and its own rules' colours, spacing,
// corners, shadows and font sizes), edited by hand on its live cell only. Edits never leave the page: "Send to agent"
// copies them as a plain-text change request for an agent to make in the code.

export type Side = "light" | "dark";
export type TweakKind = "colour" | "spacing" | "corner" | "shadow" | "type";
export const KIND_NAMES: Record<TweakKind, string> = { colour: "Colours", spacing: "Spacing", corner: "Corners", shadow: "Shadows", type: "Font size" };
const KIND_ORDER: readonly TweakKind[] = ["colour", "spacing", "corner", "shadow", "type"];

/** One value the panel offers: a theme token, or a declaration of one of the part's own rules. */
export interface TweakField {
  /** `token:<name>` or `rule:<selector>|<property>`. */
  id: string;
  kind: TweakKind;
  token?: string;
  selector?: string;
  /** A rule's property, or the first property a token is used for. */
  property: string;
  /** A token's uses in the part's rules, as `<selector> { <property> }`. */
  usedBy: string[];
  before: Record<Side, string>;
  /** Colours are edited for each theme on its own; every other value has one value for both. */
  themed: boolean;
}
/** The values after editing, both sides, by field id. */
export type Edits = Record<string, Record<Side, string>>;

const SIDES: readonly Side[] = ["light", "dark"];
const BOX = ["top", "right", "bottom", "left", "block", "inline", "block-start", "block-end", "inline-start", "inline-end"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left", "start-start", "start-end", "end-start", "end-end"];
/** The properties read from a rule, shorthands before the longhands they cover. */
const PROPERTIES: readonly (readonly [string, TweakKind])[] = [
  ["color", "colour"], ["background", "colour"], ["background-color", "colour"],
  ["border-color", "colour"], ...BOX.map((side) => [`border-${side}-color`, "colour"] as const),
  ["outline-color", "colour"], ["fill", "colour"], ["stroke", "colour"], ["accent-color", "colour"], ["caret-color", "colour"],
  ["padding", "spacing"], ...BOX.map((side) => [`padding-${side}`, "spacing"] as const),
  ["margin", "spacing"], ...BOX.map((side) => [`margin-${side}`, "spacing"] as const),
  ["gap", "spacing"], ["row-gap", "spacing"], ["column-gap", "spacing"],
  ["border-radius", "corner"], ...CORNERS.map((corner) => [`border-${corner}-radius`, "corner"] as const),
  ["box-shadow", "shadow"], ["text-shadow", "shadow"],
  ["font-size", "type"],
];
const KINDS = new Map(PROPERTIES);

/** Whether a shorthand read already gives `longhand`. */
function covers(shorthand: string, longhand: string): boolean {
  if (longhand.startsWith(`${shorthand}-`)) return true;
  if (shorthand === "background") return longhand === "background-color";
  if (shorthand === "gap") return longhand === "row-gap" || longhand === "column-gap";
  if (shorthand === "border-color") return /^border-.+-color$/.test(longhand);
  if (shorthand === "border-radius") return /^border-.+-radius$/.test(longhand);
  return false;
}

/** Which of the panel's groups a property belongs to; undefined for the ones it does not offer. */
export function kindOf(property: string): TweakKind | undefined {
  return KINDS.get(property);
}

/** The token a value is made of alone (`var(--x)`, with or without a fallback). */
export function soleToken(value: string): string | undefined {
  return /^\s*var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)\s*$/.exec(value)?.[1];
}

/** A selector list split at its top-level commas (not those inside `:is(…)` or quotes). */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < list.length; i++) {
    const char = list[i];
    if (quote) { if (char === quote && list[i - 1] !== "\\") quote = ""; continue; }
    if (char === "\"" || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) { out.push(list.slice(start, i).trim()); start = i + 1; }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}

/** The themes an edit changes. */
export function changedSides(field: TweakField, edit: Record<Side, string> | undefined): Side[] {
  if (!edit) return [];
  return SIDES.filter((side) => edit[side].trim() !== field.before[side]);
}

/** A value that stays inside its declaration: no `;`, braces or comment that would end it or start another rule. */
export const safe = (value: string) => value.trim() !== "" && !/[;{}]|\/\*|<\//.test(value);

/**
 * The CSS that shows the edits on the live cell only: each changed value under `scope(side)`, the live cell in that
 * theme. `:where()` adds nothing to a rule's own specificity and `:is()` keeps it, so its hover and pressed rules
 * still win as in the code, and a rule anchored above the part (`:root .x`) still matches inside the live cell.
 */
export function tweakCss(fields: readonly TweakField[], edits: Edits, scope: (side: Side) => string): string {
  const out: string[] = [];
  for (const field of fields) {
    const edit = edits[field.id];
    for (const side of changedSides(field, edit)) {
      const value = edit![side].trim();
      if (!safe(value)) continue;
      const where = `:where(${scope(side)})`;
      if (field.token) out.push(`${where} { ${field.token}: ${value}; }`);
      else out.push(`${splitSelectors(field.selector!).map((selector) => `${where} :is(${selector})`).join(", ")} { ${field.property}: ${value}; }`);
    }
  }
  return out.join("\n");
}

const fieldName = (field: TweakField) =>
  field.token ? `${field.token} (theme token in src/theme.css, used by ${field.usedBy.join(", ")})` : `${field.selector} { ${field.property} }`;

/** The plain-text change request "Send to agent" copies; "" when nothing changed. */
export function changeRequest(part: { id: string; name: string }, fields: readonly TweakField[], edits: Edits): string {
  const lines: string[] = [];
  for (const field of fields) {
    const edit = edits[field.id];
    const sides = changedSides(field, edit).filter((side) => safe(edit![side]));
    if (!sides.length) continue;
    const same = sides.length === 2 && field.before.light === field.before.dark && edit!.light.trim() === edit!.dark.trim();
    if (same) lines.push(`- ${fieldName(field)}, light and dark: ${field.before.light} → ${edit!.light.trim()}`);
    else for (const side of sides) lines.push(`- ${fieldName(field)}, ${side}: ${field.before[side]} → ${edit![side].trim()}`);
  }
  if (!lines.length) return "";
  return ["Design board change request", `Part: ${part.name} (data-part="${part.id}")`, ...lines, "Tried on the board's live cell only; nothing is in the code yet."].join("\n");
}

// ---------- Reading a part's values from its stylesheets ----------

const WIDE_KEYWORDS = /^(inherit|initial|unset|revert|revert-layer)$/i;

/**
 * The style rules of a document that apply now: inside @media and @supports only when they hold. The components
 * layer is left out: each file on it is edited whole in its own part's CSS section (a Button inside a heading, say).
 */
function styleRules(doc: Document): CSSStyleRule[] {
  const view = doc.defaultView!;
  const out: CSSStyleRule[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof view.CSSStyleRule) out.push(rule);
      else if (rule instanceof view.CSSLayerBlockRule && rule.name === "components") continue;
      else if (rule instanceof view.CSSMediaRule) { if (view.matchMedia(rule.media.mediaText).matches) walk(rule.cssRules); }
      else if (rule instanceof view.CSSSupportsRule) { if (view.CSS.supports(rule.conditionText)) walk(rule.cssRules); }
      else if (rule instanceof view.CSSGroupingRule) walk(rule.cssRules);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    walk(rules);
  }
  return out;
}

/** A rule of the part's own: it names a class, and is neither the board's (`.cat-…`) nor a forced-state copy. */
const ownSelector = (selector: string) => selector.includes(".") && !/\.cat-|data-force/.test(selector);

type Specificity = [number, number, number];
const NO_WEIGHT = new Set(["where"]);
const BY_ARGUMENT = new Set(["is", "not", "has", "matches", "-webkit-any"]);
const OLD_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
const higher = (a: Specificity, b: Specificity) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const most = (list: string) => splitSelectors(list).map(specificity).reduce((a, b) => (higher(a, b) >= 0 ? a : b), [0, 0, 0] as Specificity);

/** A complex selector's specificity (ids, classes and the like, types), as the cascade weighs it. */
export function specificity(selector: string): Specificity {
  const weight: Specificity = [0, 0, 0];
  const ident = (from: number) => { let i = from; while (i < selector.length && /[\w\-\\\u00a0-\uffff]/.test(selector[i])) i += selector[i] === "\\" ? 2 : 1; return i; };
  /** The text inside the parenthesis that opens at `open`, and the index after it closes. */
  const inside = (open: number): [string, number] => {
    let depth = 0;
    for (let i = open; i < selector.length; i++) {
      if (selector[i] === "(") depth++;
      else if (selector[i] === ")" && --depth === 0) return [selector.slice(open + 1, i), i + 1];
    }
    return [selector.slice(open + 1), selector.length];
  };
  let i = 0;
  while (i < selector.length) {
    const char = selector[i];
    if (char === "#") { weight[0]++; i = ident(i + 1); }
    else if (char === ".") { weight[1]++; i = ident(i + 1); }
    else if (char === "[") { weight[1]++; const end = selector.indexOf("]", i); i = end < 0 ? selector.length : end + 1; }
    else if (char === ":" && selector[i + 1] === ":") { weight[2]++; i = ident(i + 2); if (selector[i] === "(") i = inside(i)[1]; }
    else if (char === ":") {
      const end = ident(i + 1), name = selector.slice(i + 1, end).toLowerCase();
      let argument = "";
      i = end;
      if (selector[i] === "(") [argument, i] = inside(i);
      if (NO_WEIGHT.has(name)) continue;
      const add = BY_ARGUMENT.has(name) ? most(argument)
        : /^nth-(last-)?child$/.test(name) && / of /i.test(argument) ? most(argument.slice(argument.search(/ of /i) + 4)).map((n, k) => n + (k === 1 ? 1 : 0)) as Specificity
        : OLD_ELEMENTS.has(name) ? [0, 0, 1] : [0, 1, 0];
      for (let k = 0; k < 3; k++) weight[k] += add[k];
    }
    else if (/[a-zA-Z_\\\u00a0-\uffff-]/.test(char)) { weight[2]++; i = ident(i); }
    else i++;
  }
  return weight;
}

/**
 * The values of the parts under `roots` (each element with its descendants, read against its own document's
 * stylesheets), in the panel's order. Only declarations that win on some element count: one a later or more specific
 * rule overrides (an old prototype stylesheet's, say) would change nothing. `probes` are two hidden elements in light
 * and dark that tokens are read on.
 */
export function readFields(roots: readonly Element[], probes: Record<Side, HTMLElement>): TweakField[] {
  const byDoc = new Map<Document, Element[]>();
  for (const root of roots) {
    const list = byDoc.get(root.ownerDocument) ?? [];
    list.push(root, ...root.querySelectorAll("*"));
    byDoc.set(root.ownerDocument, list);
  }
  type Declared = { selector: string; property: string; value: string; at: number };
  type Candidate = { declared: Declared; weight: Specificity };
  const declared: Declared[] = [];
  const winners = new Set<Declared>();
  for (const [doc, elements] of byDoc) {
    const candidates = new Map<Element, Candidate[]>();
    for (const rule of styleRules(doc)) {
      const selector = rule.selectorText;
      if (!ownSelector(selector)) continue;
      const items = splitSelectors(selector);
      const matched = elements.flatMap((element) => {
        const weights = items.filter((item) => { try { return element.matches(item); } catch { return false; } }).map(specificity);
        return weights.length ? [[element, weights.reduce((a, b) => (higher(a, b) >= 0 ? a : b))] as const] : [];
      });
      if (!matched.length) continue;
      const read: Declared[] = [];
      for (const [property] of PROPERTIES) {
        if (read.some((shorthand) => covers(shorthand.property, property))) continue;
        const value = rule.style.getPropertyValue(property).trim();
        if (!value || WIDE_KEYWORDS.test(value)) continue;
        read.push({ selector, property, value, at: declared.length + read.length });
      }
      declared.push(...read);
      for (const [element, weight] of matched) {
        const list = candidates.get(element) ?? [];
        list.push(...read.map((each) => ({ declared: each, weight })));
        candidates.set(element, list);
      }
    }
    for (const list of candidates.values()) {
      for (const one of list) {
        const beaten = list.some((other) => other !== one
          && (other.declared.property === one.declared.property || covers(other.declared.property, one.declared.property))
          && (higher(other.weight, one.weight) || other.declared.at - one.declared.at) > 0);
        if (!beaten) winners.add(one.declared);
      }
    }
  }
  const rules = declared.filter((each) => winners.has(each));
  const root = probes.light.ownerDocument.documentElement;
  const isThemeToken = (name: string) => getComputedStyle(root).getPropertyValue(name).trim() !== "";
  const fields = new Map<string, TweakField>();
  for (const { selector, property, value } of rules) {
    const use = `${selector} { ${property} }`;
    const token = soleToken(value);
    if (token && isThemeToken(token)) {
      const id = `token:${token}`;
      const known = fields.get(id);
      if (known) { if (!known.usedBy.includes(use)) known.usedBy.push(use); continue; }
      const raw = getComputedStyle(probes.light).getPropertyValue(token).trim();
      const kind: TweakKind = CSS.supports("color", raw) ? "colour" : kindOf(property)!;
      const before = { light: resolve(probes.light, token, kind), dark: resolve(probes.dark, token, kind) };
      fields.set(id, { id, kind, token, property, usedBy: [use], before, themed: kind === "colour" });
      continue;
    }
    const id = `rule:${selector}|${property}`;
    if (fields.has(id)) continue;
    const kind = kindOf(property)!;
    fields.set(id, { id, kind, selector, property, usedBy: [], before: { light: value, dark: value }, themed: kind === "colour" });
  }
  return [...fields.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** A token's value as it shows in one theme: a colour or shadow worked out, anything else as written. */
function resolve(probe: HTMLElement, token: string, kind: TweakKind): string {
  if (kind === "colour" || kind === "shadow") {
    const property = kind === "colour" ? "color" : "box-shadow";
    probe.style.setProperty(property, `var(${token})`);
    const value = getComputedStyle(probe).getPropertyValue(property).trim();
    probe.style.removeProperty(property);
    return value;
  }
  return getComputedStyle(probe).getPropertyValue(token).trim();
}

/**
 * A colour as #rrggbb for the colour picker (its alpha left out), worked out on `probe` (the theme on show) first, so
 * tokens, `color-mix()` and `light-dark()` show their real colour; undefined when it is not one a picker can show.
 */
export function hexOf(value: string, probe: HTMLElement): string | undefined {
  // currentcolor takes the text's colour, which a picker cannot show.
  if (!CSS.supports("color", value) || /currentcolor/i.test(value)) return undefined;
  // Worked out under two different inherited colours: a value the probe cannot work out (a custom property only the
  // part's own rule sets) falls back to the inherited one, which then differs.
  const parent = probe.parentElement!;
  const workOut = (inherited: string) => {
    parent.style.setProperty("color", inherited);
    probe.style.setProperty("color", value);
    const result = getComputedStyle(probe).color;
    probe.style.removeProperty("color");
    parent.style.removeProperty("color");
    return result;
  };
  const worked = workOut("rgb(1, 2, 3)");
  if (worked !== workOut("rgb(4, 5, 6)")) return undefined;
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!worked || !context) return undefined;
  context.canvas.width = context.canvas.height = 1;
  // A colour the canvas cannot read leaves the test colour in place.
  const test = "#010203";
  context.fillStyle = test;
  context.fillStyle = worked;
  if (context.fillStyle === test && worked.replace(/\s/g, "") !== "rgb(1,2,3)") return undefined;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
