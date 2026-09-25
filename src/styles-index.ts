// Finds the stylesheets and rules behind a selected preview element, so the
// code pane can open the stylesheet beside the page and highlight its rules.
export interface StyleRule {
  path: string;
  selector: string;
  // Byte range of the whole rule (selector list through closing brace).
  start: number;
  end: number;
  // Index of the match (in the list passed in) this rule was found for.
  match: number;
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

// Selectors compared as text. The CSSOM writes a nested rule's relative
// selector with a leading `&` (`a` inside `.card {}` reads `& a`), so a
// leading `&` is ignored on both sides.
function comparableSelector(selector: string) {
  return selector.replace(/\s*([>+~])\s*/g, "$1").replace(/\s+/g, " ").trim().replace(/^&\s*/, "");
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

// The source rules behind rules the preview matched, in the order of
// `matches`. A match with a `ruleIndex` (the CSSOM's count of style rules in
// its file) maps to that one rule, and only while its selector is still in
// the rule's selector list; one without maps to every rule of its file that
// lists the selector. Ordering is the caller's (see shared/cascade.ts).
export function findStyleRulesInSources(
  files: Readonly<Record<string, string>>,
  matches: readonly { path: string; selector: string; ruleIndex?: number }[],
): StyleRule[] {
  const scanned = new Map<string, { start: number; end: number; selectors: string[] }[]>();
  const rulesOf = (path: string) => {
    if (!scanned.has(path)) {
      const content = files[path];
      scanned.set(path, content === undefined ? [] : styleBlocks(path, content).flatMap((block) =>
        scanRules(block.css).map((rule) => ({ ...rule, start: block.offset + rule.start, end: block.offset + rule.end }))));
    }
    return scanned.get(path)!;
  };
  const rules: StyleRule[] = [];
  matches.forEach((match, index) => {
    const found = rulesOf(match.path);
    if (match.ruleIndex !== undefined) {
      const rule = found[match.ruleIndex];
      if (rule && rule.selectors.map(comparableSelector).includes(comparableSelector(match.selector)))
        rules.push({ path: match.path, selector: match.selector, start: rule.start, end: rule.end, match: index });
      return;
    }
    for (const rule of found)
      if (rule.selectors.includes(match.selector))
        rules.push({ path: match.path, selector: match.selector, start: rule.start, end: rule.end, match: index });
  });
  return rules;
}

// The declarations directly in a rule's block (not those of rules nested in
// it), with the byte range of each through its `;`, for marking overridden
// ones in the editor. `start`/`end` are the rule's range in `css`.
export function declarationRanges(css: string, start: number, end: number) {
  const clean = css.slice(0, end).replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
  const open = clean.indexOf("{", start);
  const out: { property: string; start: number; end: number }[] = [];
  if (open === -1) return out;
  let from = open + 1, depth = 0, paren = 0, quote = "";
  const flush = (to: number, next: number) => {
    const text = clean.slice(from, to);
    const name = /^\s*(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:/.exec(text);
    if (name) {
      const lead = text.length - text.trimStart().length;
      out.push({ property: name[1].toLowerCase(), start: from + lead, end: from + text.trimEnd().length + (clean[to] === ";" ? 1 : 0) });
    }
    from = next;
  };
  for (let index = open + 1; index < end; index++) {
    const char = clean[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === "\"" || char === "'") quote = char;
    else if (char === "(") paren++;
    else if (char === ")" && paren) paren--;
    else if (paren) continue;
    else if (char === "{") {
      // A nested rule: its prelude is not a declaration.
      if (depth === 0) from = index + 1;
      depth++;
    } else if (char === "}") {
      if (depth === 0) {
        flush(index, index + 1);
        break;
      }
      if (--depth === 0) from = index + 1;
    } else if (char === ";" && depth === 0) flush(index, index + 1);
  }
  return out;
}
