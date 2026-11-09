import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pushDelivery } from "./fake-webhook";

// Outside changes fold in (ticket am-33, F-repo-13): a commit made on GitHub reaches the open tab (the push notice,
// ticket am-32) and folds in where it is, with no reload. With no unsaved changes the page takes it, with a brief
// outline and a chip naming the commit's author; unsaved words on other lines stay and the change merges in; on a
// clash the latest version shows, and one Undo brings back Lex's words.
const indexPath = "index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const heading = "A native browser preview";
const filler = "This section adds enough height that the preview scrolls.";
const pageErrors: string[] = [];

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const chip = (page: Page) => frame(page).locator('[data-native-selection-box="agent-presence-chip"]');

async function head(page: Page, baseURL: string | undefined) {
  return ((await (await page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string }).commit;
}
/** Sam commits `content` to the page on GitHub, and the push is delivered until the open tab's room heard it. */
async function samPushes(page: Page, baseURL: string | undefined, content: string) {
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: indexPath, content, author: "Sam" } })).status()).toBe(204);
  const commit = await head(page, baseURL);
  await expect.poll(async () => {
    const response = await page.request.post(`${baseURL}/api/github/webhook`, pushDelivery(commit));
    expect(response.status()).toBe(200);
    return ((await response.json()) as { told: number }).told;
  }, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.locator("#revision")).toHaveText(commit.slice(0, 7), { timeout: 15_000 });
  return commit;
}
async function pasteSource(page: Page, source: string) {
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}
/** Marks the workspace's content: a reload of the branch replaces it ("Opening your repository…"). */
const markContent = (page: Page) => page.locator("#content > *").first().evaluate((el) => el.setAttribute("data-fold-mark", ""));
const stillMarked = (page: Page) => expect(page.locator("#content > [data-fold-mark]")).toHaveCount(1);

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("native-site-editor:live-sharing", "on");
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("a push to the open page with no drafts updates it in place, with the author's chip that then goes", async ({ page, baseURL }) => {
  await markContent(page);
  await samPushes(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
  await expect(chip(page)).toBeVisible();
  await expect(chip(page)).toContainText("Sam · GitHub");
  await stillMarked(page);
  // No message: the status line keeps what it said.
  await expect(page.locator("#status")).not.toContainText("Loading");
  await expect(chip(page)).toBeHidden({ timeout: 6_000 });
});

test("a push touching other lines merges into the draft: Lex's words stay and Sam's arrive", async ({ page, baseURL }) => {
  await pasteSource(page, indexSource.replace(heading, "Lex's own heading"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading", { timeout: 15_000 });
  await markContent(page);
  await samPushes(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading");
  await expect(page.locator("#content .code-editor__conflict")).toBeHidden();
  await stillMarked(page);
});

test("a clash shows the latest version, and one Undo brings back Lex's words", async ({ page, baseURL }) => {
  await pasteSource(page, indexSource.replace(heading, "Lex's own heading"));
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading", { timeout: 15_000 });
  await samPushes(page, baseURL, indexSource.replace(heading, "Sam's heading").replace(filler, "Sam wrote this on GitHub."));
  await expect(frame(page).locator(".hero h1")).toHaveText("Sam's heading", { timeout: 15_000 });
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible();
  await page.locator("#editor-toolbar-host .code-editor__undo").click();
  await expect(frame(page).locator(".hero h1")).toHaveText("Lex's own heading", { timeout: 10_000 });
  // Only the clashing words went back: Sam's other line stays.
  await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible();
});

test("with reduced motion the chip stays still at full strength through its hold, then goes", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await samPushes(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
  await expect(chip(page)).toBeVisible();
  const opacity = () => chip(page).evaluate((el) => Number(getComputedStyle(el).opacity) * (el.getAnimations().length ? 0 : 1));
  // fixed-wait: well into the hold, where the fade would have dimmed it.
  await page.waitForTimeout(1_800);
  expect(await opacity()).toBe(1);
  await expect(chip(page)).toBeHidden({ timeout: 4_000 });
});

// The commit read only names the chip (src/outside-merge.ts settle matrix): failed, or never answering, the fold goes
// on and the chip says "Someone".
for (const [name, answer] of [["fails", "abort"], ["never answers", "hold"]] as const) {
  test(`the author read ${name}: the page still folds in, its chip naming Someone`, async ({ page, baseURL }) => {
    await page.route("**/api/commit?*", (route) => answer === "abort" ? route.abort() : undefined);
    await markContent(page);
    await samPushes(page, baseURL, indexSource.replace(filler, "Sam wrote this on GitHub."));
    await expect(frame(page).getByText("Sam wrote this on GitHub.")).toBeVisible({ timeout: 15_000 });
    await expect(chip(page)).toContainText("Someone · GitHub");
    await stillMarked(page);
  });
}
