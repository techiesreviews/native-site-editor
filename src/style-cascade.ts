// The rules behind a selected preview element as the runtime reports them
// (public/native-preview-runtime.js, `matchingRules`), read defensively from
// its messages and resolved with the pure cascade in shared/cascade.ts.
import {
  compareSpecificity,
  listSpecificity,
  resolveCascade,
  type CascadeResult,
  type CascadeRule,
  type Specificity,
} from "../shared/cascade";

export interface NativeDeclaration {
  property: string;
  value: string;
  important: boolean;
  shorthand?: string;
  computed?: string;
}

export interface NativeSelectedRule {
  path: string;
  // The matching part of the rule's selector list, as the CSSOM writes it;
  // "style" for the element's style attribute.
  selector: string;
  // The rule's index among the style rules of its file (absent for `style`).
  ruleIndex?: number;
  // Matching parts resolved for specificity (nesting replaced by `:is()`).
  match?: string[];
  kind?: "rule" | "slotted" | "host" | "inline";
  // 0: the element's own tree; then slot trees; then its own shadow root.
  context?: number;
  // Layer name path (anonymous layers get unique names) and display name.
  layer?: string[];
  layerName?: string;
  conditions?: string[];
  importer?: string;
  possible?: boolean;
  state?: string[];
  current?: boolean;
  order?: number;
  declarations?: NativeDeclaration[];
}

export interface NativeCascade {
  // Layer order per context, in the order the browser registered them.
  layers: Record<number, string[][]>;
  // The element's computed value per declared property.
  computed?: Record<string, string>;
}

const MAX_RULES = 300;
const MAX_DECLARATIONS = 200;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown, limit = 50) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, limit) : [];
const KINDS = new Set(["rule", "slotted", "host", "inline"]);

function readDeclaration(raw: unknown): NativeDeclaration[] {
  if (!isRecord(raw) || typeof raw.property !== "string" || typeof raw.value !== "string") return [];
  const out: NativeDeclaration = { property: raw.property, value: raw.value, important: raw.important === true };
  if (typeof raw.shorthand === "string") out.shorthand = raw.shorthand;
  if (typeof raw.computed === "string") out.computed = raw.computed;
  return [out];
}

/** The runtime's matched rules, keeping those from files the project has. */
export function readSelectedRules(raw: unknown, allowedPaths: ReadonlySet<string>): NativeSelectedRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES).flatMap((item): NativeSelectedRule[] => {
    if (!isRecord(item) || typeof item.path !== "string" || typeof item.selector !== "string" || !allowedPaths.has(item.path)) return [];
    const rule: NativeSelectedRule = { path: item.path, selector: item.selector };
    if (typeof item.ruleIndex === "number" && Number.isInteger(item.ruleIndex) && item.ruleIndex >= 0) rule.ruleIndex = item.ruleIndex;
    if (Array.isArray(item.match)) rule.match = strings(item.match);
    if (typeof item.kind === "string" && KINDS.has(item.kind)) rule.kind = item.kind as NativeSelectedRule["kind"];
    if (typeof item.context === "number" && Number.isInteger(item.context) && item.context >= 0) rule.context = item.context;
    if (Array.isArray(item.layer)) rule.layer = strings(item.layer);
    if (typeof item.layerName === "string") rule.layerName = item.layerName;
    if (Array.isArray(item.conditions)) rule.conditions = strings(item.conditions);
    if (typeof item.importer === "string" && item.importer) rule.importer = item.importer;
    if (item.possible === true) rule.possible = true;
    if (Array.isArray(item.state)) {
      rule.state = strings(item.state);
      rule.current = item.current === true;
    }
    if (typeof item.order === "number" && Number.isFinite(item.order)) rule.order = item.order;
    if (Array.isArray(item.declarations)) rule.declarations = item.declarations.slice(0, MAX_DECLARATIONS).flatMap(readDeclaration);
    return [rule];
  });
}

export function readCascade(raw: unknown): NativeCascade | undefined {
  if (!isRecord(raw)) return undefined;
  const layers: NativeCascade["layers"] = {};
  if (isRecord(raw.layers)) {
    for (const [key, list] of Object.entries(raw.layers)) {
      const context = Number(key);
      if (!Number.isInteger(context) || context < 0 || !Array.isArray(list)) continue;
      layers[context] = list.slice(0, 500).filter(Array.isArray).map((path) => strings(path));
    }
  }
  const out: NativeCascade = { layers };
  if (isRecord(raw.computed)) {
    out.computed = {};
    for (const [property, value] of Object.entries(raw.computed)) if (typeof value === "string") out.computed[property] = value;
  }
  return out;
}

/** A rule's specificity: its most specific matching part; the style attribute has none. */
export function ruleSpecificity(rule: NativeSelectedRule): Specificity {
  let best: Specificity = [0, 0, 0];
  for (const part of rule.match ?? (rule.kind === "inline" ? [] : [rule.selector])) {
    const value = listSpecificity(part);
    if (compareSpecificity(value, best) > 0) best = value;
  }
  return best;
}

export function toCascadeRule(rule: NativeSelectedRule, index: number): CascadeRule {
  return {
    context: rule.context ?? 0,
    inline: rule.kind === "inline",
    layer: rule.layer ?? [],
    specificity: ruleSpecificity(rule),
    order: rule.order ?? index,
    possible: rule.possible,
    state: !!rule.state?.length,
    current: rule.current,
    declarations: rule.declarations ?? [],
  };
}

/** The cascade over the runtime's rules; checked against the browser when `cascade.computed` is there. */
export function resolveSelectedRules(rules: readonly NativeSelectedRule[], cascade: NativeCascade | undefined): CascadeResult {
  return resolveCascade({
    rules: rules.map(toCascadeRule),
    layers: cascade?.layers,
    computed: cascade?.computed,
  });
}

/** Where a rule comes from, for display: its layer, tree context, conditions and state. */
export function ruleOrigin(rule: NativeSelectedRule) {
  const layered = !!rule.layer?.length;
  const name = rule.layerName ?? "";
  const layer = rule.kind === "inline" ? "" : !layered ? "unlayered"
    : name.split(".").every((part) => part === "anonymous") ? "anonymous layer" : `@layer ${name}`;
  const context = rule.kind === "slotted" ? "::slotted" : rule.kind === "host" ? ":host" : rule.kind === "inline" ? "inline" : "";
  return { layer, context, conditions: rule.conditions ?? [], state: rule.state ?? [] };
}
