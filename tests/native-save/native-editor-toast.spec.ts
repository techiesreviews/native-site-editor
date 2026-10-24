import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

// Slice 105: one visible confirmation for the whole editor. Results show as a toast (and stay in
// the #status live region); a Media screen's inline warning does not carry over to the next screen.
// Default fixture group: native-starter (501).
const toast = (page: Page) => page.locator(".editor-toast");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Site settings", exact: true });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test("Site settings' Update links shows a visible toast naming the count, whose Undo takes the change back", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // A load-progress status never shows as a toast.
  await expect(toast(page)).toHaveCount(0);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await dialog(page).getByLabel("Site address", { exact: true }).fill("https://user.github.io/my-site/");
  await dialog(page).getByRole("button", { name: "Apply site settings", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Update links", exact: true }).click();
  await expect(dialog(page)).toBeHidden();

  const said = "Site settings applied as drafts. Updated 9 links in 4 files to the new address. Added the .nojekyll file GitHub Pages needs. Publish to keep them.";
  await expect(toast(page)).toBeInViewport({ ratio: 1 });
  // Then held under the pointer: on a busy machine the checks below outlast its 6 s.
  // The drafts' own save timer must run, so the clock is not paused here.
  await toast(page).hover();
  await expect(toast(page).locator(".editor-toast__text")).toHaveText(said);
  // The live region still says it, for screen readers.
  await expect(page.locator("#status")).toHaveText(said);
  // Its one action, Undo, takes the whole change back.
  await expect.poll(async () => (await storedDraft(page, ".nojekyll"))?.content).toBe("");
  await toast(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  await expect(page.locator("#status")).toHaveText("Undid site settings and the links updated to the new address.");
  await expect(toast(page).locator(".editor-toast__text")).toHaveText("Undid site settings and the links updated to the new address.");
  await expect(toast(page).getByRole("button", { name: "Undo", exact: true })).toBeHidden();
});

test("a Media screen's warning does not carry over to the next screen, and a result is a toast, not a line", async ({ page, baseURL }) => {
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
  // A result shows as the toast; the inline line stays empty.
  await panel.getByLabel("Description", { exact: true }).fill("A small square");
  await panel.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(toast(page).locator(".editor-toast__text")).toHaveText("Details saved as a draft.");
  await expect(page.locator("#status")).toHaveText("Details saved as a draft.");
  await expect(line).toBeEmpty();
  await page.evaluate(() => (window as any).toastHarness.view.dispose());
});

test("a shown toast follows each layer opened over it, keeps its Undo usable, and goes after 6 s unless held", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // Installed after load (a clock from the start fakes `performance` for Monaco too); paused, so
  // the toast's 6 s cannot run out while the layers open.
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  const show = () => page.evaluate(async () => {
    const { showToast } = await import("/src/components/toast.ts");
    showToast("Moved the hero.", { label: "Undo", run: () => { (window as any).toastUndone = ((window as any).toastUndone ?? 0) + 1; } });
  });
  await show();
  await expect(toast(page)).toBeVisible();
  expect(await toast(page).evaluate(element => element.parentElement === document.body)).toBe(true);

  // The explorer opens over it: the toast moves in, and its Undo there leaves the explorer open.
  const undone = () => page.evaluate(() => (window as any).toastUndone);
  const explorerOpen = () => page.locator("#explorer").evaluate(element => element.matches(":popover-open"));
  // Opened from the keyboard: a pointer resting on the button opens the explorer by hover, and a
  // click landing after that toggle closes and reopens it above the toast (ticket 16, for the lead).
  await page.locator("#explorer-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#explorer > .editor-toast")).toBeVisible();
  await toast(page).getByRole("button", { name: "Undo", exact: true }).click();
  expect(await undone()).toBe(1);
  expect(await explorerOpen()).toBe(true);
  await expect(toast(page)).toBeHidden();
  // A modal opened over a shown toast takes it in: its Undo is usable there and the modal stays.
  await show();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  await expect(dialog(page).locator(".editor-toast")).toBeVisible();
  await toast(page).getByRole("button", { name: "Undo", exact: true }).click();
  expect(await undone()).toBe(2);
  await expect(dialog(page)).toBeVisible();
  // The modal closing (it closed the explorer as it opened) hands the toast back to the page.
  await show();
  await expect(dialog(page).locator(".editor-toast")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator("body > .editor-toast")).toBeVisible();
  await page.keyboard.press("Escape");
  await toast(page).getByRole("button", { name: "Undo", exact: true }).click();
  expect(await undone()).toBe(3);

  // It stays 6 s (the pointer away from it: under the pointer, it would be held).
  await page.mouse.move(5, 5);
  await show();
  await page.clock.runFor(5_800);
  await expect(toast(page)).toBeVisible();
  await page.clock.runFor(400);
  await expect(toast(page)).toBeHidden();
  // Hovered, it stays; once the pointer leaves, it goes 2 s later.
  await show();
  await toast(page).hover();
  await page.clock.runFor(8_000);
  await expect(toast(page)).toBeVisible();
  await page.mouse.move(5, 5);
  await page.clock.runFor(2_200);
  await expect(toast(page)).toBeHidden();
  // Focused, it stays as well; once the focus leaves, it goes 2 s later.
  await show();
  await toast(page).getByRole("button", { name: "Undo", exact: true }).focus();
  await page.clock.runFor(8_000);
  await expect(toast(page)).toBeVisible();
  await page.locator("#explorer-toggle").focus();
  await page.clock.runFor(2_200);
  await expect(toast(page)).toBeHidden();
  await page.clock.resume();
});

test("a question that opens while a toast shows is not put inside the toast, and both keep working", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page, baseURL);
  // Paused as above: on a busy machine the toast's 6 s ran out before the question closed.
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.evaluate(async () => {
    const { showToast } = await import("/src/components/toast.ts");
    showToast("Added 2 files as drafts.");
    const { askToAddUnchanged } = await import("/src/page-builder/media-preparation-confirm.ts");
    void askToAddUnchanged("tram.png could not be made lighter.").then(answer => { (window as any).answered = answer; });
  });
  const question = page.getByRole("dialog", { name: "Add unchanged file?", exact: true });
  await expect(question).toBeVisible();
  await expect(question.locator(".editor-toast")).toBeVisible();
  expect(await page.locator(".editor-toast").evaluate(toast => toast.querySelector("dialog") === null)).toBe(true);
  await question.getByRole("button", { name: "Don't add", exact: true }).click();
  await expect(question).toBeHidden();
  expect(await page.evaluate(() => (window as any).answered)).toBe(false);
  await expect(page.locator("body > .editor-toast")).toBeVisible();
  expect(errors).toEqual([]);
  await page.clock.resume();
});
