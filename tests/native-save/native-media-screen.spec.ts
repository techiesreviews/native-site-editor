// The Media screen (media-manager build slices 12 and 14): usage badges on the tiles, the list view and File details.
// Default fixture: images/placeholder.svg is on index.html; images/studio-desk.svg is on no page.
import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
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
  await page.getByRole("dialog", { name: "placeholder.svg", exact: true }).getByRole("button", { name: "Home index.html", exact: true }).tap();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await context.close();
});

const LONG = "images/a-very-long-photograph-name-from-the-studio-shoot-in-october.png";
/** A Media view on a usage source the test steps through: first a check still reading, then a finished one. */
async function mountUsage(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async long => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    type Records = import("../../src/page-builder/media-usage").MediaUsageRecords;
    const family = (main: string, change: object) => ({ main, members: [main], checked: false, pages: [], otherUses: [], ...change });
    const paths = ["images/feed.png", "images/shared.png", "images/spare.png", long];
    let records: Records = { reach: "text", pending: ["notes.md"], unreadable: [], families: [family("images/feed.png", { pages: ["index.html", "about/index.html"] })] };
    const listeners = new Set<() => void>(), opened: string[] = [];
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#2f6d3a"/></svg>';
    const view = createMediaLibraryView(host, {
      async load() { return { key: "usage", items: paths.map(path => ({ path, version: "A", size: 2048 })), metadata: {}, collections: [], usage: {} }; },
      async blob() { return new Blob([svg], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async import() { return []; },
      async openPage(page) { opened.push(page); },
      usage: { records: () => records, onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    });
    Object.assign(window, { usageProbe: {
      checked() {
        records = { reach: "text", pending: [], unreadable: [], families: [
          family("images/feed.png", { checked: true, pages: ["about/index.html"], otherUses: [{ file: "feed.xml", kind: "feed" }] }),
          family("images/shared.png", { checked: true, otherUses: [{ file: "feed.xml", kind: "feed" }, { file: "notes.md", kind: "notes" }] }),
          family("images/spare.png", { checked: true }), family(long, { checked: true }),
        ] };
        for (const listener of listeners) listener();
      },
      opened: () => opened,
      dispose: () => { view.dispose(); host.remove(); },
    } });
    await view.ready;
  }, LONG);
}

test("Not checked yet and other uses show apart, and newer results repaint the badges in place", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mountUsage(page, baseURL);
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
  // A newer result keeps keyboard focus on a page that is still listed.
  await usage.getByRole("button", { name: "about/index.html", exact: true }).focus();
  await page.evaluate(() => (window as any).usageProbe.checked());
  await expect(usage.getByText("Used on 1 page", { exact: true })).toBeVisible();
  await expect(usage.getByRole("button", { name: "index.html", exact: true })).toHaveCount(0);
  await expect(usage.getByRole("button", { name: "about/index.html", exact: true })).toBeFocused();
  await expect(usage.getByText("Feed or sitemap", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(usage).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).usageProbe.opened())).toEqual(["about/index.html"]);
  // The badges follow the newer result; the tile keeps its picture.
  await expect(feed.getByRole("button", { name: "Used on 1 page", exact: true }).locator(".media-library__count")).toHaveText("1");
  await expect(feed.locator('img[data-probe="kept"]')).toHaveCount(1);
  const shared = tile(page, "images/shared.png"), other = shared.getByRole("button", { name: "0 pages · Other uses found", exact: true });
  await expect(other.locator(".media-library__count")).toHaveText("0");
  await expect(tile(page, "images/spare.png").getByRole("button", { name: "No uses found", exact: true })).toBeVisible();
  await other.click();
  const sharedUsage = page.getByRole("dialog", { name: "shared.png", exact: true });
  await expect(sharedUsage.getByRole("heading", { name: "Other uses · 2", exact: true })).toBeVisible();
  await expect(sharedUsage.getByText("No page uses found.", { exact: true })).toBeVisible();
  await sharedUsage.getByRole("button", { name: "Close", exact: true }).click();
  await expect(other).toBeFocused();
  // File details from the usage dialog opens the file's details.
  await other.click();
  await sharedUsage.getByRole("button", { name: "File details", exact: true }).click();
  await expect(library.getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await page.evaluate(() => (window as any).usageProbe.dispose());
});

test("the list shows a long name in full on a phone, apart from its selection and usage", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountUsage(page, baseURL);
  await page.evaluate(() => (window as any).usageProbe.checked());
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "List", exact: true }).click();
  const row = tile(page, LONG), name = row.locator(".media-library__name");
  await expect(name).toHaveText(LONG.split("/").pop()!);
  expect(await name.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(row.locator(".media-library__size")).toHaveText(/^\d+ (B|KB)$/);
  const [select, usage, box] = await Promise.all([row.locator(".media-library__select").boundingBox(), row.locator(".media-library__usage").boundingBox(), name.boundingBox()]);
  for (const target of [select!, usage!]) expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44);
  expect(select!.x + select!.width).toBeLessThanOrEqual(box!.x);
  expect(box!.x + box!.width).toBeLessThanOrEqual(usage!.x);
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

// File details (slice 14): its own screen with Back, Save details after the fields.
async function details(page: Page, path: string) {
  await pane(page).getByRole("button", { name: `Details for ${path}`, exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Back", exact: true })).toBeFocused();
}
const records = async (page: Page) => (await storedDraft(page, ".editor/media.json"))?.content ?? "";

test("a description saved in File details shows on the placed image, and usage names the page", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await details(page, "images/placeholder.svg");
  const library = pane(page);
  // Usage opens to the page by its title, with its path under it.
  await library.locator("summary").filter({ hasText: "Usage" }).click();
  await expect(library.getByRole("button", { name: "Home index.html", exact: true })).toBeVisible();
  await expect(library.getByText("Not described yet", { exact: true })).toBeVisible();
  await library.getByLabel("Description", { exact: true }).fill("A quiet green placeholder");
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(library.getByRole("status").last()).toContainText("Details saved as a draft");
  await expect(page.frameLocator(".native-preview-frame").locator(".hero-image")).toHaveAttribute("alt", "A quiet green placeholder");
  await expect.poll(() => records(page)).toContain("A quiet green placeholder");
  await expect(library.getByLabel("Description", { exact: true })).toHaveValue("A quiet green placeholder");
});

test("Decorative clears and locks the description, and is stored for the file", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await details(page, "images/studio-desk.svg");
  const library = pane(page), description = library.getByLabel("Description", { exact: true });
  await description.fill("Words to set aside");
  await library.getByLabel("Decorative", { exact: true }).check();
  await expect(description).toHaveValue(""); await expect(description).toBeDisabled();
  // Unticking before saving brings the words back.
  await library.getByLabel("Decorative", { exact: true }).uncheck();
  await expect(description).toHaveValue("Words to set aside"); await expect(description).toBeEnabled();
  await library.getByLabel("Decorative", { exact: true }).check();
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(async () => JSON.parse(await records(page) || "{}").files?.["images/studio-desk.svg"]).toEqual({ decorative: true });
  await expect(library.getByLabel("Decorative", { exact: true })).toBeChecked();
  await expect(description).toBeDisabled();
});

test("Always keep stays after reload, and Cancel leaves without saving", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await details(page, "images/studio-desk.svg");
  const library = pane(page);
  await library.getByRole("checkbox", { name: "Always keep", exact: true }).check();
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(() => records(page)).toContain('"alwaysKeep": true');
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await details(page, "images/studio-desk.svg");
  const keep = library.getByRole("checkbox", { name: "Always keep", exact: true });
  await expect(keep).toBeChecked();
  await keep.uncheck();
  await library.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(library.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeFocused();
  expect(await records(page)).toContain('"alwaysKeep": true');
});

test("on a phone, File details is its own screen with Back, the preview first and Save after the fields", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page, baseURL);
  const library = pane(page);
  await details(page, "images/studio-desk.svg");
  await expect(library.getByLabel("Search media", { exact: true })).toBeHidden();
  await expect(library.locator(".media-library__grid")).toBeHidden();
  const [preview, name] = await Promise.all([library.locator(".media-detail__preview").boundingBox(), library.getByLabel("File name", { exact: true }).boundingBox()]);
  expect(preview!.y + preview!.height).toBeLessThanOrEqual(name!.y);
  // The buttons follow the fields and cover none of them.
  const save = library.getByRole("button", { name: "Save details", exact: true });
  await save.scrollIntoViewIfNeeded();
  const [saveBox, keepBox] = await Promise.all([save.boundingBox(), library.getByText("Never suggested for clean-up", { exact: false }).boundingBox()]);
  expect(saveBox!.y).toBeGreaterThanOrEqual(keepBox!.y + keepBox!.height);
  expect(saveBox!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await library.getByRole("button", { name: "Back", exact: true }).tap();
  await expect(library.getByLabel("Search media", { exact: true })).toBeVisible();
  await expect(library.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeFocused();
  await context.close();
});

test("words set aside by Decorative survive a background refresh and come back when it is unticked", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await details(page, "images/studio-desk.svg");
  const library = pane(page), description = library.getByLabel("Description", { exact: true });
  await description.fill("Held words");
  await library.getByLabel("Decorative", { exact: true }).check();
  await expect(description).toHaveValue("");
  // A page starts using the file, so details rebuild in the background.
  await page.evaluate(async () => {
    (window as any).heldDescription = document.querySelector('#explorer-media textarea[aria-label="Description"]');
    const editor = await import("/src/components/code-editor.ts"), source = editor.getMountedSource("index.html");
    if (source === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({ path: "index.html", start: source.length, end: source.length, expected: "", text: '\n<img src="/images/studio-desk.svg">' });
  });
  await expect.poll(() => page.evaluate(() => !(window as any).heldDescription.isConnected)).toBe(true);
  await expect(library).not.toHaveAttribute("aria-busy", "true");
  await expect(library.getByLabel("Decorative", { exact: true })).toBeChecked();
  await expect(description).toBeDisabled();
  await library.getByLabel("Decorative", { exact: true }).uncheck();
  await expect(description).toHaveValue("Held words");
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(() => records(page)).toContain("Held words");
});

test("a host without one-step details refuses a rename and writes nothing", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const calls: string[] = [];
    const host = document.createElement("div"); host.style.cssText = "position:fixed;inset:20px;background:white;z-index:1000"; document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() { return { key: "no-details", items: [{ path: "images/a.svg", version: "A" }], metadata: {}, collections: [], usage: {} }; },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() { calls.push("metadata"); }, async collections() { calls.push("collections"); },
      async rename() { calls.push("rename"); }, async remove() {}, async import() { return []; }, async openPage() {},
    });
    Object.assign(window, { noDetailsProbe: { calls, dispose: () => { view.dispose(); host.remove(); } } }); await view.ready;
  });
  const library = page.getByRole("region", { name: "Media", exact: true });
  await library.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await library.getByLabel("Description", { exact: true }).fill("Not saved");
  await library.getByLabel("File name", { exact: true }).fill("b.svg");
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(library.locator(".media-library__message")).toContainText("Renaming is not available here.");
  expect(await page.evaluate(() => (window as any).noDetailsProbe.calls)).toEqual([]);
  await page.evaluate(() => (window as any).noDetailsProbe.dispose());
});
