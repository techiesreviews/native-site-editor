import { expect, test, type Browser, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";

// The open file's shared copy (ticket am-21, ADR 0003): two browsers signed in
// to the same repository and branch, each with its own drafts, share the page
// they both have open through its live room (the real Worker route and relay
// rooms, src/live-text.ts over src/live-room.ts). Default fixture group.
const pageErrors: string[] = [];
const file = "index.html";

const source = (page: Page) => page.evaluate(async (path) => (await import("/src/components/source-editor.ts")).getMountedSource(path) ?? "", file);
/** Inserts `text` after the first `after` in the open page, as the editor's own edits do. */
const insert = (page: Page, after: string, text: string) => page.evaluate(async ({ path, after, text }) => {
  const editor = await import("/src/components/source-editor.ts");
  const now = editor.getMountedSource(path)!;
  const at = now.indexOf(after) + after.length;
  editor.replaceActiveRange({ path, start: at, end: at, expected: "", text });
}, { path: file, after, text });
const count = (text: string, part: string) => text.split(part).length - 1;

async function browserTab(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { context, page };
}

test.beforeEach(() => { pageErrors.length = 0; });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

test("two people editing one page end identical, and a late joiner catches up", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  const tabs = [anna, lex];
  try {
    await openEditor(anna.page, baseURL);
    await openEditor(lex.page, baseURL);
    // Each one's edit reaches the other's page: in the source and in the preview.
    await insert(anna.page, '<h1 data-key="hero-title">', "Fresh bread: ");
    await expect.poll(() => source(lex.page), { timeout: 20_000 }).toContain("Fresh bread: A native browser preview");
    await insert(lex.page, "Edit plain HTML", ", together,");
    await expect.poll(() => source(anna.page)).toContain("Edit plain HTML, together,");
    await expect(lex.page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("Fresh bread: A native browser preview");
    await expect(anna.page.frameLocator(".native-preview-frame").locator("p.lead")).toContainText("Edit plain HTML, together,");
    expect(await source(anna.page)).toBe(await source(lex.page));

    // Sam opens the page later: the copy comes from the two who are online (nothing is stored on the server).
    const sam = await browserTab(browser);
    tabs.push(sam);
    await openEditor(sam.page, baseURL);
    await expect.poll(() => source(sam.page), { timeout: 20_000 }).toBe(await source(anna.page));
    await expect(sam.page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("Fresh bread: A native browser preview");
    // Its own edit reaches both.
    await insert(sam.page, "Fresh bread: ", "warm ");
    for (const other of [anna, lex]) await expect.poll(() => source(other.page)).toContain("Fresh bread: warm A native");
  } finally {
    for (const tab of tabs) await tab.context.close();
  }
});

test("two people opening a page nobody has open, at once, do not double its text", async ({ browser, baseURL }) => {
  const anna = await browserTab(browser), lex = await browserTab(browser);
  try {
    await Promise.all([openEditor(anna.page, baseURL, "about/index.html"), openEditor(lex.page, baseURL, "about/index.html")]);
    const sourceOf = (page: Page) => page.evaluate(async () => (await import("/src/components/source-editor.ts")).getMountedSource("about/index.html") ?? "");
    const original = await sourceOf(anna.page);
    const heading = /<h1[^>]*>/.exec(original)![0];
    await anna.page.evaluate(async (heading) => {
      const editor = await import("/src/components/source-editor.ts");
      const now = editor.getMountedSource("about/index.html")!;
      const at = now.indexOf(heading) + heading.length;
      editor.replaceActiveRange({ path: "about/index.html", start: at, end: at, expected: "", text: "Hello: " });
    }, heading);
    await expect.poll(() => sourceOf(lex.page), { timeout: 20_000 }).toContain(`${heading}Hello: `);
    const shared = await sourceOf(lex.page);
    expect(shared).toBe(await sourceOf(anna.page));
    expect(count(shared, heading)).toBe(count(original, heading));
    expect(shared.length).toBe(original.length + "Hello: ".length);
  } finally {
    await anna.context.close();
    await lex.context.close();
  }
});
