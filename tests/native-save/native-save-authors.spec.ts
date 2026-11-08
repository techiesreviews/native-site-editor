import { expect, test, type Page } from "@playwright/test";
import { openEditor } from "../support/scenarios";
import { publishButton } from "./publish";
import { storedDraft, type StoredDraft } from "./drafts";

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
  interface Window { saveBodies?: Promise<string>[] }
}

/** Every save's request body from now on, unpacked in the page (a gzipped Blob, which Playwright does not hand over). */
const watchSaves = (page: Page) => page.evaluate(() => {
  if (window.saveBodies) return;
  const bodies: Promise<string>[] = window.saveBodies = [];
  const own = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (String(input).startsWith("/api/publish") && init?.body instanceof Blob)
      bodies.push(new Response(init.body.stream().pipeThrough(new DecompressionStream("gzip"))).text());
    return own(input, init);
  };
});
/** The `count` save bodies sent so far, once that many were. */
async function saves(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.saveBodies?.length ?? 0), { timeout: 30_000 }).toBe(count);
  return (await page.evaluate(() => Promise.all(window.saveBodies!))).map((body) => JSON.parse(body) as { files: { path: string }[]; authors?: unknown });
}
/** `name` changed the stored `draft`, as this tab's shared copy would note it. */
const noteAuthor = (page: Page, draft: StoredDraft, name: string) => page.evaluate(async ({ draft, name }) => {
  const { draftKey } = await import("/src/drafts.ts");
  const { saveAuthors } = await import("/src/save-authors.ts");
  const scope = { account: draft.account as string, repoId: draft.repoId as number, repo: draft.repo as string, branch: draft.branch as string };
  saveAuthors().note(draftKey(scope, draft.path), draft.baseSha as string | null, { name });
}, { draft, name });
/** Waits until the page builder's tools (and with them who changes the page is noted) load, after the first paint. */
const notingStarted = (page: Page) =>
  expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /live-text/.test(entry.name))), { timeout: 20_000 }).toBe(true);

test("a save sends everyone else who changed the file, once; the next save names no one again", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
  await notingStarted(page);
  await insert(page, "Edit plain HTML", ", mine,");
  await insert(page, "Edit plain HTML, mine,", " and Codex's,", "Codex");
  await expect.poll(async () => (await storedDraft(page, file))?.content ?? "", { timeout: 20_000 }).toContain(" and Codex's,");
  // Anna's change reached this tab's shared copy; the one saving is the commit's author and is not named again.
  const draft = (await storedDraft(page, file))!;
  await noteAuthor(page, draft, "anna");
  await noteAuthor(page, draft, String(draft.account));

  await watchSaves(page);
  await publishButton(page).click();
  expect((await saves(page, 1))[0].authors).toEqual([{ name: "Codex", agent: true }, { name: "anna" }]);
  await expect(page.locator("#status")).toContainText("saved to GitHub", { timeout: 30_000 });

  // Only the user's own change since: the next commit names no one.
  await insert(page, "Edit plain HTML", " again,");
  await publishButton(page).click();
  expect((await saves(page, 2))[1]).not.toHaveProperty("authors");
  await expect(page.locator("#status")).toContainText("saved to GitHub", { timeout: 30_000 });
});

test("the first save to an empty repository names in each of its two commits only the authors of the files it holds", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { reset: true } });
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { repositories: "none", add: [{ name: "blank-repo", kind: "empty" }] } });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find((repo) => repo.name === "blank-repo")!.id}&branch=main`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Start your site" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Blank page/ }).click();
  await expect(page.frameLocator(".native-preview-frame").locator("a.site-name")).toHaveText("Blank repo", { timeout: 30_000 });
  await expect.poll(async () => Boolean(await storedDraft(page, "styles/site.css")), { timeout: 20_000 }).toBe(true);
  await noteAuthor(page, (await storedDraft(page, "index.html"))!, "anna");
  await noteAuthor(page, (await storedDraft(page, "styles/site.css"))!, "sam");

  await watchSaves(page);
  await publishButton(page).click();
  const [first, rest] = await saves(page, 2);
  expect(first.files.map((change) => change.path)).toEqual(["index.html"]);
  expect(first.authors).toEqual([{ name: "anna" }]);
  expect(rest.files.map((change) => change.path)).toContain("styles/site.css");
  expect(rest.authors).toEqual([{ name: "sam" }]);
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
});
