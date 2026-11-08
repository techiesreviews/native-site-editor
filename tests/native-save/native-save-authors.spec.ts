import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { publishButton } from "./publish";
import { storedDraft } from "./drafts";

// Saving names everyone whose changes the files carry (ticket am-26, ADR 0003 decision 6): the Publish menu sends
// who else changed each saved file (src/save-authors.ts) with the save, and the commit names them. Live sharing stays
// off here: an agent writing into this tab's drafts is named all the same. Default fixture group.
const pageErrors: string[] = [];
const file = "index.html";

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => { if (window === window.top) performance.setResourceTimingBufferSize(10_000); });
});
test.afterEach(() => { expect(pageErrors).toEqual([]); });

/** Inserts `text` after the first `after` in the open page, as the editor's own edits do; as `agent` when one is named. */
const insert = (page: Page, after: string, text: string, agent?: string) => page.evaluate(async ({ path, after, text, agent }) => {
  const editor = await import("/src/components/source-editor.ts");
  const { writeAs } = await import("/src/live-author.ts");
  const now = editor.getMountedSource(path)!;
  const at = now.indexOf(after) + after.length;
  const write = () => editor.replaceActiveRange({ path, start: at, end: at, expected: "", text });
  if (agent) writeAs({ grant: "grant-1", name: agent }, write); else write();
}, { path: file, after, text, agent });

declare global {
  interface Window { saveBody?: Promise<string> }
}

/** The next save's request body, unpacked in the page (a gzipped Blob, which Playwright does not hand over). */
async function nextSave(page: Page) {
  await page.evaluate(() => {
    const own = window.fetch.bind(window);
    delete window.saveBody;
    window.fetch = (input, init) => {
      if (String(input).startsWith("/api/publish") && init?.body instanceof Blob) {
        window.saveBody = new Response(init.body.stream().pipeThrough(new DecompressionStream("gzip"))).text();
        window.fetch = own;
      }
      return own(input, init);
    };
  });
  return async () => {
    await expect.poll(() => page.evaluate(() => Boolean(window.saveBody))).toBe(true);
    return JSON.parse(await page.evaluate(() => window.saveBody!)) as { authors?: unknown };
  };
}

test("a save sends everyone else who changed the file, once; the next save names no one again", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  // Who changes the page is noted once the page builder's tools load, after the first paint.
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /live-text/.test(entry.name))), { timeout: 20_000 }).toBe(true);
  await insert(page, "Edit plain HTML", ", mine,");
  await insert(page, "Edit plain HTML, mine,", " and Codex's,", "Codex");
  await expect.poll(async () => (await storedDraft(page, file))?.content ?? "", { timeout: 20_000 }).toContain(" and Codex's,");
  // Anna's change reached this tab's shared copy; the one saving is the commit's author and is not named again.
  const draft = (await storedDraft(page, file))!;
  await page.evaluate(async ({ draft }) => {
    const { draftKey } = await import("/src/drafts.ts");
    const { saveAuthors } = await import("/src/save-authors.ts");
    const key = draftKey(draft, draft.path);
    saveAuthors().note(key, draft.baseSha, { name: "anna" });
    saveAuthors().note(key, draft.baseSha, { name: draft.account });
  }, { draft: draft as { account: string; repoId: number; repo: string; branch: string; path: string; baseSha: string | null } });

  const saved = await nextSave(page);
  await publishButton(page).click();
  expect((await saved()).authors).toEqual([{ name: "Codex", agent: true }, { name: "anna" }]);
  await expect(page.locator("#status")).toContainText("saved to GitHub", { timeout: 30_000 });

  // Only the user's own change since: the next commit names no one.
  await insert(page, "Edit plain HTML", " again,");
  const again = await nextSave(page);
  await publishButton(page).click();
  expect(await again()).not.toHaveProperty("authors");
  await expect(page.locator("#status")).toContainText("saved to GitHub", { timeout: 30_000 });
});
