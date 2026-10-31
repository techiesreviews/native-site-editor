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

const parse = text => ts.createSourceFile("spec.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const isFunction = node => Boolean(node) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

/** Each test's group tags, its own and its describes': one list per test declared (its body last). */
function testTags(text) {
  const tests = [];
  const visit = (node, inherited) => {
    let tags = inherited;
    if (ts.isCallExpression(node)) {
      const kind = callKind(node.expression), args = node.arguments;
      // A declaration ends with its body, whatever its title is; a bare test.skip(condition, "why") does not.
      if (kind && args.length >= 2 && isFunction(args.at(-1))) {
        tags = [...new Set([...inherited, ...args.length > 2 ? detailTags(args[1]) : []])];
        if (kind === "test") tests.push(tags);
      }
    }
    ts.forEachChild(node, child => visit(child, tags));
  };
  visit(parse(text), []);
  return tests;
}

/** The groups a spec's tests need, plain tests first: ["default"], ["actual"], ["default", "actual"], … */
export function specTestGroups(text) {
  const tests = testTags(text);
  const groups = GROUP_TAGS.filter(group => tests.some(tags => tags.includes(group)));
  return [...!groups.length || tests.some(tags => !tags.length) ? ["default"] : [], ...groups];
}

// A file-level fixture check: requireActualFixture() or a bare test.skip/fixme(condition, …).
function fixtureCheck(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === "requireActualFixture";
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "test"
    && ["skip", "fixme"].includes(callee.name.text) && !isFunction(call.arguments.at(-1));
}

/**
 * Lines of file-level fixture checks in a file of more than one group: there they also run before the plain tests,
 * skipping or breaking them, so a mixed file keeps them inside its tagged tests (scripts/check-specs.mjs).
 */
export function fileLevelFixtureChecks(text) {
  if (specTestGroups(text).length < 2) return [];
  const source = parse(text);
  return source.statements.filter(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
    && fixtureCheck(statement.expression)).map(statement => source.getLineAndCharacterOfPosition(statement.getStart()).line + 1);
}
