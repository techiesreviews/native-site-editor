// Fixture groups of a native-save spec, from its tests' Playwright tags: `@actual` needs the actual starter,
// `@native-static` the native static starter (a test can carry both); "default" holds every test with neither.
// A file mixing tagged and plain tests is in each of its groups, so its plain tests never drop out.
export const GROUP_TAGS = ["actual", "native-static"];

// The exact tag in either quote style: "@actual" or '@actual', never "@actual-starter".
const tagged = (text, group) => new RegExp(`(["'\`])@${group}\\1`).test(text);

// A test declaration: test(...) or test.only/skip/fixme/fail/slow(...) with a title first. A bare
// test.skip(condition, "why") is no test. Its tags sit before its callback's arrow.
const declaration = /(?<![\w$.])test(?:\.(?:only|skip|fixme|fail|slow))?\s*\(\s*["'`]/g;

/** True when some test in the text carries neither group tag (a describe's tags are not read; such a test counts as plain). */
function hasPlainTest(text) {
  for (const match of text.matchAll(declaration)) {
    const rest = text.slice(match.index), arrow = rest.indexOf("=>");
    const header = arrow < 0 ? rest : rest.slice(0, arrow);
    if (!GROUP_TAGS.some(group => tagged(header, group))) return true;
  }
  return false;
}

/** The groups a spec's tests need, plain tests first: ["default"], ["actual"], ["default", "actual"], … */
export function specTestGroups(text) {
  const groups = GROUP_TAGS.filter(group => tagged(text, group));
  if (!groups.length) return ["default"];
  return hasPlainTest(text) ? ["default", ...groups] : groups;
}
