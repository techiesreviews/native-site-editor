// The Media screen (media-manager build slices 12 and 14): usage badges on the tiles, the list view and File details.
// Default fixture: images/placeholder.svg is on index.html; images/studio-desk.svg is on no page.
import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { publishButton, showPublish } from "./publish";
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

/** A phone list row: 44 px selection and usage targets, the selection left of the name, the usage below it. */
async function phoneRowApart(page: Page, path: string) {
  const row = tile(page, path), name = row.locator(".media-library__name");
  const [select, usage, box] = await Promise.all([row.locator(".media-library__select").boundingBox(), row.locator(".media-library__usage").boundingBox(), name.boundingBox()]);
  for (const target of [select!, usage!]) expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44);
  expect(select!.x + select!.width).toBeLessThanOrEqual(box!.x);
  expect(select!.x + select!.width).toBeLessThanOrEqual(usage!.x);
  expect(usage!.y).toBeGreaterThanOrEqual(box!.y + box!.height - 1);
  // One line: never broken in the middle of a word.
  expect(box!.height).toBeLessThan(30);
}
const clipped = (page: Page, path: string) => tile(page, path).locator(".media-library__name-head").evaluate(head => head.scrollWidth > head.clientWidth + 1);

test("on a phone the list shortens a long name in the middle, keeping its end; the full name is its tooltip and in details", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountUsage(page, baseURL);
  await page.evaluate(() => (window as any).usageProbe.checked());
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "List", exact: true }).click();
  const full = LONG.split("/").pop()!, row = tile(page, LONG), name = row.locator(".media-library__name");
  await expect(name).toHaveText(full);
  await expect(name).toHaveAttribute("title", full);
  await expect(row.getByRole("button", { name: `Details for ${LONG}`, exact: true })).toBeVisible();
  expect(await clipped(page, LONG)).toBe(true);
  await expect(row.locator(".media-library__name-tail")).toHaveText("ober.png");
  await expect(row.locator(".media-library__name-tail")).toBeInViewport({ ratio: 1 });
  expect(await name.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(row.locator(".media-library__size")).toHaveText(/^\d+ (B|KB)$/);
  await phoneRowApart(page, LONG);
  // Short names stay whole, and the usage words keep one line.
  expect(await clipped(page, "images/feed.png")).toBe(false);
  const words = tile(page, "images/feed.png").locator(".media-library__usage-label");
  await expect(words).toHaveText("Used on 1 page");
  expect((await words.boundingBox())!.height).toBeLessThan(24);
  await page.evaluate(() => (window as any).usageProbe.dispose());
});

test("the list keeps 44 px selection and usage targets apart on a phone, without sideways scrolling", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  await view(page, "List");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["images/placeholder.svg", "images/studio-desk.svg"]) {
      await expect(tile(page, path).locator(".media-library__size")).toHaveText(/\d/);
      await phoneRowApart(page, path);
      expect(await clipped(page, path)).toBe(false);
    }
    await expect(tile(page, "images/studio-desk.svg").locator(".media-library__usage")).toContainText("No uses found");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  // Back to the grid from More.
  await view(page, "Grid");
  await expect(pane(page).locator(".media-library__grid--list")).toHaveCount(0);
});

/** The list controls whose soft background shows, as "path usage" or "path select". */
const lit = (page: Page) => pane(page).locator(".media-library__grid--list").evaluate(list => [...list.querySelectorAll<HTMLElement>(".media-library__usage, .media-library__select")]
  .filter(control => getComputedStyle(control, "::before").display !== "none")
  .map(control => `${control.closest<HTMLElement>(".media-library__card")!.dataset.path} ${control.classList.contains("media-library__usage") ? "usage" : "select"}`));

test("in the list a tap on a phone leaves no row lit, and a mouse lights only the control it is over", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  await open(phone, baseURL);
  await view(phone, "List");
  const badge = tile(phone, "images/studio-desk.svg").getByRole("button", { name: "No uses found", exact: true });
  await badge.tap();
  const usage = phone.getByRole("dialog", { name: "studio-desk.svg", exact: true });
  await usage.locator(".media-usage__close").tap();
  await expect(usage).toHaveCount(0);
  await tile(phone, "images/placeholder.svg").locator(".media-library__select").tap();
  await expect(tile(phone, "images/placeholder.svg").getByRole("checkbox")).toBeChecked();
  expect(await lit(phone)).toEqual([]);
  await context.close();

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await open(page, baseURL);
  await view(page, "List");
  const row = tile(page, "images/studio-desk.svg");
  await row.locator(".media-library__usage").hover();
  await expect.poll(() => lit(page)).toEqual(["images/studio-desk.svg usage"]);
  // The background stays inside the control's own box, not the row's.
  expect(await row.locator(".media-library__usage").evaluate(control => getComputedStyle(control).position)).toBe("relative");
  await row.locator(".media-library__select").hover();
  await expect.poll(() => lit(page)).toEqual(["images/studio-desk.svg select"]);
  await page.close();
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

// To check (slice 19): agent-written descriptions wait with a by-agent mark until OK or Edit.
async function seed(page: Page, baseURL: string | undefined, files: [string, string][]) {
  await page.goto(baseURL!);
  for (const [path, content] of files)
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
}
async function toCheck(page: Page, label: string) {
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "To check", exact: true })).toBeFocused();
}
const agentMark = (page: Page, path: string) => tile(page, path).getByRole("img", { name: "By agent", exact: true });

test("To check lists an agent's description; OK clears the mark, and it stays cleared after Publish", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page, baseURL, [[".editor/media.json", JSON.stringify({ version: 2, collections: [],
    files: { "images/placeholder.svg": { description: { text: "A green placeholder, by an agent", byAgent: true } } } })]]);
  await open(page, baseURL);
  const library = pane(page);
  await expect(agentMark(page, "images/placeholder.svg")).toBeVisible();
  await expect(agentMark(page, "images/studio-desk.svg")).toHaveCount(0);
  await details(page, "images/placeholder.svg");
  await expect(library.getByText("By agent: press OK in To check, or change the words here.", { exact: true })).toBeVisible();
  await library.getByRole("button", { name: "Back", exact: true }).click();

  await toCheck(page, "To check (1)");
  const row = library.locator(".media-check__row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("placeholder.svg");
  await expect(row.locator(".media-check__words")).toHaveText("A green placeholder, by an agent");
  await row.getByRole("button", { name: "OK placeholder.svg", exact: true }).click();
  await expect(library.getByText(/^Nothing to check\./)).toBeVisible();
  await expect(library.getByRole("heading", { name: "To check", exact: true })).toBeFocused();
  await expect.poll(() => records(page)).not.toContain("byAgent");
  expect(JSON.parse(await records(page)).files["images/placeholder.svg"].description).toEqual({ text: "A green placeholder, by an agent" });
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(library.getByRole("button", { name: "More", exact: true })).toBeFocused();
  await expect(agentMark(page, "images/placeholder.svg")).toHaveCount(0);

  // Publish saves the checked description; after a reload nothing waits.
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  const saved = await (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(".editor/media.json")}`)).text();
  expect(JSON.parse(saved).files["images/placeholder.svg"].description).toEqual({ text: "A green placeholder, by an agent" });
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(library.getByRole("button", { name: "Details for images/placeholder.svg", exact: true })).toBeVisible();
  await expect(agentMark(page, "images/placeholder.svg")).toHaveCount(0);
  await toCheck(page, "To check");
  await expect(library.getByText(/^Nothing to check\./)).toBeVisible();
});

test("To check edits an agent's own words for a place on the page, in one Undo step", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(baseURL!);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await seed(page, baseURL, [
    ["index.html", home.replace('data-key="hero-image">', 'data-key="hero-image" alt="Agent words for the hero">')],
    [".editor/media.json", JSON.stringify({ version: 2, collections: [],
      files: { "images/placeholder.svg": { places: { "index.html": { agentText: "Agent words for the hero" } } } } })],
  ]);
  await open(page, baseURL);
  const library = pane(page), hero = page.frameLocator(".native-preview-frame").locator(".hero-image");
  await expect(agentMark(page, "images/placeholder.svg")).toBeVisible();
  await toCheck(page, "To check (1)");
  const row = library.locator(".media-check__row");
  await expect(row).toContainText("Own words on Home");
  await row.getByRole("button", { name: "Edit placeholder.svg on Home", exact: true }).click();
  const words = library.getByRole("textbox", { name: "Description for placeholder.svg on Home", exact: true });
  await expect(words).toBeFocused(); await expect(words).toHaveValue("Agent words for the hero");
  // Blank words are refused and the field stays; Cancel writes nothing.
  await words.fill(" ");
  await library.getByRole("button", { name: "Save placeholder.svg on Home", exact: true }).click();
  await expect(library.getByRole("status").last()).toContainText("Write the description, or press OK to keep these words.");
  await expect(words).toBeFocused();
  await library.getByRole("button", { name: "Cancel placeholder.svg on Home", exact: true }).click();
  await expect(row.getByRole("button", { name: "Edit placeholder.svg on Home", exact: true })).toBeFocused();
  await expect(row.locator(".media-check__words")).toHaveText("Agent words for the hero");
  expect(await storedDraft(page, ".editor/media.json")).toBeUndefined();
  await row.getByRole("button", { name: "Edit placeholder.svg on Home", exact: true }).click();
  await words.fill("A calm green hero picture");
  await library.getByRole("button", { name: "Save placeholder.svg on Home", exact: true }).click();
  await expect(library.getByText(/^Nothing to check\./)).toBeVisible();
  await expect(hero).toHaveAttribute("alt", "A calm green hero picture");
  await expect.poll(() => records(page)).not.toContain("agentText");
  // One Undo brings back the agent's words and the row.
  await page.locator(".code-editor__undo").first().click();
  await expect(hero).toHaveAttribute("alt", "Agent words for the hero");
  // Undo sits outside the explorer, which closes; it reopens on To check with the row back.
  if (!(await library.isVisible())) await page.locator("#explorer-toggle").click();
  await expect(row).toHaveCount(1);
  await expect(row.locator(".media-check__words")).toHaveText("Agent words for the hero");
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(agentMark(page, "images/placeholder.svg")).toBeVisible();
});
