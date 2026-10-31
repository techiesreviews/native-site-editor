// Fixture groups of a native-save spec, from its tests' Playwright tags: `@actual` needs the actual starter,
// `@native-static` the native static starter (a test can carry both); "default" holds every test with neither.
// A file mixing tagged and plain tests is in each of its groups, so its plain tests never drop out.
import { createRequire } from "node:module";

// The repo's lint dependency supplies the compiler API (TypeScript 7 has none), as in specs-affected.mjs.
const ts = createRequire(import.meta.url)("typescript-eslint-api");

export const GROUP_TAGS = ["actual", "native-static"];

// test(…) and test.only/skip/fixme/fail/slow(…) declare a test; test.describe(…) and its modifiers a group of them.
function callKind(callee) {
  if (ts.isIdentifier(callee)) return callee.text === "test" ? "test" : undefined;
  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const name = callee.name.text, base = callee.expression;
  if (ts.isIdentifier(base) && base.text === "test") {
    if (name === "describe") return "describe";
    return ["only", "skip", "fixme", "fail", "slow"].includes(name) ? "test" : undefined;
  }
  return callKind(base) === "describe" && ["only", "skip", "fixme", "serial", "parallel"].includes(name) ? "describe" : undefined;
}

// The group tags in a details object's `tag`: one string or a list of them.
function detailTags(details) {
  if (!details || !ts.isObjectLiteralExpression(details)) return [];
  const tag = details.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText() === "tag");
  if (!tag) return [];
  const values = ts.isArrayLiteralExpression(tag.initializer) ? tag.initializer.elements : [tag.initializer];
  return values.filter(ts.isStringLiteralLike).map(value => value.text.replace(/^@/, "")).filter(name => GROUP_TAGS.includes(name));
}

/** Each test's group tags, its own and its describes': one list per test declared (a title first). */
function testTags(text) {
  const source = ts.createSourceFile("spec.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const tests = [];
  const visit = (node, inherited) => {
    let tags = inherited;
    if (ts.isCallExpression(node)) {
      const kind = callKind(node.expression), [title, details] = node.arguments;
      // A bare test.skip(condition, "why") has no title first and is no test.
      if (kind && title && (ts.isStringLiteralLike(title) || ts.isTemplateExpression(title))) {
        tags = [...new Set([...inherited, ...detailTags(details)])];
        if (kind === "test") tests.push(tags);
      }
    }
    ts.forEachChild(node, child => visit(child, tags));
  };
  visit(source, []);
  return tests;
}

/** The groups a spec's tests need, plain tests first: ["default"], ["actual"], ["default", "actual"], … */
export function specTestGroups(text) {
  const tests = testTags(text);
  const groups = GROUP_TAGS.filter(group => tests.some(tags => tags.includes(group)));
  return [...!groups.length || tests.some(tags => !tags.length) ? ["default"] : [], ...groups];
}
