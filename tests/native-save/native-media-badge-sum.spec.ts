// Default fixture group. Slice 121: the Media tab's count is Clean up's count plus Improve images'
// (ticket 11, slice 74). It read 10 on one screen and 15 on the next, because the badge showed Clean
// up's count first and the sum a moment later. Now it shows only the sum, and More's two counts add up
// to it on every Media screen.
import { test, expect, type Page } from "@playwright/test";
import { filterTo } from "./media-filter";

declare global { interface Window { __badge?: string[] } }

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
/** Every value the Media tab's count has shown since the page loaded. */
const shown = (page: Page) => page.evaluate(() => window.__badge ?? []);
const badge = (page: Page) => page.locator(".media-count:not([hidden])").first();

async function moreCounts(page: Page) {
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const labels = await page.getByRole("menuitem").allTextContents();
  await page.keyboard.press("Escape");
  const count = (name: string) => Number(labels.find(label => label.startsWith(name))?.match(/\((\d+)\)/)?.[1] ?? 0);
  return { clean: count("Clean up"), improve: count("Improve images") };
}

test("the Media tab's count is Clean up plus Improve images on every Media screen, from the first time it shows", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    window.__badge = seen;
    new MutationObserver(() => {
      const count = document.querySelector<HTMLElement>(".media-count");
      if (count && !count.hidden && seen.at(-1) !== count.textContent) seen.push(count.textContent ?? "");
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
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
  await expect(badge(page)).toBeVisible({ timeout: 30_000 });
  // More shows both parts once the counts are in; the badge is their sum.
  await expect.poll(async () => (await moreCounts(page)).improve, { timeout: 30_000 }).toBe(1);
  const { clean } = await moreCounts(page), sum = String(clean + 1);
  expect(clean).toBeGreaterThanOrEqual(2);
  await expect(badge(page)).toHaveText(sum);
  // Never Clean up's count alone, before or after.
  expect(await shown(page)).toEqual([sum]);
  const said = `${clean} files to clean up and 1 page with pictures to improve`;
  await expect(page.locator("#media-count-note")).toHaveText(said);
  await expect(badge(page)).toHaveAttribute("title", said);

  const back = () => pane(page).getByRole("button", { name: /^(Back|Back to grid)$/ }).first().click();
  await filterTo(pane(page), "Manage collections…");
  await expect(pane(page).getByRole("heading", { name: "Manage collections", exact: true })).toBeVisible();
  await expect(badge(page)).toHaveText(sum);
  await back();
  for (const item of [/^To check/, /^Recently removed/, /^Adding settings/, /^Improve images/, /^Clean up/]) {
    await pane(page).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: item }).click();
    await expect(pane(page).getByRole("button", { name: /^(Back|Back to grid)$/ }).first()).toBeVisible();
    await expect(badge(page), String(item)).toHaveText(sum);
    await back();
  }
  expect(await moreCounts(page)).toEqual({ clean, improve: 1 });
  expect(await shown(page)).toEqual([sum]);
});
