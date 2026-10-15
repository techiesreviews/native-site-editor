// Default fixture group. Slice 121: More's two counts (Clean up, Improve images) come from one settled
// check, so they never show Clean up's count alone and stay the same on every Media screen. Slice 122
// (Lex): the Media tab shows no count and the page button no dot; More is the one place they live.
import { test, expect, type Page } from "@playwright/test";
import { filterTo } from "./media-filter";

declare global { interface Window { __marks?: number } }

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
/** How many count marks (the old .media-count) were ever added since the page loaded. */
const marks = (page: Page) => page.evaluate(() => window.__marks ?? 0);

async function moreCounts(page: Page) {
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const labels = await page.getByRole("menuitem").allTextContents();
  await page.keyboard.press("Escape");
  const count = (name: string) => Number(labels.find(label => label.startsWith(name))?.match(/\((\d+)\)/)?.[1] ?? 0);
  return { clean: count("Clean up"), improve: count("Improve images") };
}

test("More's counts hold on every Media screen; the Media tab and page button never show a count", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.__marks = 0;
    new MutationObserver(() => {
      if (document.querySelector(".media-count, #media-count-note")) window.__marks = (window.__marks ?? 0) + 1;
    }).observe(document, { subtree: true, childList: true });
  });
  await page.goto(baseURL!);
  const picture = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 4000; canvas.height = 3000;
    canvas.getContext("2d")!.fillRect(0, 0, 4000, 3000);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const seed = async (data: { path: string; content?: string; base64?: string }) => {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data })).ok()).toBe(true);
  };
  // One page with a picture far wider than it is shown (Improve images: 1), two more unused files.
  await seed({ path: "images/wide.png", base64: picture });
  for (const name of ["spare-1.png", "spare-2.png"]) await seed({ path: `images/${name}`, base64: picture });
  await seed({ path: "index.html", content: '<!doctype html><html><head><title>Sum</title></head><body><h1>Sum</h1><img src="/images/wide.png" width="10" height="10" loading="lazy"></body></html>' });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  // More shows both counts once they are in.
  await expect.poll(async () => (await moreCounts(page)).improve, { timeout: 30_000 }).toBe(1);
  const { clean } = await moreCounts(page);
  expect(clean).toBeGreaterThanOrEqual(2);
  const tab = page.getByRole("tab", { name: "Media", exact: true });
  await expect(tab).toHaveText("Media");
  await expect(tab).not.toHaveAttribute("aria-describedby");
  await expect(page.locator("#explorer-toggle")).not.toHaveAttribute("aria-describedby");

  const back = () => pane(page).getByRole("button", { name: /^(Back|Back to grid)$/ }).first().click();
  await filterTo(pane(page), "Manage collections…");
  await expect(pane(page).getByRole("heading", { name: "Manage collections", exact: true })).toBeVisible();
  await back();
  expect(await moreCounts(page)).toEqual({ clean, improve: 1 });
  for (const item of [/^To check/, /^Recently removed/, /^Adding settings/, /^Improve images/, /^Clean up/]) {
    await pane(page).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: item }).click();
    await expect(pane(page).getByRole("button", { name: /^(Back|Back to grid)$/ }).first()).toBeVisible();
    await back();
    expect(await moreCounts(page), String(item)).toEqual({ clean, improve: 1 });
  }
  expect(await marks(page)).toBe(0);
});
