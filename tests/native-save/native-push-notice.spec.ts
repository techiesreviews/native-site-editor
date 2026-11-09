import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { publishButton } from "./publish";
import { pushDelivery } from "./fake-webhook";

// GitHub pushes reach open tabs (ticket am-32, F-repo-12): a signed push delivery to the real Worker route
// (/api/github/webhook) reaches the open page's live room through the relay, and the tab loads the new commit with no
// focus or visibility change. The tab's own save sends a notice back to it before its answer lands; that notice loads
// nothing, however late the answer comes.
const indexPath = "index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const pageErrors: string[] = [];

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const revision = (page: Page) => page.locator("#revision");
const message = (page: Page) => page.locator("#publish-files .publish-menu__message");

async function head(page: Page, baseURL: string | undefined) {
  return ((await (await page.request.get(`${baseURL}/__demo/head`)).json()) as { commit: string }).commit;
}
/** Delivers the push of `commit` until the open tab's room has heard it (the room opens shortly after the first paint). */
async function deliver(page: Page, baseURL: string | undefined, commit: string) {
  await expect.poll(async () => {
    const response = await page.request.post(`${baseURL}/api/github/webhook`, pushDelivery(commit));
    expect(response.status()).toBe(200);
    return ((await response.json()) as { told: number }).told;
  }, { timeout: 15_000 }).toBeGreaterThan(0);
}
async function pasteSource(page: Page, source: string) {
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem("native-site-editor:live-sharing", "on");
    // Every focus and visibility change the tab sees, so a load is proven to come from the notice alone.
    const seen = { wakes: 0 };
    Object.assign(window, { __wakes: seen });
    addEventListener("focus", () => { seen.wakes++; }, true);
    document.addEventListener("visibilitychange", () => { seen.wakes++; }, true);
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const wakes = (page: Page) => page.evaluate(() => (window as Window & { __wakes?: { wakes: number } }).__wakes?.wakes ?? -1);

test("a signed push loads the new commit in the open tab, with no focus or visibility change", async ({ page, baseURL }) => {
  const before = await wakes(page);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: indexPath, content: indexSource.replace("A native browser preview", "Pushed from elsewhere") } });
  const pushed = await head(page, baseURL);
  await deliver(page, baseURL, pushed);
  await expect(revision(page)).toHaveText(pushed.slice(0, 7), { timeout: 15_000 });
  await expect(frame(page).getByText("Pushed from elsewhere")).toBeVisible({ timeout: 15_000 });
  expect(await wakes(page)).toBe(before);
});

test("the tab's own save loads the branch once, though its push notice lands long before the save's answer", async ({ page, baseURL }) => {
  const snapshots: string[] = [], heads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/snapshot") snapshots.push(request.url());
    if (path === "/api/head") heads.push(request.url());
  });
  // The save's commit is made, its push delivered and heard, and only seconds later does the answer reach the tab.
  let noticeHeard = false;
  await page.route("**/api/publish?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { commit: string };
    await deliver(page, baseURL, body.commit);
    noticeHeard = true;
    // fixed-wait: the save's answer must land well after its notice was heard (the review's late-answer row).
    await new Promise((settle) => setTimeout(settle, 3_000));
    await route.fulfill({ response, json: body });
  });
  await pasteSource(page, indexSource.replace("A native browser preview", "Saved here"));
  snapshots.length = 0;
  heads.length = 0;
  await publishButton(page).click();
  await expect(message(page)).toContainText("Saved to GitHub.", { timeout: 20_000 });
  expect(noticeHeard).toBe(true);
  const saved = await head(page, baseURL);
  await expect(revision(page)).toHaveText(saved.slice(0, 7));
  // fixed-wait: a second load would start after the answer; nothing observable marks its absence.
  await page.waitForTimeout(1_000);
  expect(heads, "the notice read no head").toEqual([]);
  expect(snapshots.length, "only the save's own refresh read the branch").toBe(1);
  expect(new URL(snapshots[0]).searchParams.get("commit")).toBe(saved);
});
