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
