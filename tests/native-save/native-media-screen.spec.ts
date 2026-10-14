// The Media screen (media-manager build slice 12): usage badges on the tiles and the list view.
// Default fixture: images/placeholder.svg is on index.html; images/studio-desk.svg is on no page.
import { test, expect, type Page } from "@playwright/test";
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tile = (page: Page, path: string) => pane(page).locator(`.media-library__card[data-path="${path}"]`);
async function open(page: Page, baseURL: string | undefined, file = "index.html") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${file}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
async function view(page: Page, choice: string) {
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitemradio", { name: choice, exact: true }).click();
}

test("Media opens on All, a used image shows its page count, hovering reads Used on 1 page, and the list shows its size", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const library = pane(page);
  await expect(library.locator(".media-library__card")).toHaveCount(2);
  await library.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "All", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitemradio", { name: "Grid", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "All", exact: true }).click();
  // The site is checked on open; the badge counts distinct pages.
  const used = tile(page, "images/placeholder.svg").getByRole("button", { name: "Used on 1 page", exact: true });
  await expect(used.locator(".media-library__count")).toHaveText("1");
  const words = used.locator(".media-library__usage-label");
  await page.mouse.move(1270, 890);
  await expect(words).toBeHidden();
  await used.hover();
  await expect(words).toBeVisible(); await expect(words).toHaveText("Used on 1 page");
  await view(page, "List");
  const row = tile(page, "images/placeholder.svg");
  await expect(row.locator(".media-library__name")).toHaveText("placeholder.svg");
  await expect(row.locator(".media-library__size")).toHaveText(/^\d+(\.\d)? (B|KB|MB)$/);
  await expect(row.getByRole("button", { name: "Used on 1 page", exact: true })).toContainText("Used on 1 page");
});

test("a checked file with no uses is 0 / No uses found, on hover and keyboard focus", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  const unused = tile(page, "images/studio-desk.svg"), badge = unused.getByRole("button", { name: "No uses found", exact: true });
  await expect(badge.locator(".media-library__count")).toHaveText("0");
  await unused.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(badge).toBeFocused();
  const words = badge.locator(".media-library__usage-label");
  await expect(words).toBeVisible(); await expect(words).toHaveText("No uses found");
  // The words open below the top controls and stay inside the tile.
  const [box, text, select] = await Promise.all([unused.boundingBox(), words.boundingBox(), unused.locator(".media-library__select").boundingBox()]);
  expect(text!.y).toBeGreaterThanOrEqual(select!.y + select!.height);
  expect(text!.x + text!.width).toBeLessThanOrEqual(box!.x + box!.width + 0.5);
});

test("tapping a badge opens the usage words and page names; Escape keeps the explorer and a page name opens the page", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page, baseURL, "about/index.html");
  const badge = tile(page, "images/placeholder.svg").getByRole("button", { name: "Used on 1 page", exact: true });
  await badge.tap();
  const usage = page.getByRole("dialog", { name: "placeholder.svg", exact: true });
  await expect(usage).toBeVisible();
  await expect(usage.getByText("Used on 1 page", { exact: true })).toBeVisible();
  await expect(usage.getByRole("heading", { name: "Pages · 1", exact: true })).toBeVisible();
  await expect(usage.getByRole("heading", { name: "Other uses · 0", exact: true })).toBeVisible();
  await expect(usage.getByText("No other uses found.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(usage).toHaveCount(0);
  await expect(pane(page)).toBeVisible();
  await expect(badge).toBeFocused();
  await badge.tap();
  await page.getByRole("dialog", { name: "placeholder.svg", exact: true }).getByRole("button", { name: "index.html", exact: true }).tap();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await context.close();
});

test("Not checked yet and other uses show apart, and newer results repaint the badges in place", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    type Records = import("../../src/page-builder/media-usage").MediaUsageRecords;
    const family = (main: string, change: object) => ({ main, members: [main], checked: false, pages: [], otherUses: [], ...change });
    let records: Records = { reach: "text", pending: ["notes.md"], unreadable: [], families: [family("images/feed.png", { pages: ["index.html"] }), family("images/spare.png", {})] };
    const listeners = new Set<() => void>();
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#2f6d3a"/></svg>';
    const view = createMediaLibraryView(host, {
      async load() { return { key: "usage", items: [{ path: "images/feed.png", version: "A" }, { path: "images/spare.png", version: "A" }], metadata: {}, collections: [], usage: {} }; },
      async blob() { return new Blob([svg], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {}, async import() { return []; },
      usage: { records: () => records, onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    });
    Object.assign(window, { usageProbe: {
      checked() {
        records = { reach: "text", pending: [], unreadable: [], families: [
          family("images/feed.png", { checked: true, otherUses: [{ file: "feed.xml", kind: "feed" }, { file: "notes.md", kind: "notes" }] }),
          family("images/spare.png", { checked: true }),
        ] };
        for (const listener of listeners) listener();
      },
      dispose: () => { view.dispose(); host.remove(); },
    } });
    await view.ready;
  });
  const library = pane(page), feed = tile(page, "images/feed.png");
  // Pages found so far are not a count yet: the check has not finished.
  const unchecked = feed.getByRole("button", { name: "Not checked yet", exact: true });
  await expect(unchecked.locator(".media-library__count")).toHaveText("?");
  await expect.poll(() => feed.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await feed.locator("img").evaluate(image => image.setAttribute("data-probe", "kept"));
  await unchecked.click();
  const usage = page.getByRole("dialog", { name: "feed.png", exact: true });
  await expect(usage.getByText("Not checked yet", { exact: true })).toBeVisible();
  await expect(usage.getByRole("button", { name: "index.html", exact: true })).toBeVisible();
  await expect(usage.getByText("The site's files are still being checked.", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).usageProbe.checked());
  // The open dialog and the badges follow the newer result; the tile keeps its picture.
  await expect(usage.getByText("0 pages · Other uses found", { exact: true })).toBeVisible();
  await expect(usage.getByRole("heading", { name: "Other uses · 2", exact: true })).toBeVisible();
  await expect(usage.getByText("feed.xml", { exact: true })).toBeVisible();
  await expect(usage.getByText("Feed or sitemap", { exact: true })).toBeVisible();
  await usage.getByRole("button", { name: "Close", exact: true }).click();
  const other = feed.getByRole("button", { name: "0 pages · Other uses found", exact: true });
  await expect(other).toBeFocused();
  await expect(other.locator(".media-library__count")).toHaveText("0");
  await expect(feed.locator('img[data-probe="kept"]')).toHaveCount(1);
  await expect(tile(page, "images/spare.png").getByRole("button", { name: "No uses found", exact: true })).toBeVisible();
  // File details from the usage dialog opens the file's details.
  await other.click();
  await usage.getByRole("button", { name: "File details", exact: true }).click();
  await expect(library.getByRole("button", { name: "Back to grid", exact: true })).toBeFocused();
  await page.evaluate(() => (window as any).usageProbe.dispose());
});

test("the list keeps 44 px selection and usage targets apart on a phone, without sideways scrolling", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await view(page, "List");
  for (const path of ["images/placeholder.svg", "images/studio-desk.svg"]) {
    const row = tile(page, path);
    await expect(row.locator(".media-library__size")).toHaveText(/\d/);
    const [select, usage, name] = await Promise.all([row.locator(".media-library__select").boundingBox(), row.locator(".media-library__usage").boundingBox(), row.locator(".media-library__name").boundingBox()]);
    for (const target of [select!, usage!]) expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44);
    expect(select!.x + select!.width).toBeLessThanOrEqual(name!.x);
    expect(name!.x + name!.width).toBeLessThanOrEqual(usage!.x);
  }
  await expect(tile(page, "images/studio-desk.svg").locator(".media-library__usage")).toContainText("No uses found");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // Back to the grid from More.
  await view(page, "Grid");
  await expect(pane(page).locator(".media-library__grid--list")).toHaveCount(0);
});
