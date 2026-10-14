import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The script is plain JavaScript without declarations.
import { unreadyClipboardReads, fixedWaits } from "../scripts/check-specs.mjs";

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


test("fixed waits reject timeout calls and multiline Promise sleeps", () => {
  assert.deepEqual(fixedWaits([
    "await page.waitForTimeout (100);",
    "await new Promise<void>((resolve) => {",
    "  window.setTimeout(resolve, 100);",
    "});",
    "await page.evaluate(() => new Promise(done => setTimeout(done, 0)));",
  ].join("\n")), [1, 2, 5]);
});

test("fixed waits require a nonempty reason on the wait or line above", () => {
  assert.deepEqual(fixedWaits([
    "// fixed-wait: asserts no write within the debounce window",
    "await page.waitForTimeout(100);",
    "await new Promise(done => setTimeout(done, 100)); // fixed-wait: injects network latency",
    "// fixed-wait:   ",
    "await page.waitForTimeout(100);",
    "// fixed-wait: too far above",
    "other();",
    "await page.waitForTimeout(100);",
  ].join("\n")), [5, 8]);
});

test("fixed waits ignore text and comments, keeping template interpolations as code", () => {
  assert.deepEqual(fixedWaits([
    "// page.waitForTimeout(100)",
    "const text = 'new Promise(done => setTimeout(done, 100))';",
    "const text2 = `page.waitForTimeout(100)`;",
    "const text3 = `result: ${new Promise(done => setTimeout(done, 100))}`;",
    "new Promise(resolve => requestAnimationFrame(resolve));",
  ].join("\n")), [4]);
});

test("fixed waits parse object and nested Promise type arguments", () => {
  for (const type of [
    "{ done: boolean }",
    "{ done: boolean; value: Map<string, { nested: boolean }> }",
    "() => { done: boolean }",
    "{ callback: () => Promise<{ done: boolean }>; tuple: [number, boolean] }",
  ]) {
    assert.deepEqual(fixedWaits(`new Promise<${type}>(resolve => setTimeout(() => resolve({ done: true }), 100))`), [1], type);
    assert.deepEqual(fixedWaits(`new Promise<${type}>(resolve => requestAnimationFrame(resolve))`), [], type);
  }
  assert.deepEqual(fixedWaits("new Promise<\n  { done: boolean; nested: Promise<boolean> }\n>(resolve => setTimeout(resolve, 100))"), [1]);
});

test("fixed waits ignore Promise type method signatures", () => {
  assert.deepEqual(fixedWaits("await new Promise<{ setTimeout(): void }>(resolve => resolve(timer));"), []);
  assert.deepEqual(fixedWaits("await new Promise<{ setTimeout(): void }>(resolve => setTimeout(() => resolve(timer), 100));"), [1]);
});

test("fixed wait opt-outs require real line comments, including inside template interpolations", () => {
  for (const fake of [
    'const text = "// fixed-wait: fake";',
    "const text = '// fixed-wait: fake';",
    'const text = `// fixed-wait: fake`;',
    'const text = `outer ${"// fixed-wait: fake"}`;',
    '/* // fixed-wait: fake */',
  ]) {
    assert.deepEqual(fixedWaits(`${fake}\nawait page.waitForTimeout(100);`), [2], fake);
    assert.deepEqual(fixedWaits(`${fake} await page.waitForTimeout(100);`), [1], fake);
    assert.deepEqual(fixedWaits(`${fake}\nawait new Promise(resolve => setTimeout(resolve, 100));`), [2], fake);
  }
  assert.deepEqual(fixedWaits('const text = "// fixed-wait: fake"; // fixed-wait: observes a debounce\nawait page.waitForTimeout(100);'), []);
  assert.deepEqual(fixedWaits('const text = `result: ${\n// fixed-wait: injects latency in the interpolation\nnew Promise(resolve => setTimeout(resolve, 100))}`;'), []);
});

test("clipboard opt-outs also require real line comments", () => {
  assert.deepEqual(check(['const text = "// clipboard-ready: fake";', read]), [2]);
  assert.deepEqual(check(['/* // clipboard-ready: fake */', read]), [2]);
  assert.deepEqual(check([`${read} // clipboard-ready: written synchronously`]), []);
});
