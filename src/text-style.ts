import { readTextAttributes as openingAttributes } from "../fixtures/astro-starter/.astro-editor/text-attributes.mjs";

export interface SourceRange { start: number; end: number }

export interface ClassFontSizeInput {
  astroPath: string;
  astroSource: string;
  opening: SourceRange;
  files: Readonly<Record<string, string>>;
  matchedSelectors: readonly string[];
  value: string | undefined;
  preferredClass?: string;
}

export type ClassFontSizePlan =
  | { ok: true; selector: string; targetPath: string; edit: SourceRange & { expected: string; text: string } }
  | { ok: true; selector?: string; noop?: true; edits: (SourceRange & { targetPath: string; expected: string; text: string })[] }
  | { ok: false; reason: string };

interface Rule { path: string; selector: string; source: string; bodyStart: number; bodyEnd: number }

function simpleClassSelectorList(selector: string) {
  const parts = selector.split(",").map((part) => part.trim());
  return parts.length && parts.every((part) => /^\.-?[A-Za-z_][A-Za-z0-9_-]*$/.test(part)) ? parts : undefined;
}

function classNameFromOpening(source: string, opening: SourceRange, matchedSelectors: readonly string[] = [], preferredClass?: string) {
  if (!Number.isSafeInteger(opening.start) || !Number.isSafeInteger(opening.end) ||
      opening.start < 0 || opening.end <= opening.start || opening.end > source.length) return undefined;
  const text = source.slice(opening.start, opening.end);
  const attrs = openingAttributes(text)?.filter((attr) => attr.name === "class");
  if (!attrs || attrs.length !== 1 || attrs[0].value === undefined) return undefined;
  const classes = attrs[0].value.trim().split(/\s+/).filter(Boolean);
  if (!classes.length || classes.some((value) => !/^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(value))) return undefined;
  if (classes.length === 1) return classes[0];
  return preferredClass && classes.includes(preferredClass) && matchedSelectors.includes(`.${preferredClass}`) ? preferredClass : undefined;
}

function openingText(source: string, opening: SourceRange) {
  if (!Number.isSafeInteger(opening.start) || !Number.isSafeInteger(opening.end) ||
      opening.start < 0 || opening.end <= opening.start || opening.end > source.length) return undefined;
  const text = source.slice(opening.start, opening.end);
  return text[0] === "<" && text.at(-1) === ">" ? text : undefined;
}

function classlessOpening(source: string, opening: SourceRange) {
  const text = openingText(source, opening);
  const attrs = text && openingAttributes(text);
  if (!text || !attrs || attrs.some((attr) => attr.name === "class" || attr.name === "class:list")) return undefined;
  const tag = text.match(/^<\s*(h[1-6]|p|a|button)\b/i)?.[1].toLowerCase();
  if (!tag) return undefined;
  return { text, tag };
}

function removeInlineFontSize(opening: string) {
  const attrs = openingAttributes(opening)?.filter((attr) => attr.name === "style");
  if (!attrs) return undefined;
  if (!attrs.length) return opening;
  if (attrs.length !== 1 || attrs[0].value === undefined || attrs[0].valueStart === undefined || attrs[0].valueEnd === undefined) return undefined;
  const match = attrs[0];
  const styleValue = match.value!;
  const declarations = scanDeclarations(styleValue);
  if (!declarations || declarations.some(item => item.name === "font")) return undefined;
  const sizes = declarations.filter((item) => item.name === "font-size");
  if (sizes.length > 1 || sizes[0]?.important) return undefined;
  if (!sizes.length) return opening;
  const found = sizes[0];
  let removeEnd = found.end;
  if (styleValue[removeEnd] === ";") removeEnd++;
  let removeStart = found.nameStart;
  while (removeStart > found.start && /[ \t]/.test(styleValue[removeStart - 1])) removeStart--;
  const value = (styleValue.slice(0, removeStart) + styleValue.slice(removeEnd)).trim();
  if (value) return opening.slice(0, match.valueStart) + value + opening.slice(match.valueEnd);
  let start = match.start;
  while (start > 0 && /[ \t]/.test(opening[start - 1])) start--;
  return opening.slice(0, start) + opening.slice(match.end);
}

function unusedClassName(base: string, files: Readonly<Record<string, string>>) {
  for (let suffix = 1; ; suffix++) {
    const name = suffix === 1 ? base : `${base}-${suffix}`;
    const token = new RegExp(`(^|[^A-Za-z0-9_-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_-]|$)`);
    if (!Object.values(files).some((source) => token.test(source))) return name;
  }
}

function cssRegions(path: string, source: string): { source: string; offset: number }[] {
  if (/\.css$/i.test(path)) return [{ source, offset: 0 }];
  if (path.endsWith(".astro")) return [...source.matchAll(/<style>([\s\S]*?)<\/style>/gi)]
    .map((match) => ({ source: match[1], offset: match.index! + match[0].indexOf(match[1]) }));
  return [];
}

function rulesIn(path: string, source: string): Rule[] | undefined {
  const rules: Rule[] = [];
  for (const region of cssRegions(path, source)) {
    let quote = "", comment = false, depth = 0, statement = 0, ruleStart = -1, selector = "";
    for (let i = 0; i < region.source.length; i++) {
      const char = region.source[i], next = region.source[i + 1];
      if (comment) { if (char === "*" && next === "/") { comment = false; i++; } continue; }
      if (quote) { if (char === "\\") i++; else if (char === quote) quote = ""; continue; }
      if (char === "/" && next === "*") { comment = true; i++; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "{" && depth++ === 0) {
        selector = region.source.slice(statement, i).trim();
        ruleStart = i + 1;
      } else if (char === "}" && --depth === 0 && ruleStart >= 0) {
        rules.push({ path, selector, source, bodyStart: region.offset + ruleStart, bodyEnd: region.offset + i });
        statement = i + 1; ruleStart = -1;
      } else if (char === ";" && depth === 0) statement = i + 1;
      if (depth < 0) return undefined;
    }
    if (quote || comment || depth !== 0) return undefined;
  }
  return rules;
}

function declaration(rule: Rule) {
  const body = rule.source.slice(rule.bodyStart, rule.bodyEnd);
  const declarations = scanDeclarations(body);
  if (!declarations) return undefined;
  const matches = declarations.filter((item) => item.name === "font-size");
  if (matches.length !== 1 || matches[0].important) return undefined;
  return {
    start: rule.bodyStart + matches[0].valueStart,
    end: rule.bodyStart + matches[0].valueEnd,
    declarationStart: rule.bodyStart + matches[0].nameStart,
    declarationEnd: rule.bodyStart + matches[0].end,
  };
}

function ruleDeclarations(rule: Rule) {
  return scanDeclarations(rule.source.slice(rule.bodyStart, rule.bodyEnd));
}

interface Declaration {
  name: string;
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  valueStart: number;
  valueEnd: number;
  important: boolean;
}

function scanDeclarations(style: string): Declaration[] | undefined {
  const found: Declaration[] = [];
  let start = 0, colon = -1, depth = 0, blockDepth = 0, quote = "", comment = false;
  const finish = (end: number) => {
    if (colon < start) return;
    let nameStart = start;
    while (nameStart < colon) {
      while (nameStart < colon && /\s/.test(style[nameStart])) nameStart++;
      if (style.slice(nameStart, nameStart + 2) !== "/*") break;
      const close = style.indexOf("*/", nameStart + 2);
      if (close < 0 || close >= colon) break;
      nameStart = close + 2;
    }
    while (nameStart < colon && /\s/.test(style[nameStart])) nameStart++;
    let nameEnd = colon;
    while (nameEnd > nameStart && /\s/.test(style[nameEnd - 1])) nameEnd--;
    const name = style.slice(nameStart, nameEnd).toLowerCase();
    let valueStart = colon + 1;
    let valueEnd = end;
    while (valueStart < valueEnd && /\s/.test(style[valueStart])) valueStart++;
    while (valueEnd > valueStart && /\s/.test(style[valueEnd - 1])) valueEnd--;
    const important = /\s*!important\s*$/i.test(style.slice(valueStart, valueEnd));
    found.push({ name, start, end, nameStart, nameEnd, valueStart, valueEnd, important });
  };
  for (let index = 0; index <= style.length; index++) {
    const char = style[index] ?? ";", next = style[index + 1];
    if (comment) { if (char === "*" && next === "/") { comment = false; index++; } continue; }
    if (quote) { if (char === "\\") index++; else if (char === quote) quote = ""; continue; }
    if (char === "/" && next === "*") { comment = true; index++; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (blockDepth) {
      if (char === "{") blockDepth++;
      else if (char === "}" && --blockDepth === 0) { start = index + 1; colon = -1; }
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") { if (--depth < 0) return undefined; }
    else if (char === "{" && depth === 0) { blockDepth = 1; colon = -1; }
    else if (char === ":" && depth === 0 && colon < start) colon = index;
    else if (char === ";" && depth === 0) {
      finish(index);
      start = index + 1;
      colon = -1;
    }
  }
  return quote || comment || depth || blockDepth ? undefined : found;
}

function selectorMentionCount(files: Readonly<Record<string, string>>, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = new RegExp(`${escaped}(?![A-Za-z0-9_-])`, "g");
  let count = 0;
  for (const [path, source] of Object.entries(files)) {
    const regions = /\.s?css$/i.test(path) ? [{ source }] : path.endsWith(".astro")
      ? [...source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map((match) => ({ source: match[1] }))
      : [];
    for (const region of regions) count += region.source.match(token)?.length ?? 0;
  }
  return count;
}

function validValue(value: string | undefined) {
  return value === undefined || /^(?:var\(--[a-z0-9_-]+\)|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%))$/i.test(value);
}

function matchingRules(files: Readonly<Record<string, string>>, selector: string) {
  const found: Rule[] = [];
  for (const [path, source] of Object.entries(files)) {
    const rules = rulesIn(path, source);
    if (rules) found.push(...rules.filter((rule) => {
      const parts = simpleClassSelectorList(rule.selector);
      return parts?.includes(selector);
    }));
  }
  return found;
}

export function readClassFontSize(path: string, source: string, selector: string): string | undefined {
  if (!/^\.-?[A-Za-z_][A-Za-z0-9_-]*$/.test(selector)) return undefined;
  const rules = rulesIn(path, source)?.filter((rule) => simpleClassSelectorList(rule.selector)?.includes(selector)) ?? [];
  if (rules.length !== 1 || selectorMentionCount({ [path]: source }, selector) !== 1) return undefined;
  const at = declaration(rules[0]);
  return at ? source.slice(at.start, at.end) : undefined;
}

export function listClassFontSizes(path: string, source: string): { selector: string; value: string }[] {
  const rules = rulesIn(path, source);
  if (!rules) return [];
  const found: { selector: string; value: string }[] = [];
  for (const rule of rules) {
    const selectors = simpleClassSelectorList(rule.selector);
    if (!selectors) continue;
    if (rules.filter((candidate) => candidate.selector === rule.selector).length !== 1) continue;
    const at = declaration(rule);
    if (at) for (const selector of selectors)
      if (selectorMentionCount({ [path]: source }, selector) === 1)
        found.push({ selector, value: source.slice(at.start, at.end) });
  }
  return found;
}

function changedFontSizeSelectors(path: string, before: string, after: string) {
  const beforeValues = new Map(listClassFontSizes(path, before).map((item) => [item.selector, item.value]));
  const afterValues = new Map(listClassFontSizes(path, after).map((item) => [item.selector, item.value]));
  return new Set([...beforeValues.keys(), ...afterValues.keys()].filter((selector) => beforeValues.get(selector) !== afterValues.get(selector)));
}

function applyClassFontSizeEdit(source: string, edit: SourceRange & { expected: string; text: string }) {
  return source.slice(edit.start, edit.end) === edit.expected
    ? source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    : undefined;
}

function replayClassFontSizePlans(path: string, from: string, to: string, targetValues: ReadonlyMap<string, string | undefined>) {
  const astroPath = "__font-size-coverage__.astro";
  let states = new Set([from]);
  for (let step = 0; step < targetValues.size; step++) {
    if (states.has(to)) return true;
    const next = new Set<string>();
    for (const source of states) {
      const currentValues = new Map(listClassFontSizes(path, source).map((item) => [item.selector, item.value]));
      for (const [selector, value] of targetValues) {
        if (currentValues.get(selector) === value) continue;
        const className = selector.slice(1);
        // Synthetic selection lets planClassFontSize reuse class-rule parsing
        // without touching markup; only a same-path CSS edit is accepted below.
        const astroSource = `<p class="${className}"></p>`;
        const plan = planClassFontSize({
          astroPath,
          astroSource,
          opening: { start: 0, end: `<p class="${className}">`.length },
          files: { [astroPath]: astroSource, [path]: source },
          matchedSelectors: [selector],
          value,
          preferredClass: className,
        });
        if (!plan.ok || !("edit" in plan) || plan.targetPath !== path) continue;
        const updated = applyClassFontSizeEdit(source, plan.edit);
        if (updated === undefined) continue;
        if (updated === to) return true;
        next.add(updated);
        if (next.size > 64) return false;
      }
    }
    if (!next.size) return false;
    states = next;
  }
  return states.has(to);
}

/**
 * True when the only difference between `original` and `content` is confined to
 * the font-size declarations of qualifying class rules (single rule per selector,
 * single top-level font-size, at least one single-mention class selector) that a
 * live class-style patch already reflects in the preview — including removing the
 * declaration entirely (size → Default) or changing its value. Everything outside
 * those declarations must be byte-identical, so any other change (a different
 * declaration, an element-selector font-size, markup, a renamed selector) returns
 * false and the caller falls back to a full rebuild.
 *
 * Add/remove coverage replays the exact edit that {@link planClassFontSize}
 * would produce for each changed class rule, in either direction for Undo/Redo.
 * Unrelated CSS bytes still force the safe rebuild path.
 */
export function classFontSizeEditCovered(path: string, original: string, content: string): boolean {
  if (original === content) return false;
  const changedSelectors = changedFontSizeSelectors(path, original, content);
  if (!changedSelectors.size) return false;
  const before = new Map(listClassFontSizes(path, original).map((item) => [item.selector, item.value]));
  const after = new Map(listClassFontSizes(path, content).map((item) => [item.selector, item.value]));
  const selectors = new Set([...before.keys(), ...after.keys()]);
  if (changedSelectors.size > 6) return false;
  for (const selector of selectors) {
    const beforeValue = before.get(selector);
    const afterValue = after.get(selector);
    if (beforeValue === afterValue) continue;
    if (afterValue !== undefined && !validValue(afterValue)) return false;
  }
  const forwardTargets = new Map([...changedSelectors].map((selector) => [selector, after.get(selector)] as const));
  if (replayClassFontSizePlans(path, original, content, forwardTargets)) return true;
  const reverseTargets = new Map([...changedSelectors].map((selector) => [selector, before.get(selector)] as const));
  return replayClassFontSizePlans(path, content, original, reverseTargets);
}

export function planClassFontSize(input: ClassFontSizeInput): ClassFontSizePlan {
  const className = classNameFromOpening(input.astroSource, input.opening, input.matchedSelectors, input.preferredClass);
  if (!validValue(input.value)) return { ok: false, reason: "The font size is not a supported literal value." };
  if (!className) {
    const element = classlessOpening(input.astroSource, input.opening);
    if (!element) return { ok: false, reason: "Select an element with either no class or one literal class." };
    if (input.value === undefined && !/\bfont-size\s*:/i.test(element.text)) return { ok: true, noop: true, edits: [] };
    if (input.value === undefined) return { ok: false, reason: "Use the inline style editor to remove this font size." };
    const withoutSize = removeInlineFontSize(element.text);
    if (withoutSize === undefined) return { ok: false, reason: "The inline style cannot be moved safely." };
    const base = /^h[1-6]$/.test(element.tag) ? "heading-title"
      : element.tag === "a" ? "link-text"
        : element.tag === "button" ? "button-text"
          : "paragraph-text";
    const generated = unusedClassName(base, input.files);
    const insert = withoutSize.endsWith("/>") ? withoutSize.length - 2 : withoutSize.length - 1;
    const replacement = `${withoutSize.slice(0, insert)} class="${generated}"${withoutSize.slice(insert)}`;
    const page = input.files[input.astroPath];
    if (page !== input.astroSource) return { ok: false, reason: "The page source changed. Try again." };
    return { ok: true, selector: `.${generated}`, edits: [
      { targetPath: input.astroPath, ...input.opening, expected: element.text, text: replacement },
      { targetPath: input.astroPath, start: page.length, end: page.length, expected: "",
        text: `${page.endsWith("\n") ? "\n" : "\n\n"}<style>\n.${generated} { font-size: ${input.value}; }\n</style>\n` },
    ] };
  }
  const opening = openingText(input.astroSource, input.opening)!;
  const inlineStyles = openingAttributes(opening)?.filter((attr) => attr.name === "style") ?? [];
  const inlineDeclarations = inlineStyles.length === 1 && inlineStyles[0].value !== undefined
    ? scanDeclarations(inlineStyles[0].value) : inlineStyles.length ? undefined : [];
  if (!inlineDeclarations || inlineDeclarations.some((item) => item.name === "font-size" || item.name === "font"))
    return { ok: false, reason: "Remove the inline font size before editing the class rule." };
  const selector = `.${className}`;
  const mentions = input.matchedSelectors.filter((candidate) => candidate.includes(selector));
  if (mentions.some((candidate) => candidate.trim() !== selector))
    return { ok: false, reason: "A complex selector controls this class, so it cannot be edited safely." };
  const rules = matchingRules(input.files, selector);
  if (selectorMentionCount(input.files, selector) > rules.length)
    return { ok: false, reason: "The class also appears in a conditional or unsupported rule." };
  if (rules.length > 1) return { ok: false, reason: "More than one class rule could control this element." };
  if (rules.length === 1) {
    if (!input.matchedSelectors.includes(selector))
      return { ok: false, reason: "This class rule does not match the selected element. Select it again or use the code panel." };
    const rule = rules[0];
    const parsed = ruleDeclarations(rule);
    const fontSizes = parsed?.filter((item) => item.name === "font-size") ?? [];
    if (!parsed || fontSizes.length > 1 || fontSizes.some((item) => item.important) ||
        parsed.some((item) => item.name === "font"))
      return { ok: false, reason: "The class font size cannot be edited safely." };
    const at = declaration(rule);
    const body = rule.source.slice(rule.bodyStart, rule.bodyEnd);
    if (at) {
      const expected = rule.source.slice(at.start, at.end);
      if (input.value !== undefined)
        return { ok: true, selector, targetPath: rule.path,
          edit: { start: at.start, end: at.end, expected, text: input.value } };
      const start = at.declarationStart;
      let end = at.declarationEnd;
      while (end < rule.bodyEnd && /[ \t]/.test(rule.source[end])) end++;
      if (rule.source[end] === ";") end++;
      if (rule.source[end] === "\n" && rule.source.slice(start, end).includes("\n")) end++;
      return { ok: true, selector, targetPath: rule.path, edit: { start, end, expected: rule.source.slice(start, end), text: "" } };
    }
    if (input.value === undefined) return { ok: false, reason: "This class has no font size to remove." };
    if (!body.trim()) {
      const text = body.includes("\n") ? `\n  font-size: ${input.value};\n` : ` font-size: ${input.value}; `;
      return { ok: true, selector, targetPath: rule.path,
        edit: { start: rule.bodyStart, end: rule.bodyEnd, expected: body, text } };
    }
    const multiline = body.includes("\n");
    const indent = body.match(/\n([ \t]+)\S/)?.[1] ?? "  ";
    const contentEnd = rule.bodyStart + body.trimEnd().length;
    const trailing = rule.source.slice(contentEnd, rule.bodyEnd);
    const separator = body.trimEnd().endsWith(";") ? "" : ";";
    const text = multiline
      ? `${separator}${trailing.includes("\n") ? trailing : "\n"}${indent}font-size: ${input.value};\n`
      : `${separator} font-size: ${input.value};${trailing || " "}`;
    return { ok: true, selector, targetPath: rule.path,
      edit: { start: contentEnd, end: rule.bodyEnd, expected: trailing, text } };
  }
  const mentionedInCss = Object.entries(input.files).some(([path, source]) =>
    cssRegions(path, source).some((region) => region.source.includes(selector)));
  if (mentionedInCss || mentions.length)
    return { ok: false, reason: "The class is only present in a conditional or unsupported selector." };
  if (input.value === undefined) return { ok: false, reason: "This class has no font size to remove." };
  const page = input.files[input.astroPath];
  if (page !== input.astroSource) return { ok: false, reason: "The page source changed. Try again." };
  return { ok: true, selector, targetPath: input.astroPath, edit: {
    start: page.length, end: page.length, expected: "",
    text: `${page.endsWith("\n") ? "\n" : "\n\n"}<style>\n${selector} { font-size: ${input.value}; }\n</style>\n`,
  } };
}
