import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
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

const FIRST = '<section id="first"><p id="moving">Moving paragraph</p><p id="second">Second paragraph</p></section>';
const TARGET = '<section id="target"><p>Target paragraph</p></section>';
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
// Section rows are named "Section"; index 0 is the first in the page.
const sectionRow = (page: Page, index: number) => tree(page).getByRole("treeitem", { name: "Section", exact: true }).nth(index);
const frameFocused = (page: Page) => page.evaluate(() => document.activeElement?.classList.contains("native-preview-frame") ?? false);
const order = (page: Page) => frame(page).locator("main > section");
// The two sections swapped, byte for byte: nothing else in the page changes.
const swapped = (before: string) => {
  expect(before).toContain(`${FIRST}\n${TARGET}`);
  return before.replace(`${FIRST}\n${TARGET}`, `${TARGET}\n${FIRST}`);
};
async function selectSection(page: Page, index: number) {
  await sectionRow(page, index).click();
  await expect(bar(page).getByRole("button", { name: "Move down", exact: true })).toBeVisible();
}

// Lex removed element moves from the bar and the canvas: only whole sections move there.
test("a paragraph offers no Move up, Move down or Move to in the bar", async ({ page }) => {
  const before = await source(page);
  await tree(page).getByRole("treeitem", { name: "Paragraph Moving paragraph", exact: true }).click();
  await expect(bar(page)).toBeVisible();
  for (const name of ["Move up", "Move down", "Move to"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  expect(await source(page)).toBe(before);
});

test("a section moves past its sibling from canvas Alt+Down, the bar and Structure Alt+Down, each with exact source and one Undo", async ({ page }) => {
  const before = await source(page), moved = swapped(before);
  // Canvas: beforeEach clicked the paragraph in the page; Escape selects its section and keys stay in the preview.
  await frame(page).locator("#moving").press("Escape");
  await expect(bar(page).getByRole("button", { name: "Move down", exact: true })).toBeVisible();
  expect(await frameFocused(page)).toBe(true);
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => source(page)).toBe(moved);
  await expect(order(page).first()).toHaveAttribute("id", "target");
  await expect(order(page).last()).toHaveAttribute("id", "first");
  await undo(page); await expect.poll(() => source(page)).toBe(before);
  await expect(order(page).first()).toHaveAttribute("id", "first");

  await selectSection(page, 0);
  await expect(bar(page).getByRole("button", { name: "Move up", exact: true })).toBeDisabled();
  await bar(page).getByRole("button", { name: "Move down", exact: true }).click();
  await expect.poll(() => source(page)).toBe(moved);
  await undo(page); await expect.poll(() => source(page)).toBe(before);

  const row = sectionRow(page, 0);
  await row.focus(); await row.press("Alt+ArrowDown");
  await expect.poll(() => source(page)).toBe(moved);
  await expect(order(page).first()).toHaveAttribute("id", "target");
  await undo(page); await expect.poll(() => source(page)).toBe(before);
});

test("consecutive section moves are one Undo step each and return the exact source", async ({ page }) => {
  const before = await source(page), moved = swapped(before);
  await selectSection(page, 0);
  await bar(page).getByRole("button", { name: "Move down", exact: true }).click();
  await expect.poll(() => source(page)).toBe(moved);
  // The moved section stays selected: now last, it moves back up.
  await expect(bar(page).getByRole("button", { name: "Move down", exact: true })).toBeDisabled();
  await bar(page).getByRole("button", { name: "Move up", exact: true }).click();
  await expect.poll(() => source(page)).toBe(before);
  await undo(page); await expect.poll(() => source(page)).toBe(moved);
  await undo(page); await expect.poll(() => source(page)).toBe(before);
  await expect(order(page).first()).toHaveAttribute("id", "first");
});

test("a detached section move callback refuses newer source and allows a fresh retry", async ({ page }) => {
  await selectSection(page, 0);
  await bar(page).getByRole("button", { name: "Move down", exact: true }).evaluate(element => Object.assign(window, { oldNativeMove: element }));
  const changed = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = `<!-- agent changed move source -->\n${before}`;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
    return next;
  });
  // The old button, held from before the change, is pressed after it.
  await page.evaluate(() => (window as unknown as { oldNativeMove: HTMLElement }).oldNativeMove.click());
  expect(await source(page)).toBe(changed);
  await expect(page.locator("#status")).toContainText("source or selection changed");
  await selectSection(page, 0);
  await bar(page).getByRole("button", { name: "Move down", exact: true }).click();
  await expect.poll(() => source(page)).toBe(swapped(changed));
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


test("a refused stale Structure move consumes Alt+Down and keeps row focus", async ({ page }) => {
  const row = page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: "Paragraph Moving paragraph", exact: true });
  await row.focus();
  const result = await row.evaluate(async element => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const changed = `<!-- foreign change -->\n${before}`;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: changed });
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return { prevented: event.defaultPrevented, focus: document.activeElement === element, changed, source: editor.getMountedSource("index.html") };
  });
  expect(result.prevented).toBe(true);
  expect(result.focus).toBe(true);
  expect(result.source).toBe(result.changed);
  await expect(page.locator("#status")).toContainText("source changed");
});

test("a delayed painted Structure cannot bind reordered agent source", async ({ page }) => {
  await page.evaluate(() => {
    window.addEventListener("message", event => {
      if (event.data?.source === "astro-native-preview" && event.data.type === "structure") Object.assign(window, { oldPaintedStructure: event.data });
    });
  });
  // A real source update makes the runtime emit its complete painted tree.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: `<!-- paint capture -->\n${before}` });
  });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).oldPaintedStructure))).toBe(true);
  const paintedRow = page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: "Paragraph Moving paragraph", exact: true });
  const changed = await paintedRow.evaluate(async row => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const changed = before.replace('<p id="moving">Moving paragraph</p><p id="second">Second paragraph</p>', '<p id="second">Second paragraph</p><p id="moving">Moving paragraph</p>');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: changed });
    const child = document.querySelector<HTMLIFrameElement>(".native-preview-frame")!.contentWindow!;
    window.dispatchEvent(new MessageEvent("message", { source: child, data: (window as any).oldPaintedStructure }));
    const currentRow = document.querySelector<HTMLElement>(`#structure [role="treeitem"][data-node="${(row as HTMLElement).dataset.node}"]`)!;
    currentRow.focus(); currentRow.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    return { changed, source: editor.getMountedSource("index.html") };
  });
  expect(changed.source).toBe(changed.changed);
  await expect(frame(page).locator("#first > p").first()).toHaveAttribute("id", "second");
});

test("a new shadow selection clears the previous section shortcut before its file opens", async ({ page }) => {
  await page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: /^Section/ }).first().click();
  const before = await source(page);
  await page.evaluate(() => {
    window.addEventListener("message", event => {
      if (event.data?.source !== "astro-native-preview" || event.data.type !== "select" || !event.data.path?.startsWith("components/")) return;
      const child = document.querySelector<HTMLIFrameElement>(".native-preview-frame")!.contentWindow!;
      window.dispatchEvent(new MessageEvent("message", { source: child, data: { source: "astro-native-preview", type: "move", direction: "down", context: event.data.context } }));
      Object.assign(window, { gapMoveChecked: true });
    });
  });
  await frame(page).locator("site-header a").first().click({ position: { x: 5, y: 5 } });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).gapMoveChecked))).toBe(true);
  expect((await storedDraft(page, "index.html")).content).toBe(before);
});

test("a section move waiting for its page editor refuses a foreign draft written during that await", async ({ page, baseURL }) => {
  const record = await storedDraft(page, "index.html");
  expect(record).toBeDefined();
  await page.goto(`${baseURL}/#repo=501&branch=main&file=styles/site.css`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(frame(page).locator("#first")).toBeVisible();
  const row = page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: /^Section/ }).first();
  const raced = await row.evaluate(async (element, record) => {
    const editor = await import("/src/components/code-editor.ts");
    const { draftStore } = await import("/src/drafts.ts");
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    const awaiting = document.querySelector("#current-page")?.getAttribute("data-path") === "index.html" && editor.getMountedSource("index.html") === undefined;
    const changed = record!.content.replace('<section id="first">', '<section id="first" data-agent="during-open">');
    draftStore().save({ ...record!, content: changed, updatedAt: Date.now() } as import("../../src/drafts").SavedDraft);
    return { awaiting, changed };
  }, record);
  expect(raced.awaiting).toBe(true);
  await expect(page.locator("#status")).toHaveText("The source changed while its editor opened. Select the section again before moving it.");
  expect(await source(page)).toBeUndefined();
  await expect(frame(page).locator("main > section").first()).toHaveAttribute("id", "first");
  expect((await storedDraft(page, "index.html"))?.content).toBe(raced.changed);
  await expect(frame(page).locator("#first")).toHaveAttribute("data-agent", "during-open");
  await page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: /^Section/ }).first().press("Alt+ArrowDown");
  await expect(frame(page).locator("main > section").first()).toHaveAttribute("id", "target");
  expect(await source(page)).toContain('data-agent="during-open"');
  await undo(page); await expect.poll(() => source(page)).toBe(raced.changed);
});

test("a never-saved page's section move preserves a foreign draft written while its editor opens", async ({ page }) => {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  const title = page.getByRole("textbox", { name: "New page title", exact: true });
  await title.fill("Waiting page"); await title.press("Enter");
  const path = "waiting-page/index.html";
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await page.evaluate(async path => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource(path)!;
    const text = before.replace(/(<main[^>]*>)[\s\S]*?<\/main>/, '$1<section id="new-first"><p>First draft section</p></section><section id="new-target"><p>Second draft section</p></section></main>');
    editor.replaceActiveRange({ path, start: 0, end: before.length, expected: before, text });
  }, path);
  await expect(frame(page).locator("#new-first")).toBeVisible();
  const record = await storedDraft(page, path);
  expect(record?.baseSha).toBeNull();
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  const styles = page.locator("#explorer").getByRole("button", { name: "styles", exact: true });
  if (await styles.getAttribute("aria-expanded") !== "true") await styles.click();
  await page.locator("#explorer").getByRole("button", { name: "site.css", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(frame(page).locator("#new-first")).toBeVisible();
  const row = page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: /^Section/ }).first();
  const raced = await row.evaluate(async (element, { record, path }) => {
    const editor = await import("/src/components/code-editor.ts");
    const { draftStore } = await import("/src/drafts.ts");
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    const awaiting = document.querySelector("#current-page")?.getAttribute("data-path") === path && editor.getMountedSource(path) === undefined;
    const changed = record!.content.replace('<section id="new-first">', '<section id="new-first" data-agent="during-new-open">');
    draftStore().save({ ...record!, content: changed, updatedAt: Date.now() } as import("../../src/drafts").SavedDraft);
    return { awaiting, changed };
  }, { record, path });
  expect(raced.awaiting).toBe(true);
  await expect(page.locator("#status")).toHaveText("The source changed while its editor opened. Select the section again before moving it.");
  expect((await storedDraft(page, path))?.content).toBe(raced.changed);
  await expect(frame(page).locator("main > section").first()).toHaveAttribute("id", "new-first");
  await expect(frame(page).locator("#new-first")).toHaveAttribute("data-agent", "during-new-open");
  await page.getByRole("tree", { name: "Page structure", exact: true }).getByRole("treeitem", { name: /^Section/ }).first().press("Alt+ArrowDown");
  await expect(frame(page).locator("main > section").first()).toHaveAttribute("id", "new-target");
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), path)).toBe(true);
  await expect.poll(() => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path)).toBe(raced.changed);
});
