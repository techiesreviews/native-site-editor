import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

// A repeat visit shows the last site at once (TOOLS-242, src/warm-copy.ts): the page this browser showed last opens
// from its own copy as soon as the session names the same account, before GitHub answers anything; GitHub's head is
// asked for behind it. A newer version replaces the shown copy when there are no unsaved edits; unsaved edits are
// kept and GitHub's change merges in, as for any outside change (src/outside-merge.ts).
const HASH = "#repo=501&branch=main&file=index.html";
const indexPath = "index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const heading = "A native browser preview";
const filler = "This section adds enough height that the preview scrolls.";
const pageErrors: string[] = [];

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const chip = (page: Page) => frame(page).locator('[data-native-selection-box="agent-presence-chip"]');
const keptCommit = (page: Page) => page.evaluate(() => new Promise<string | undefined>((done) => {
  const open = indexedDB.open("native-site-editor-warm-copy", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("copy");
  open.onerror = () => done(undefined);
  open.onsuccess = () => {
    const read = open.result.transaction("copy").objectStore("copy").get("last");
    read.onsuccess = () => { done((read.result as { snapshot?: { commit?: string } } | undefined)?.snapshot?.commit); open.result.close(); };
    read.onerror = () => done(undefined);
  };
}));
async function head(page: Page, baseURL: string | undefined) {
  return ((await (await page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string }).commit;
}
/** Sam commits `content` to the page on GitHub; no push notice reaches the tab. */
async function samCommits(page: Page, baseURL: string | undefined, content: string) {
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: indexPath, content, author: "Sam" } })).status()).toBe(204);
  return head(page, baseURL);
}
async function pasteSource(page: Page, source: string) {
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}
/**
 * Holds every read that waits on GitHub (the listing, branches, snapshot, head and file reads) until released; the
 * session, answered by the editor's own server, goes through. `seen` lists what was asked while held.
 */
async function holdGitHub(page: Page) {
  const held: Route[] = [], seen: string[] = [];
  let open = false;
  await page.route(/\/api\/(repositories|branches|snapshot|head|files?|blob|tree|commit)(\?|$)/, (route) => {
    if (open) return route.continue();
    seen.push(new URL(route.request().url()).pathname);
    held.push(route);
  });
  return { seen, release: async () => { open = true; for (const route of held.splice(0)) await route.continue(); } };
}

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/${HASH}`);
  await expect(frame(page).locator(".hero h1")).toHaveText(heading, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const first = await head(page, baseURL);
  await expect.poll(() => keptCommit(page), { timeout: 15_000 }).toBe(first);
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("a reload shows the kept page before GitHub answers anything, and the page works", async ({ page }) => {
  const github = await holdGitHub(page);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText(heading, { timeout: 15_000 });
  await expect(page.locator('[role=tree][aria-label="Page structure"] [role=treeitem]').first()).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  // Asked, never answered: the page did not wait on them.
  expect(github.seen).toEqual(expect.arrayContaining(["/api/repositories"]));
  await github.release();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 15_000 });
});

test("GitHub has a newer version and nothing is unsaved: the shown copy is replaced by it", async ({ page, baseURL }) => {
  const newer = await samCommits(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  const github = await holdGitHub(page);
  await page.reload();
  // The kept copy at once: the version from before Sam's commit.
  await expect(frame(page).getByText(filler)).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toHaveCount(0);
  await github.release();
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).getByText(filler)).toHaveCount(0);
  await expect(page.locator("#revision")).toHaveText(newer.slice(0, 7));
  // The change shows on the page itself, as any outside change does: its author's chip, then it goes.
  await expect(chip(page)).toContainText("Sam · GitHub");
  await expect(chip(page)).toBeHidden({ timeout: 8_000 });
  // The next visit keeps the newer version.
  await expect.poll(() => keptCommit(page), { timeout: 15_000 }).toBe(newer);
});

test("unsaved edits from before the visit are kept, and GitHub's newer change on other lines merges in", async ({ page, baseURL }) => {
  await pasteSource(page, indexSource.replace(heading, "Lex's own heading"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading", { timeout: 15_000 });
  await samCommits(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  const github = await holdGitHub(page);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading", { timeout: 15_000 });
  await github.release();
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading");
  await expect(page.locator("#content .code-editor__conflict")).toBeHidden();
});

test("edits typed on the kept copy before GitHub answers are kept when GitHub's newer change arrives", async ({ page, baseURL }) => {
  await samCommits(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  const github = await holdGitHub(page);
  await page.reload();
  await expect(frame(page).getByText(filler)).toBeVisible({ timeout: 15_000 });
  await pasteSource(page, indexSource.replace(heading, "Typed while GitHub was slow"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Typed while GitHub was slow", { timeout: 15_000 });
  await github.release();
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).locator(".hero h1")).toHaveText("Typed while GitHub was slow");
  // Kept across another visit too: the edit is a draft.
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText("Typed while GitHub was slow", { timeout: 15_000 });
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
});

test("a repository no longer listed takes the kept page away and says so", async ({ page }) => {
  // The account's listing now holds another repository only.
  await page.route("**/api/repositories*", async (route) => {
    const response = await route.fetch();
    const listed = (await response.json()) as { id: number }[];
    await route.fulfill({ response, json: listed.map((repo) => ({ ...repo, id: repo.id + 100_000 })) });
  });
  await page.reload();
  await expect(page.locator("#notice")).toContainText("The linked repository is not available to this GitHub account.", { timeout: 15_000 });
  await expect(page.locator(".native-preview-frame")).toHaveCount(0);
});

test("sign-out forgets the kept copy before the editor leaves", async ({ page, baseURL }) => {
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: /^Sign out/ }).click();
  await page.waitForURL(`${baseURL}/`);
  expect(await keptCommit(page)).toBeUndefined();
});
