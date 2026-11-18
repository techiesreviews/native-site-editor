import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
// @ts-expect-error The config is plain JavaScript without declarations.
import config from "../eslint.config.mjs";

const testsConfig = config.find((entry: { files?: string[] }) => entry.files?.includes("tests/**/*.ts") && !entry.files?.includes("src/**/*.ts"));
const languageConfig = config.find((entry: { languageOptions?: { parser?: unknown } }) => entry.languageOptions?.parser);
const lint = (source: string) => new Linter().verify(source, {
  languageOptions: { parser: languageConfig.languageOptions.parser },
  rules: testsConfig.rules,
});

test("test lint rejects unknown double assertions while keeping receiver checks", () => {
  assert.ok(testsConfig.files.includes("src/**/*.test.ts"), "a test beside its code gets the test rules too");
  for (const source of ['const fake = value as unknown as Ports;', 'const fake = (value as unknown) as Ports;', 'const fake = value as unknown as { call(): void };'])
    assert.ok(lint(source).some(message => message.ruleId === "no-restricted-syntax"), source);
  assert.ok(lint('const ports = { frame: requestAnimationFrame };').some(message => message.ruleId === "no-restricted-syntax"));
});

test("test lint permits typed fakes, single assertions and a documented line escape", () => {
  for (const source of [
    'const fake = { read: () => "" } satisfies Ports;',
    'const fake: Partial<HTMLElement> = {}; const element = fake as HTMLElement;',
    '// eslint-disable-next-line no-restricted-syntax -- Intentionally malformed fixture exercises runtime validation.\nconst fake = value as unknown as Ports;',
  ]) assert.deepEqual(lint(source), [], source);
});

// Timer waits in browser tests (docs/agents/guardrails.md, "Fixed waits"): the lint rule runs scripts/check-specs.mjs's
// fixedWaits on every browser spec and helper, so `npm run lint` and the editor flag them.
const waitConfig = config.find((entry: { rules?: Record<string, unknown> }) => entry.rules?.["tests/no-fixed-wait"]);
const lintWaits = (source: string) => new Linter().verify(source, {
  languageOptions: { parser: languageConfig.languageOptions.parser },
  plugins: waitConfig?.plugins,
  rules: waitConfig?.rules,
}).map(message => [message.ruleId, message.line]);

test("the timer-wait rule covers browser specs and their helpers, not unit tests", () => {
  assert.ok(waitConfig, "a config entry turns tests/no-fixed-wait on");
  assert.equal(waitConfig.rules["tests/no-fixed-wait"], "error");
  assert.deepEqual(waitConfig.files, ["tests/**/*.spec.ts", "tests/native-save/**/*.ts", "tests/native-preview/**/*.ts"]);
});

test("the timer-wait rule rejects timeout calls, Promise sleeps and timers/promises sleeps", () => {
  for (const [source, line] of [
    ["await page.waitForTimeout(100);", 1],
    ["await new Promise<void>((done) => setTimeout(done, 100));", 1],
    ['import { setTimeout as delay } from "node:timers/promises";\nawait delay(100);', 2],
    ["import { setTimeout } from 'timers/promises';\n\nawait setTimeout(50);", 3],
    ['import * as timers from "node:timers/promises";\nawait timers.setTimeout(50);', 2],
    ['import { scheduler } from "node:timers/promises";\nawait scheduler.wait(10);', 2],
    ['import timers from "node:timers/promises";\nawait timers.setTimeout(1);', 2],
    ['import timers, { setTimeout as sleep } from "node:timers/promises";\nawait sleep(1);', 2],
  ] as const) assert.deepEqual(lintWaits(source), [["tests/no-fixed-wait", line]], source);
});

test("the timer-wait rule permits waits on the page, test time limits, guard timers and a stated reason", () => {
  for (const source of [
    'await expect(page.locator("#notice")).toBeHidden();',
    "test.setTimeout(120_000);",
    'const timer = setTimeout(() => reject(new Error("no answer")), 8000);',
    "// fixed-wait: proves that no write comes within the debounce window\nawait page.waitForTimeout(100);",
    'import { setTimeout as delay } from "node:timers/promises";\nawait delay(100); // fixed-wait: injects latency in the fake server',
    'const note = "import { setTimeout } from \\"node:timers/promises\\"; setTimeout(5)";',
  ]) assert.deepEqual(lintWaits(source), [], source);
});
