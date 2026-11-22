import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { publishButton } from "./publish";
import { storedDraft } from "./drafts";

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
const keptPaths = (page: Page) => page.evaluate(() => new Promise<string[]>((done) => {
  const open = indexedDB.open("native-site-editor-warm-copy", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("copy");
  open.onerror = () => done([]);
  open.onsuccess = () => {
    const read = open.result.transaction("copy").objectStore("copy").get("last");
    read.onsuccess = () => { done(((read.result as { files?: { path: string }[] } | undefined)?.files ?? []).map((file) => file.path)); open.result.close(); };
    read.onerror = () => done([]);
  };
}));
const gitBlobSha = (text: string) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
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

/** Signs out through the project menu; the editor's home then answers signed out (the test server would sign the demo user in again). */
async function signOut(page: Page, baseURL: string | undefined) {
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: true, user: null, installUrl: null } }));
  await page.route("**/auth/login*", (route) => route.abort());
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: /^Sign out/ }).click();
  await page.waitForURL(`${baseURL}/`);
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
  // Asked, never answered: the page did not wait on them, and does not claim to be up to date.
  expect(github.seen).toEqual(expect.arrayContaining(["/api/repositories"]));
  await expect(page.locator("#status")).toHaveText("Checking GitHub for newer changes on main…");
  await github.release();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 15_000 });
});

test("a saved change is what the next visit shows at once", async ({ page, baseURL }) => {
  await pasteSource(page, indexSource.replace(heading, "Saved by Lex"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Saved by Lex", { timeout: 15_000 });
  await publishButton(page).click();
  await expect.poll(() => head(page, baseURL), { timeout: 30_000 }).not.toBe(await keptCommit(page));
  const saved = await head(page, baseURL);
  await expect(page.locator("#revision")).toHaveText(saved.slice(0, 7), { timeout: 30_000 });
  await expect.poll(() => keptCommit(page), { timeout: 15_000 }).toBe(saved);
  const github = await holdGitHub(page);
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText("Saved by Lex", { timeout: 15_000 });
  await expect(page.locator("#revision")).toHaveText(saved.slice(0, 7));
  await github.release();
  await expect(page.locator("#status")).toContainText(`Up to date with main · ${saved.slice(0, 7)}`, { timeout: 15_000 });
  await expect(chip(page)).toHaveCount(0);
});

test("a listing that fails behind the kept page says so; the page stays, and the project menu then lists without reopening it", async ({ page }) => {
  let failing = true;
  await page.route("**/api/repositories*", (route) => failing ? route.fulfill({ status: 503, json: { error: "GitHub is not answering." } }) : route.continue());
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText(heading, { timeout: 15_000 });
  await expect(page.locator("#notice")).toBeVisible({ timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toHaveText(heading);
  failing = false;
  const snapshots: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/snapshot") snapshots.push(request.url()); });
  await page.locator(".repository-menu__trigger").click();
  await expect(page.getByRole("list", { name: "Repositories" }).getByRole("button", { name: /^native-cards / })).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).locator(".hero h1")).toHaveText(heading);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  expect(snapshots).toEqual([]);
});

test("a kept branch GitHub no longer lists opens the plain way, which says so", async ({ page }) => {
  await page.route("**/api/branches*", (route) => route.fulfill({ json: ["other"] }));
  await page.reload();
  await expect(page.locator("#content")).toContainText("The linked branch is no longer available.", { timeout: 15_000 });
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
  await signOut(page, baseURL);
  expect(await keptCommit(page)).toBeUndefined();
});

test("sign-out right after a save: the keep that follows the save writes nothing back", async ({ page, baseURL }) => {
  const before = await keptCommit(page);
  await pasteSource(page, indexSource.replace(heading, "Saved just before signing out"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Saved just before signing out", { timeout: 15_000 });
  await publishButton(page).click();
  await expect.poll(() => head(page, baseURL), { timeout: 30_000 }).not.toBe(before);
  // Usually within the second after the save, before its keep (the unit tests pin the rule itself).
  await signOut(page, baseURL);
  // fixed-wait: past the second a late keep would have taken; nothing marks a write that does not happen.
  await page.waitForTimeout(1_500);
  expect(await keptCommit(page)).toBeUndefined();
});

test("another page opened before the reload shows at once too", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("about/index.html")}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html", { timeout: 30_000 });
  await expect.poll(() => keptPaths(page), { timeout: 15_000 }).toContain("about/index.html");
  const about = await frame(page).locator("h1").first().textContent();
  const github = await holdGitHub(page);
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html", { timeout: 15_000 });
  await expect(frame(page).locator("h1").first()).toHaveText(about!, { timeout: 15_000 });
  await github.release();
});

test("an unsaved deletion of a file the kept copy does not have yet survives: the copy is not used", async ({ page, baseURL }) => {
  // Sam adds a page on GitHub; this browser holds an unsaved deletion of it (made in a tab whose keep never landed).
  const notes = "<!doctype html><html><body><h1>Notes</h1></body></html>\n";
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "notes.html", content: notes, author: "Sam" } })).status()).toBe(204);
  await page.evaluate(([text, sha]) => {
    const scope = { account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" };
    const key = "astro-site-editor:draft:v1:" + JSON.stringify([scope.account, scope.repoId, scope.branch, "notes.html"]);
    localStorage.setItem(key, JSON.stringify({ ...scope, version: 1, path: "notes.html", baseSha: sha, original: text, content: text, deleted: true, updatedAt: Date.now() }));
  }, [notes, gitBlobSha(notes)] as const);
  const github = await holdGitHub(page);
  await page.reload();
  // The kept page waits for GitHub: its version is older than the deletion's.
  await expect.poll(() => github.seen.includes("/api/snapshot"), { timeout: 15_000 }).toBe(true);
  await expect(page.locator(".native-preview-frame")).toHaveCount(0);
  await github.release();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  expect((await storedDraft(page, "notes.html"))?.deleted).toBe(true);
});

test("a head check that fails behind the kept page says so, and asks again when the tab is next shown", async ({ page }) => {
  let failing = true;
  await page.route("**/api/head*", (route) => failing ? route.fulfill({ status: 503, json: { error: "GitHub is not answering." } }) : route.continue());
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText(heading, { timeout: 15_000 });
  await expect(page.locator("#status")).toHaveText("Could not check GitHub for newer changes on main. Refresh to check.", { timeout: 30_000 });
  failing = false;
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 15_000 });
});

test("a branch list that fails behind the kept page says so; the page stays on its branch, and Try again fills it", async ({ page }) => {
  let failing = true;
  await page.route("**/api/branches*", (route) => failing ? route.fulfill({ status: 503, json: { error: "GitHub is not answering." } }) : route.continue());
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText(heading, { timeout: 15_000 });
  const again = page.locator("#notice").getByRole("button", { name: "Try again" });
  await expect(again).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#branch")).toBeDisabled();
  await expect(frame(page).locator(".hero h1")).toHaveText(heading);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  failing = false;
  await again.click();
  await expect(page.locator("#branch")).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator("#branch")).toHaveValue("main");
});

test("publishing on the kept page before GitHub answers, with a newer commit on the branch, overwrites nothing: refused, then merged", async ({ page, baseURL }) => {
  await samCommits(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  const github = await holdGitHub(page);
  await page.reload();
  await expect(frame(page).getByText(filler)).toBeVisible({ timeout: 15_000 });
  await pasteSource(page, indexSource.replace(heading, "Lex published early"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex published early", { timeout: 15_000 });
  const refused = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/publish");
  await publishButton(page).click();
  // The page's file changed on GitHub since its draft began: GitHub's version is not replaced.
  expect((await refused).status()).toBe(409);
  await github.release();
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex published early");
  const onGitHub = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  expect(onGitHub).toContain("Sam wrote this on GitHub.");
});

test("the project menu's own list, landing first without the kept repository, takes the kept page away and says so", async ({ page }) => {
  let held: Route | undefined, release!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  await page.route("**/api/repositories*", async (route) => {
    const first = !held;
    if (first) held = route;
    if (first) await gate;
    const response = await route.fetch();
    const listed = (await response.json()) as { id: number }[];
    await route.fulfill({ response, json: listed.map((repo) => ({ ...repo, id: repo.id + 100_000 })) });
  });
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText(heading, { timeout: 15_000 });
  await page.locator(".repository-menu__trigger").click();
  await expect(page.getByRole("list", { name: "Repositories" }).getByRole("button", { name: /^native-cards / })).toBeVisible({ timeout: 15_000 });
  release();
  await expect(page.locator("#notice")).toContainText("The linked repository is not available to this GitHub account.", { timeout: 15_000 });
  // The kept site is closed: no project is open.
  await expect(page.locator(".repository-menu__trigger")).toHaveAccessibleName("All projects — repository actions");
});

test("a listing with the kept repository renamed opens it again the plain way, by its new name", async ({ page }) => {
  await page.route("**/api/repositories*", async (route) => {
    const response = await route.fetch();
    const listed = (await response.json()) as { id: number; name: string; full_name: string }[];
    await route.fulfill({ response, json: listed.map((repo) => repo.id === 501 ? { ...repo, name: "renamed", full_name: "native-demo-user/renamed" } : repo) });
  });
  const renamed = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/snapshot" && new URL(request.url()).searchParams.get("repo") === "native-demo-user/renamed");
  await page.reload();
  await renamed;
  await expect(page.getByRole("button", { name: /^renamed/ }).first()).toBeVisible({ timeout: 15_000 });
});
