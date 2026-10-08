import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { unreadyClipboardReads } from "../scripts/check-specs.mjs";

const read = "  const prompt = await page.evaluate(() => navigator.clipboard.readText());";
const check = (lines: string[]): number[] => unreadyClipboardReads(lines.join("\n"));

test("a read right after a one-line clipboard poll is ready", () => {
  assert.deepEqual(check(['  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Server: `");', read]), []);
});

test("a read without a poll fails", () => {
  assert.deepEqual(check(['  await page.getByRole("button", { name: "Copy" }).click();', read]), [2]);
});

test("an unrelated three-line poll followed by a read fails", () => {
  assert.deepEqual(check([
    "  await expect.poll(async () => {",
    "    return page.evaluate(() => (window as any).copied);",
    "  }).toBe(true);",
    read,
  ]), [4]);
});

test("a multi-line clipboard poll that closes just before the read is ready", () => {
  assert.deepEqual(check([
    "  await expect.poll(async () => {",
    "    return page.evaluate(() => navigator.clipboard.readText());",
    '  }).toContain("Bearer ");',
    read,
  ]), []);
});

test("a clipboard poll more than three lines before the read fails", () => {
  assert.deepEqual(check(['  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("x");', "  a();", "  b();", "  c();", read]), [5]);
});

test("a read inside a poll callback, a returned read, a keyboard copy and an opt-out pass", () => {
  assert.deepEqual(check([
    "  await expect.poll(async () => {",
    "    await page.keyboard.press(\"End\");",
    "    const text = await page.evaluate(() => navigator.clipboard.readText());",
    "    return text;",
    "  }).toBe(\"x\");",
    "  return page.evaluate(() => navigator.clipboard.readText());",
    '  await page.keyboard.press("ControlOrMeta+C");',
    read,
    "  // clipboard-ready: written by the line above synchronously.",
    read,
  ]), []);
});

test("an unmatched paren in a comment inside a poll callback does not stretch the poll over a later read", () => {
  assert.deepEqual(check([
    "  await expect.poll(async () => {",
    "    // waits for the flag (see the copy handler",
    "    return page.evaluate(() => (window as any).copied);",
    "  }).toBe(true);",
    read,
  ]), [5]);
});

test("a read before a clipboard poll on the same line fails", () => {
  assert.deepEqual(check([
    '  const early = await page.evaluate(() => navigator.clipboard.readText()); await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("x");',
  ]), [1]);
});

test("a commented-out read is ignored and a clipboard poll on the same line before the read counts", () => {
  assert.deepEqual(check([
    "  // const old = await page.evaluate(() => navigator.clipboard.readText());",
    '  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("x"); const t = await page.evaluate(() => navigator.clipboard.readText());',
  ]), []);
});

test("a read inside a template interpolation without a poll fails", () => {
  assert.deepEqual(check(["  const message = `Copied: ${await page.evaluate(() => navigator.clipboard.readText())}`;"]), [1]);
});

test("nested templates keep their interpolations as code", () => {
  assert.deepEqual(check([
    "  const outer = `a ${`b ${await page.evaluate(() => navigator.clipboard.readText())} c`} d`;",
    "  const text = `navigator.clipboard.readText() in template text is not a read`;",
  ]), [1]);
  assert.deepEqual(check([
    '  const label = `${await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`x ${"y"}`)}`;',
    read,
  ]), []);
});

test("two emoji in a comment directly before a read keep the read's position", () => {
  assert.deepEqual(check(["  /* 📋📋 */ const t = await page.evaluate(() => navigator.clipboard.readText());"]), [1]);
  assert.deepEqual(check(["  // 📋📋", read]), [2]);
});
