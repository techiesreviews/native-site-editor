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
