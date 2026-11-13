import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { openSiteSettings } from "./site-settings-open";

// Atomic catalogue 07: no toasts. A result is said in the #status live region (heard by screen
// readers) and shows where it happened; Undo is the top bar's. A Media screen's inline warning
// does not carry over to the next screen. Default fixture group: native-starter (501).
const toast = (page: Page) => page.locator(".editor-toast");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Site settings", exact: true });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test("Site settings' Update links is said in the live region only, and the top bar's Undo takes the change back", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // A load-progress status shows nothing either.
  await expect(toast(page)).toHaveCount(0);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openSiteSettings(page);
  await dialog(page).getByLabel("Site address", { exact: true }).fill("https://user.github.io/my-site/");
  await dialog(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Update links", exact: true }).click();
  await expect(dialog(page)).toBeHidden();

  const said = "Site settings applied as drafts. Updated 9 links in 4 files to the new address. Added the .nojekyll file GitHub Pages needs. Publish to keep them.";
  // Screen readers still hear it: the live region says it in full.
  await expect(page.locator("#status")).toHaveText(said);
  await expect(page.locator("#status")).toHaveAttribute("aria-live", /polite|assertive/);
  // Nothing is drawn: no toast element, and no popover standing over the page.
  await expect(toast(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll("[popover]:popover-open:not(#explorer)").length)).toBe(0);
  // The top bar's Undo takes the whole change back, saying so in the live region.
  await expect.poll(async () => (await storedDraft(page, ".nojekyll"))?.content).toBe("");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  await expect(page.locator("#status")).toHaveText("Undid site settings and the links updated to the new address.");
  await expect(toast(page)).toHaveCount(0);
});

test("a Media screen's warning does not carry over to the next screen, and a result is said in the live region, not as a line or a toast", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div"); host.id = "media-toast-harness";
    host.style.cssText = "position:fixed;right:0;top:60px;width:440px;height:calc(100vh - 60px);z-index:100;background:var(--surface)";
    document.body.append(host);
    let fail = true;
    const view = createMediaLibraryView(host, {
      async load() { return { key: "toast-carry-over", items: [{ path: "images/a.svg" }], metadata: {}, collections: [], usage: {} }; },
      async blob() {
        if (fail) throw new Error("The picture could not be read");
        return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" });
      },
      async metadata() {}, async collections() {}, async import() { return []; }, async rename() {}, async remove() {}, async openPage() {},
    });
    Object.assign(window, { toastHarness: { view, succeed: () => { fail = false; } } }); await view.ready;
  });
  const panel = page.getByRole("region", { name: "Media", exact: true });
  const line = panel.locator(".media-library__message");
  await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  // A warning stays inline, where it happened.
  await expect(line).toHaveText("Error: The picture could not be read");
  await page.evaluate(() => (window as any).toastHarness.succeed());
  // The next screen (the file's details) starts without it.
  await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await expect(line).toBeEmpty();
  // A result is said in the live region only; the inline line stays empty.
  await panel.getByLabel("Description", { exact: true }).fill("A small square");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Details saved as a draft.");
  await expect(toast(page)).toHaveCount(0);
  await expect(line).toBeEmpty();
  await page.evaluate(() => (window as any).toastHarness.view.dispose());
});

// A copied path shows on the ⋯ button that ran it: its dots turn into a check for a moment. The
// clipboard is stood in for, so the press needs no permission.
const stubClipboard = (page: Page) => page.evaluate(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copied?: string }).copied = text; } } });
});

test("Files, ⋯, Copy path: the check shows on that ⋯ button, and the live region says what was copied", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await stubClipboard(page);
  const explorer = page.locator("#explorer");
  await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files", exact: true }).click();
  const line = explorer.locator('.file-row-line:has(> .file-row[data-path="index.html"])');
  await line.hover();
  const more = line.getByRole("button", { name: "Actions for index.html", exact: true });
  const dots = await more.innerHTML();
  await more.click();
  await page.getByRole("menu", { name: "Actions for index.html" }).getByRole("menuitem", { name: "Copy path", exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe("index.html");
  await expect(more).toHaveAttribute("data-done", "");
  expect(await more.innerHTML()).not.toBe(dots);
  // The pointer has left the row (it was over the menu item): the check is still seen, not faded out with the overlay.
  await page.mouse.move(5, 5);
  await expect(more).toBeVisible();
  await expect(more).toHaveCSS("opacity", "1");
  await expect(page.locator("#status")).toHaveText("Copied index.html");
  await expect(toast(page)).toHaveCount(0);
  // It goes back to the dots by itself.
  await expect(more).not.toHaveAttribute("data-done", "");
  expect(await more.innerHTML()).toBe(dots);
  await expect(more).toHaveAccessibleName("Actions for index.html");
});

test("Media details, ⋯, Copy path: the check shows on the ⋯ button, and the live region says Path copied", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await stubClipboard(page);
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div"); host.id = "media-copy-harness";
    host.style.cssText = "position:fixed;right:0;top:60px;width:440px;height:calc(100vh - 60px);z-index:100;background:var(--surface)";
    document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() { return { key: "copy-path", items: [{ path: "images/a.svg" }], metadata: {}, collections: [], usage: {} }; },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async import() { return []; }, async rename() {}, async remove() {}, async openPage() {},
    });
    Object.assign(window, { copyHarness: view }); await view.ready;
  });
  const panel = page.getByRole("region", { name: "Media", exact: true });
  await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  const more = panel.getByRole("button", { name: "More for this file", exact: true });
  await more.click();
  await page.getByRole("menu", { name: "More for this file", exact: true }).getByRole("menuitem", { name: "Copy path", exact: true }).click();
  await expect(more).toHaveAttribute("data-done", "");
  await expect(page.locator("#status")).toHaveText("Path copied.");
  expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe("/images/a.svg");
  await expect(toast(page)).toHaveCount(0);
  await expect(more).not.toHaveAttribute("data-done", "");
  await page.evaluate(() => (window as any).copyHarness.dispose());
});

test("Download site: the button itself reads Preparing… and is busy until the files are ready, then reads Download site again", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.evaluate(async () => {
    const { mountSiteActions } = await import("/src/components/site-actions.ts");
    const statusHost = document.createElement("div"), menuHost = document.createElement("div");
    menuHost.id = "download-harness";
    document.body.append(statusHost, menuHost);
    let release!: () => void, slow = false;
    const gate = new Promise<void>(done => { release = done; });
    const site = { paths: [], held: () => undefined, blob: async () => undefined, readTexts: async () => ({}) };
    mountSiteActions({ statusHost, menuHost, announce: text => { document.getElementById("status")!.textContent = text; },
      // The first read shows the button; the one the press makes waits, then fails (so no file is saved).
      siteFiles: async () => { if (!slow) return site as never; await gate; throw new Error("stopped for the test"); } });
    Object.assign(window, { downloadHarness: { slow: () => { slow = true; }, release } });
  });
  const download = page.locator("#download-harness .site-actions__download");
  await expect(download).toHaveText("Download site");
  await page.evaluate(() => (window as any).downloadHarness.slow());
  await download.click();
  await expect(download).toHaveText("Preparing…");
  await expect(download).toBeDisabled();
  await expect(download).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#status")).toHaveText("Preparing the download…");
  await expect(toast(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).downloadHarness.release());
  // Settled (here, stopped): the button is itself again, and the refusal note says why.
  await expect(download).toHaveText("Download site");
  await expect(download).toBeEnabled();
  await expect(download).not.toHaveAttribute("aria-busy");
  await expect(page.locator(".refusal-note")).toHaveText("The site could not be downloaded: stopped for the test");
});

test("Files, ⋯, Copy path from the keyboard: the check is seen on the ⋯ button too", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await stubClipboard(page);
  const explorer = page.locator("#explorer");
  await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Files", exact: true }).click();
  const more = explorer.getByRole("button", { name: "Actions for index.html", exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Actions for index.html" });
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  // Arrow down to Copy path, the last item of a file's menu.
  for (let step = 0; step < (await items.count()) - 1; step++) await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Copy path", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("data-done", "");
  await page.mouse.move(5, 5);
  await expect(more).toBeVisible();
  await expect(more).toHaveCSS("opacity", "1");
  await expect(page.locator("#status")).toHaveText("Copied index.html");
});

test("Download site pressed in the real project menu: the menu stays open and the button reads Preparing… until the files are ready", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // The zip code loads when the button is pressed: held, the files are not ready.
  let release: (() => void) | undefined;
  const held = new Promise<void>(done => { release = done; });
  await page.route(/\/src\/zip\.ts|\/zip-[\w-]+\.js/, async route => { await held; await route.continue().catch(() => undefined); });
  await page.locator(".repository-menu__trigger").click();
  const menu = page.locator("#repository-actions");
  await expect(menu).toBeVisible();
  const download = menu.locator(".site-actions__download");
  const saved = page.waitForEvent("download");
  // The project menu hides its site actions for now (repository-menu.ts `showSiteActions`), so the press is made on the DOM:
  // what is checked is that the menu's own click handler leaves the menu open around the busy button.
  await download.evaluate(button => (button as HTMLElement).click());
  await expect(download).toHaveText("Preparing…");
  await expect(menu).toBeVisible();
  await expect(download).toHaveAttribute("aria-busy", "true");
  release!();
  await saved;
  await expect(download).toHaveText("Download site");
  await expect(download).not.toHaveAttribute("aria-busy");
  await expect(toast(page)).toHaveCount(0);
});
