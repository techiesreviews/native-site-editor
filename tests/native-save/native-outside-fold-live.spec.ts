import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";

// Outside changes fold in, in a live room (ticket am-33, F-repo-13): two people share the open page with the same
// unsaved words. Sam's commit to another line folds in on both tabs; each tab's shared copy starts again from GitHub's
// new text, and both end with the same merged text, nothing doubled. Each browser of the fake GitHub has its own copy
// of the repository, so Sam's commit is made in both, with the same text (the same blob, so the same new copy); each
// tab finds it with the focus check. Default fixture group.
const file = "index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", file), "utf8");
const filler = "This section adds enough height that the preview scrolls.";
const pageErrors: string[] = [];

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
const insert = (page: Page, after: string, text: string) => page.evaluate(async ({ path, after, text }) => {
  const editor = await import("/src/components/source-editor.ts");
  const now = editor.getMountedSource(path)!;
  const at = now.indexOf(after) + after.length;
  editor.replaceActiveRange({ path, start: at, end: at, expected: "", text });
}, { path: file, after, text });
const count = (text: string, part: string) => text.split(part).length - 1;

async function browserTab(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on"); });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("in a live room both tabs take Sam's commit to another line and end with the same merged text", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  try {
    await openEditor(anna.page, baseURL);
    await openEditor(lex.page, baseURL);
    await insert(anna.page, '<h1 data-key="hero-title">', "Fresh bread: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: A native browser preview");
    const sam = indexSource.replace(filler, "Sam wrote this on GitHub.");
    for (const tab of [anna, lex]) {
      expect((await tab.page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: file, content: sam, author: "Sam" } })).status()).toBe(204);
      const commit = ((await (await tab.page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string }).commit;
      await tab.page.evaluate(() => dispatchEvent(new Event("focus")));
      await expect(tab.page.locator("#revision")).toHaveText(commit.slice(0, 7), { timeout: 15_000 });
    }
    for (const tab of [anna, lex]) {
      await expect.poll(() => source(tab.page), { timeout: 20_000 }).toContain("Sam wrote this on GitHub.");
      await expect(tab.page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("Fresh bread: A native browser preview");
    }
    expect(await source(anna.page)).toBe(await source(lex.page));
    // The new copy is shared: a change after the fold reaches the other tab, and nothing went in twice.
    await insert(lex.page, "Sam wrote this", " (and Lex)");
    await expect.poll(() => source(anna.page), { timeout: 20_000 }).toContain("Sam wrote this (and Lex) on GitHub.");
    const after = await source(anna.page);
    for (const part of ["Fresh bread: ", "Sam wrote this", " (and Lex)"]) expect(count(after, part), part).toBe(1);
    expect(await source(lex.page)).toBe(after);
  } finally {
    await anna.context.close();
    await lex.context.close();
  }
});
