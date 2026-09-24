// Finds the stylesheets and rules behind a selected preview element, so the
// code pane can open the stylesheet beside the page and highlight its rules.
export interface StyleRule {
  path: string;
  selector: string;
  // Byte range of the whole rule (selector list through closing brace).
  start: number;
  end: number;
  specificity: number;
}

// CSS specificity (ids, classes/attributes/pseudo-classes, types) as one number.
export function specificity(selector: string) {
  let rest = selector.replace(/::?(not|is|where|has)\([^)]*\)/g, " ");
  const ids = (rest.match(/#[\w-]+/g) ?? []).length;
  rest = rest.replace(/#[\w-]+/g, " ");
  const classes = (rest.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g) ?? []).filter((s) => !s.startsWith("::")).length;
  rest = rest.replace(/\.[\w-]+|\[[^\]]*\]|::?[\w-]+(\([^)]*\))?/g, " ");
  const types = (rest.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return ids * 65536 + classes * 256 + types;
}

// The CSS blocks of a file with their byte offsets: a stylesheet is one block;
// an HTML page or component contributes each of its <style> elements.
function styleBlocks(path: string, content: string) {
  if (!/\.html$/.test(path)) return [{ offset: 0, css: content }];
  const blocks: { offset: number; css: string }[] = [];
  for (const match of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    blocks.push({ offset: match.index + match[0].indexOf(match[1]), css: match[1] });
  return blocks;
}

function splitSelectorList(selector: string) {
  const out: string[] = [];
  let start = 0, depth = 0, quote = "";
  for (let index = 0; index <= selector.length; index++) {
    const char = selector[index] ?? ",";
    if (quote) {
      if (char === quote && selector[index - 1] !== "\\") quote = "";
    } else if (char === "'" || char === "\"") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth) depth--;
    else if (char === "," && depth === 0) {
      const part = selector.slice(start, index).replace(/\s+/g, " ").trim();
      if (part) out.push(part);
      start = index + 1;
    }
  }
  return out;
}

function comparableSelector(selector: string) {
  return selector.replace(/\s*([>+~])\s*/g, "$1").replace(/\s+/g, " ").trim();
}

// Style rules in a block with their selector lists; at-rules such as @media
// are descended into. Comments are blanked so offsets stay intact.
function scanRules(css: string) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  const rules: { start: number; end: number; selectors: string[] }[] = [];
  let boundary = 0;
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (char === ";" || char === "}") boundary = index + 1;
    else if (char === "{") {
      const prelude = clean.slice(boundary, index);
      const trimmedPrelude = prelude.trim();
      const start = boundary + (prelude.length - prelude.trimStart().length);
      boundary = index + 1;
      let depth = 0;
      let end = index;
      for (; end < clean.length; end++) {
        if (clean[end] === "{") depth++;
        else if (clean[end] === "}" && --depth === 0) break;
      }
      if (!trimmedPrelude) continue;
      if (/^@(?:-[\w]+-)?keyframes\b/i.test(trimmedPrelude)) {
        index = end;
        boundary = Math.min(end + 1, clean.length);
        continue;
      }
      if (trimmedPrelude.startsWith("@")) continue;
      rules.push({
        start,
        end: Math.min(end + 1, clean.length),
        selectors: splitSelectorList(prelude),
      });
    }
  }
  return rules;
}

export function findStyleRulesInSources(
  files: Readonly<Record<string, string>>,
  matches: readonly { path: string; selector: string; ruleIndex?: number }[],
): StyleRule[] {
  const wanted = new Map<string, Set<string>>();
  const wantedRuleIndexes = new Map<string, Map<number, string>>();
  const specificityByKey = new Map<string, number>();
  for (const match of matches) {
    if (!wanted.has(match.path)) wanted.set(match.path, new Set());
    wanted.get(match.path)!.add(match.selector);
    specificityByKey.set(`${match.path}\n${match.selector}`, specificity(match.selector));
    if (match.ruleIndex !== undefined) {
      if (!wantedRuleIndexes.has(match.path)) wantedRuleIndexes.set(match.path, new Map());
      wantedRuleIndexes.get(match.path)!.set(match.ruleIndex, match.selector);
    }
  }
  const rules: StyleRule[] = [];
  for (const [path, content] of Object.entries(files)) {
    const selectors = wanted.get(path);
    if (!selectors) continue;
    const ruleIndexes = wantedRuleIndexes.get(path);
    let ruleIndex = 0;
    for (const block of styleBlocks(path, content)) {
      for (const rule of scanRules(block.css)) {
        const indexedSelector = ruleIndexes?.get(ruleIndex);
        const selector = indexedSelector ?? rule.selectors.find((part) => selectors.has(part));
        ruleIndex++;
        if (selector === undefined) continue;
        if (indexedSelector !== undefined &&
            !rule.selectors.map(comparableSelector).includes(comparableSelector(indexedSelector))) continue;
        if (ruleIndexes && indexedSelector === undefined) continue;
        rules.push({
          path,
          selector,
          start: block.offset + rule.start,
          end: block.offset + rule.end,
          specificity: specificityByKey.get(`${path}\n${selector}`) ?? specificity(selector),
        });
      }
    }
  }
  const rank = (path: string) => /^src\/components\/.+\.css$/.test(path) ? 1 : 0;
  return rules.sort((a, b) => b.specificity - a.specificity || rank(b.path) - rank(a.path) || a.path.localeCompare(b.path) || b.start - a.start);
}
