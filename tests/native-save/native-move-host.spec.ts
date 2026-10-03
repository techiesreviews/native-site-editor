import { expect, test, type Page } from "@playwright/test";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
async function undo(page: Page) {
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
}
test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = before.replace(/(<main[^>]*>)[\s\S]*?<\/main>/, '$1\n<section id="first"><p id="moving">Moving paragraph</p><p id="second">Second paragraph</p></section>\n<section id="target"><p>Target paragraph</p></section>\n</main>');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
  });
  await expect(frame(page).locator("#moving")).toBeVisible();
  await frame(page).locator("#moving").click({ position: { x: 5, y: 5 } });
});

test("ordinary sibling buttons and canvas Alt+Down move one step with exact Undo", async ({ page }) => {
  const before = await source(page);
  await expect(bar(page).getByRole("button", { name: "Move up", exact: true })).toBeDisabled();
  await bar(page).getByRole("button", { name: "Move down", exact: true }).click();
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "second");
  await expect(frame(page).locator("#first > p").last()).toHaveAttribute("id", "moving");
  await undo(page); await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "moving");
  await frame(page).locator("#moving").click({ position: { x: 5, y: 5 } });
  await frame(page).locator("#moving").press("Escape");
  // Escape selects the parent; reselect the paragraph without opening a text caret.
  await page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: "Paragraph Moving paragraph", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Move down", exact: true })).toBeVisible();
  await frame(page).locator("body").press("Alt+ArrowDown");
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "second");
  await undo(page); await expect.poll(() => source(page)).toBe(before);
});

test("the keyboard Move to menu moves across containers and one Undo restores exact source", async ({ page }) => {
  const before = await source(page);
  const menu = bar(page).getByRole("button", { name: "Move to", exact: true });
  await menu.focus(); await menu.press("Enter");
  const destination = page.getByRole("menuitem", { name: /^Inside section#target, at the end/ });
  await destination.focus(); await destination.press("Enter");
  await expect(frame(page).locator("#target > #moving")).toBeVisible();
  await expect(frame(page).locator("#first > #moving")).toHaveCount(0);
  expect(await source(page)).toContain('<section id="target"><p>Target paragraph</p>');
  await undo(page); await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("#first > #moving")).toBeVisible();
});

test("a detached move callback refuses newer source and allows a fresh retry", async ({ page }) => {
  await bar(page).getByRole("button", { name: "Move down", exact: true }).evaluate(element => Object.assign(window, { oldNativeMove: element }));
  const changed = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = `<!-- agent changed move source -->\n${before}`;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
    return next;
  });
  await page.evaluate(() => (window as unknown as { oldNativeMove: HTMLElement }).oldNativeMove.click());
  expect(await source(page)).toBe(changed);
  await expect(page.locator("#status")).toContainText("source or selection changed");
  await frame(page).locator("#moving").click({ position: { x: 5, y: 5 } });
  await bar(page).getByRole("button", { name: "Move down", exact: true }).click();
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "second");
  expect(await source(page)).toContain("<!-- agent changed move source -->");
});

test("Page structure Alt+Down uses the painted element's source proof and one Undo", async ({ page }) => {
  const before = await source(page);
  const row = page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: "Paragraph Moving paragraph", exact: true });
  await row.focus(); await row.press("Alt+ArrowDown");
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "second");
  await undo(page); await expect.poll(() => source(page)).toBe(before);
});


test("Alt+Down while typing remains native and does not move the element", async ({ page }) => {
  const before = await source(page);
  await expect(frame(page).locator("#moving")).toHaveAttribute("contenteditable", "plaintext-only");
  await frame(page).locator("#moving").evaluate(() => {
    document.addEventListener("keydown", event => {
      if (event.altKey && event.key === "ArrowDown") Object.assign(window, { nativeMoveTypingPrevented: event.defaultPrevented });
    });
  });
  await frame(page).locator("#moving").press("Alt+ArrowDown");
  expect(await frame(page).locator("#moving").evaluate(() => (window as unknown as { nativeMoveTypingPrevented: boolean }).nativeMoveTypingPrevented)).toBe(false);
  expect(await source(page)).toBe(before);
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "moving");
});
