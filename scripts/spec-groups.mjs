// Fixture groups of a native-save spec, from its tests' Playwright tags: `@actual` needs the actual starter,
// `@native-static` the native static starter (a test can carry both); "default" holds every test with neither.
// A file mixing tagged and plain tests is in each of its groups, so its plain tests never drop out.
export const GROUP_TAGS = ["actual", "native-static"];

// The exact tag in either quote style: "@actual" or '@actual', never "@actual-starter".
const tagged = (text, group) => new RegExp(`(["'\`])@${group}\\1`).test(text);

/** The text with string contents and comments blanked (same length, quotes kept), so code can be scanned safely. */
function codeOnly(text) {
  const out = [...text];
  const blank = (from, to) => { for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " "; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "/" && text[i + 1] === "/") { const end = text.indexOf("\n", i); blank(i, end < 0 ? text.length : end); i = end < 0 ? text.length : end; }
    else if (char === "/" && text[i + 1] === "*") { const end = text.indexOf("*/", i + 2); const stop = end < 0 ? text.length : end + 2; blank(i, stop); i = stop - 1; }
    else if (char === '"' || char === "'" || char === "`") {
      // A template's ${…} parts are blanked with it: nothing in them is a test.
      let j = i + 1;
      while (j < text.length && text[j] !== char) j += text[j] === "\\" ? 2 : 1;
      blank(i + 1, j); i = j;
    }
  }
  return out.join("");
}

// A test or describe call with a title first; a bare test.skip(condition, "why") is no test.
const declaration = /(?<![\w$.])test(?:\.(describe(?:\.(?:only|skip|fixme|serial|parallel))?|only|skip|fixme|fail|slow))?\s*\(\s*["'`]/g;

/** True when some test carries neither group tag, on itself or on a test.describe around it. */
function hasPlainTest(text) {
  const code = codeOnly(text);
  const calls = [...code.matchAll(declaration)].map(match => {
    const quote = match.index + match[0].length - 1, titleEnd = code.indexOf(code[quote], quote + 1) + 1;
    // Its tags sit between the title and the callback, which opens with async, function, ( or an arrow.
    const rest = code.slice(titleEnd), open = rest.search(/=>|\bfunction\b|\basync\b|\(/);
    const headerEnd = titleEnd + (open < 0 ? rest.length : open);
    const tags = GROUP_TAGS.filter(group => tagged(text.slice(titleEnd, headerEnd), group));
    let end = headerEnd;
    if (match[1]?.startsWith("describe")) {
      // The describe's body: its callback's braces, matched in the blanked text.
      let depth = 0;
      for (let i = code.indexOf("{", headerEnd); i >= 0 && i < code.length; i++) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}" && --depth === 0) { end = i; break; }
      }
    }
    return { start: match.index, end, describe: Boolean(match[1]?.startsWith("describe")), tags };
  });
  const describes = calls.filter(call => call.describe && call.tags.length);
  return calls.some(call => !call.describe && !call.tags.length
    && !describes.some(scope => scope.start < call.start && call.start < scope.end));
}

/** The groups a spec's tests need, plain tests first: ["default"], ["actual"], ["default", "actual"], … */
export function specTestGroups(text) {
  const groups = GROUP_TAGS.filter(group => tagged(text, group));
  if (!groups.length) return ["default"];
  return hasPlainTest(text) ? ["default", ...groups] : groups;
}
