import { expect, test, type Page } from "@playwright/test";
import { storedDraft, editorMounted } from "./drafts";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page, path = "index.html") => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
const firstCard = (page: Page) => tree(page).getByRole("treeitem", { name: /^Project card Reusable cards/ }).first();
// Compact Structure opens a slot's fields only from its badge, as an inline disclosure under the
// row. Only the first card is expanded, so its Title badge is the one in the tree.
const openTitle = async (page: Page) => {
  await tree(page).locator(".page-structure__slot-badge").and(page.getByRole("button", { name: "Edit Title", exact: true })).press("Enter");
  return tree(page).getByRole("textbox", { name: "Title: Text", exact: true });
};

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  await tree(page).getByRole("treeitem", { name: "Section", exact: true }).locator(".page-structure__toggle").click();
  await firstCard(page).locator(".page-structure__toggle").click();
});

test("Structure edits the page's slotted text in one Undo and keeps shared templates untouched", async ({ page }) => {
  const before = await source(page);
  const templatePath = "components/project-card/project-card.html";
  const templateBefore = await (await page.request.get(`/__demo/file?${new URLSearchParams({ path: templatePath })}`)).text();
  const templateDraftBefore = await storedDraft(page, templatePath);
  await firstCard(page).click();
  await expect(page.getByRole("region", { name: "Component properties" })).toHaveCount(0);
  const title = await openTitle(page);
  await title.fill("A page-specific card title");
  await title.press("Enter");
  await expect(frame(page).locator("project-card").first().locator('[slot="title"]')).toHaveText("A page-specific card title");
  expect(await source(page)).toContain('<span slot="title">A page-specific card title</span>');
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("project-card").first().locator('[slot="title"]')).toHaveText("Reusable cards");
  expect(await storedDraft(page, templatePath)).toEqual(templateDraftBefore);
  expect(await (await page.request.get(`/__demo/file?${new URLSearchParams({ path: templatePath })}`)).text()).toBe(templateBefore);
});

test("clicking a nested shared fallback selects the real page instance with its own styles", async ({ page }) => {
  const before = await source(page);
  const fallback = frame(page).locator("project-card").first().locator("card-note p");
  const sharedBefore = await storedDraft(page, "components/card-note/card-note.html");
  await fallback.dblclick({ position: { x: 5, y: 5 } });
  await fallback.press("x");
  await expect(fallback).not.toHaveAttribute("contenteditable", /.+/);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(firstCard(page)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Project card");
  expect(await source(page)).toBe(before);
  expect(await storedDraft(page, "components/card-note/card-note.html")).toEqual(sharedBefore);
});

test("explicit Edit permits the outer template while nested clicks stay in that scope", async ({ page }) => {
  await firstCard(page).getByRole("button", { name: "Edit component", exact: true }).click();
  const path = "components/project-card/project-card.html";
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  const before = await source(page, path);
  await frame(page).locator("project-card").first().locator("article.project-card").click({ position: { x: 3, y: 3 } });
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Article");
  await frame(page).locator("project-card").first().locator("card-note p").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Card note");
  expect(await source(page, path)).toBe(before);
  const authored = 'class="project-card"';
  const replacement = 'class="project-card reviewed"';
  await page.evaluate(async ({ path, before, authored, replacement }) => {
    const editor = await import("/src/components/code-editor.ts");
    const at = before!.indexOf(authored);
    if (at < 0) throw new Error("The outer template class was not found");
    editor.replaceActiveRange({ path, start: at, end: at + authored.length, expected: authored, text: replacement });
  }, { path, before, authored, replacement });
  await expect.poll(() => source(page, path)).toBe(before!.replace(authored, replacement));
  await expect(frame(page).locator("project-card").first().locator("article")).toHaveClass(/reviewed/);
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), path)).toBe(true);
  await expect.poll(() => source(page, path)).toBe(before);
  await expect(frame(page).locator("project-card").first().locator("article")).not.toHaveClass(/reviewed/);
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(frame(page).locator("project-card").first().locator("article")).not.toHaveClass(/reviewed/);
});


test("a component selected while CSS is primary routes to its real page before a field opens", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=styles/site.css`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(frame(page).locator("project-card").first()).toBeVisible();
  await frame(page).locator("project-card").first().locator("card-note p").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  const card = firstCard(page);
  await expect(card).toHaveAttribute("aria-selected", "true");
  if (await card.getAttribute("aria-expanded") === "false") await card.locator(".page-structure__toggle").click();
  const title = await openTitle(page);
  await title.fill("CSS-to-page instance edit"); await title.press("Enter");
  await expect(frame(page).locator("project-card").first().locator('[slot="title"]')).toHaveText("CSS-to-page instance edit");
  expect(await source(page)).toContain("CSS-to-page instance edit");
});


test("explicit Edit permits native typing in an outer template fallback and Undo restores it", async ({ page }) => {
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const match = /<p slot="body">[\s\S]*?<\/p>/.exec(before);
    if (!match) throw new Error("The page body assignment was not found");
    editor.replaceActiveRange({ path: "index.html", start: match.index, end: match.index + match[0].length, expected: match[0], text: "" });
  });
  await firstCard(page).getByRole("button", { name: "Edit component", exact: true }).click();
  const path = "components/project-card/project-card.html";
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  const before = await source(page, path);
  const body = frame(page).locator("project-card").first().locator(".project-card__body");
  await expect(body).toHaveText("No description yet.");
  await body.click({ position: { x: 5, y: 5 } });
  await expect(body).toHaveAttribute("contenteditable", "plaintext-only");
  await body.fill("Explicit shared inline edit"); await body.press("Enter");
  await expect.poll(() => source(page, path)).toBe(before!.replace("No description yet.", "Explicit shared inline edit"));
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), path)).toBe(true);
  await expect.poll(() => source(page, path)).toBe(before);
  await expect(body).toHaveText("No description yet.");
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  const templateDraft = await storedDraft(page, path);
  await body.dblclick({ position: { x: 5, y: 5 } }); await body.press("x");
  await expect(body).not.toHaveAttribute("contenteditable", /.+/);
  expect(await storedDraft(page, path)).toEqual(templateDraft);
  await expect(body).toHaveText("No description yet.");
});

test("a refused painted selection clears the old edit target before scrolling or detached Remove", async ({ page }) => {
  await tree(page).getByRole("treeitem", { name: /^Section/ }).first().click();
  const editBar = page.getByRole("toolbar", { name: "Edit bar", exact: true });
  await expect(editBar.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await editBar.getByRole("button", { name: "Remove", exact: true }).evaluate(element => Object.assign(window, { refusedOldRemove: element }));
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const mutateBeforeHostSelection = (event: MessageEvent) => {
      if (event.data?.source !== "astro-native-preview" || event.data.type !== "select" || event.data.reason !== "click" || !event.data.host) return;
      window.removeEventListener("message", mutateBeforeHostSelection, true);
      const before = editor.getMountedSource("index.html")!;
      const changed = `<!-- agent changed before host selection -->\n${before}`;
      editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: changed });
      Object.assign(window, { refusedChangedSource: changed });
    };
    window.addEventListener("message", mutateBeforeHostSelection, true);
  });
  await frame(page).locator("project-card").first().locator("card-note p").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#status")).toHaveText("The instance changed before it could be selected. Select it again.");
  await expect(editBar).toBeHidden();
  await expect(tree(page).locator('[aria-selected="true"]')).toHaveCount(0);
  await frame(page).locator("body").evaluate(() => window.scrollBy(0, 200));
  await expect(frame(page).locator('[data-native-selection-box="selected"]')).toBeHidden();
  await expect(editBar).toBeHidden();
  const preserved = await page.evaluate(async () => {
    (window as any).refusedOldRemove.click();
    return { source: (await import("/src/components/code-editor.ts")).getMountedSource("index.html"), expected: (window as any).refusedChangedSource };
  });
  expect(preserved.source).toBe(preserved.expected);
  await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");
});

test("the page around Edit component mode is not clickable; after Done a page element opens that page", async ({ page }) => {
  await firstCard(page).getByRole("button", { name: "Edit component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await expect(frame(page).locator("[data-native-selection-box='edit-shade']:visible")).not.toHaveCount(0);
  // The shade takes the click.
  await frame(page).locator(".hero h1").click({ position: { x: 5, y: 5 }, force: true });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await page.locator(".canvas-bar--component").getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await frame(page).locator(".hero h1").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Heading");
});


test("changing branch clears an old same-path template permission before the new preview paints", async ({ page, baseURL }) => {
  const base = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const feature = base.replace("A native browser preview", "Feature branch preview").replace(/<p slot="body">[\s\S]*?<\/p>/, "");
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature", path: "index.html", content: feature } });
  await firstCard(page).getByRole("button", { name: "Edit component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await page.evaluate(() => window.addEventListener("message", event => { if (event.data?.testScopePaint) ((window as any).branchPaintPermissions ??= []).push(event.data.permission); }));
  await page.addInitScript(() => {
    window.addEventListener("message", event => {
      if (event.data?.testScopePaint) ((window as any).branchPaintPermissions ??= []).push(event.data.permission);
      const payload = event.data?.payload;
      if (event.data?.type === "update" && payload?.pages?.["/"]?.includes("Feature branch preview")) window.parent.postMessage({ testScopePaint: true, permission: payload.editableTemplatePath ?? null }, "*");
    });
  });
  await page.goto(`${baseURL}/#repo=501&branch=feature&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with feature");
  await expect(frame(page).locator(".hero h1")).toHaveText("Feature branch preview");
  const permissions = await page.evaluate(() => (window as any).branchPaintPermissions as unknown[]);
  expect(permissions.length).toBeGreaterThan(0);
  expect(permissions.every(permission => permission === null)).toBe(true);
  const before = await source(page);
  const fallback = frame(page).locator("project-card").first().locator(".project-card__body");
  await expect(fallback).toHaveText("No description yet.");
  await fallback.dblclick({ position: { x: 5, y: 5 } }); await fallback.press("x");
  await expect(fallback).not.toHaveAttribute("contenteditable", /.+/);
  expect(await source(page)).toBe(before);
  expect(await storedDraft(page, "components/project-card/project-card.html")).toBeUndefined();
});

test("a nested host-chain report from an older render cannot replace a fresh page selection", async ({ page }) => {
  await page.evaluate(() => window.addEventListener("message", event => {
    if (event.data?.source !== "astro-native-preview" || event.data.type !== "select") return;
    Object.assign(window, { latestSelectionContext: event.data.context });
    if (event.data.hostChain?.length >= 2 && !(window as any).oldNestedReport) Object.assign(window, { oldNestedReport: event.data });
  }));
  const inner = frame(page).locator("project-card").first().locator("card-note p");
  const point = await inner.evaluate(el => ({ x: el.clientWidth - 3, y: el.clientHeight / 2 }));
  await inner.click({ position: point });
  await expect(firstCard(page)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.evaluate(() => (window as any).oldNestedReport?.hostChain?.length ?? 0)).toBeGreaterThanOrEqual(2);
  const changed = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const changed = `<!-- a newer painted source -->\n${before}`;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: changed });
    return changed;
  });
  await expect.poll(() => page.evaluate(() => (window as any).latestSelectionContext !== (window as any).oldNestedReport.context)).toBe(true);
  await frame(page).locator(".hero h1").click({ position: { x: 5, y: 5 } });
  const kind = page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind");
  await expect(kind).toHaveText("Heading");
  await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { source: document.querySelector<HTMLIFrameElement>(".native-preview-frame")!.contentWindow!, data: (window as any).oldNestedReport })));
  await expect(kind).toHaveText("Heading");
  await expect(firstCard(page)).not.toHaveAttribute("aria-selected", "true");
  expect(await source(page)).toBe(changed);
});

test("page-owned slot content selects atoms, while its layout wrapper selects the component instance", async ({ page }) => {
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const at = before.indexOf('</project-card>');
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<div class="slot-layout" style="padding:30px"><p>Slot paragraph</p><a href="/about/">Slot link</a><button>Slot button</button><img src="/images/project.svg" alt="Slot image"></div>' });
  });
  const host = frame(page).locator("project-card").first();
  const wrapper = host.locator(".slot-layout");
  await expect(wrapper).toBeVisible();
  await host.locator("article.project-card").click({ position: { x: 3, y: 3 } });
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Project card");
  await wrapper.click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Project card");
  for (const [selector, kind] of [[".slot-layout p", "Paragraph"], [".slot-layout a", "Link"], [".slot-layout button", "Button"], [".slot-layout img", "Image"]]) {
    await host.locator(selector).click({ position: { x: 3, y: 3 } });
    await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText(kind);
  }
});
