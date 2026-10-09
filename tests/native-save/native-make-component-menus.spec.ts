import { expect, test, type Page } from "@playwright/test";
import { editorMounted, effectiveSource, storedDraft } from "./drafts";

// Default native-starter fixture group; slice 26's shared element menu.
const tag = "section-a-native-browser";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string) => tree(page).getByRole("treeitem", { name, exact: true }).first();
const sectionRow = (page: Page) => row(page, "Section A native browser preview");
const menu = (page: Page) => page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Make component", exact: true }) });

async function clickSection(page: Page, button: "left" | "right" = "right") {
  const section = frame(page).locator("section.hero");
  await section.scrollIntoViewIfNeeded();
  // A point of the section's own, not of a child.
  const position = await section.evaluate(el => {
    const box = el.getBoundingClientRect();
    for (let y = 2; y < box.height; y += 4) for (const x of [4, box.width - 4]) {
      if (el.ownerDocument.elementFromPoint(box.left + x, box.top + y) === el) return { x, y };
    }
    throw new Error("no point of the section's own");
  });
  await section.click({ button, position });
}

/** Right-clicks the section until its menu shows: a click made while a render is on its way is dropped. */
async function previewMenu(page: Page) {
  await expect(async () => {
    await clickSection(page);
    await expect(menu(page)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
});

for (const entry of ["Structure button", "Structure right-click", "preview right-click", "Shift+F10", "ContextMenu"]) {
  test(`${entry} makes the clicked section at once and opens Edit component mode`, async ({ page, baseURL }) => {
    const before = await effectiveSource(page, baseURL, "index.html");
    if (entry === "Structure button") {
      await sectionRow(page).hover();
      await sectionRow(page).getByRole("button", { name: "Actions for Section A native browser preview", exact: true }).click();
    }
    else if (entry === "Structure right-click") await sectionRow(page).click({ button: "right" });
    else if (entry === "preview right-click") await previewMenu(page);
    else { await sectionRow(page).focus(); await sectionRow(page).press(entry); }
    await expect(menu(page)).toBeVisible();
    await menu(page).getByRole("menuitem", { name: "Make component", exact: true }).click();
    await expect(page.locator(".edit-mode__title")).toHaveText(`Editing<${tag}>`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toContain(`<${tag}>`);
    await expect.poll(async () => (await storedDraft(page, `components/${tag}/${tag}.html`))?.content).toContain('<slot name="title">');
    // Edit component mode offers no Make component, including on a container.
    await frame(page).locator(`${tag} section`).click({ button: "right", position: { x: 8, y: 8 } });
    await expect(menu(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Done editing component", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(before);
    await expect.poll(() => storedDraft(page, `components/${tag}/${tag}.html`)).toBeUndefined();
  });
}

test("main, heading, page components and instance contents have no Make component menu", async ({ page }) => {
  await sectionRow(page).locator(".page-structure__toggle").click();
  await row(page, "Section").locator(".page-structure__toggle").click();
  const card = row(page, "Project card Reusable cards");
  await card.locator(".page-structure__toggle").click();
  const content = card.locator("+ [role=group] > [role=treeitem]").first();
  for (const target of [row(page, "Main"), row(page, "Heading A native browser preview"), row(page, "Site header"), row(page, "Site footer"), card, content]) {
    await expect(target.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
    await target.click({ button: "right" });
    await expect(menu(page)).toHaveCount(0);
  }
  // Each right-click is seen (the edit bar leaves the section first) and opens no menu.
  const kind = page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind");
  for (const selector of [".hero h1", "site-header", "site-footer", "project-card .project-card__title"]) {
    await clickSection(page, "left");
    await expect(kind).toHaveText("Section");
    await frame(page).locator(selector).first().click({ button: "right" });
    await expect(kind).not.toHaveText("Section");
    await expect(menu(page)).toHaveCount(0);
  }
});

test("preview menu closes on Escape, a preview press, scroll, re-render and window blur", async ({ page }) => {
  await previewMenu(page);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator(".native-preview-frame")).toBeFocused();
  await previewMenu(page);
  await clickSection(page, "left");
  await expect(menu(page)).toHaveCount(0);
  await previewMenu(page);
  await frame(page).locator("body").evaluate(() => window.scrollBy(0, 100));
  await expect(menu(page)).toHaveCount(0);
  await previewMenu(page);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource("index.html")!;
    const start = source.indexOf('<section class="hero"');
    editor.replaceActiveRange({ path: "index.html", start, end: start, expected: "", text: '<!-- menu refresh -->' });
  });
  await expect(menu(page)).toHaveCount(0);
  await previewMenu(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(menu(page)).toHaveCount(0);
});


test("a stale Structure row refuses its menu action without creating a component", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.addEventListener("message", event => {
      if (document.documentElement?.hasAttribute("data-hold-menu-paint") &&
        event.data?.source === "astro-native-preview-host" && event.data.type === "update") event.stopImmediatePropagation();
    });
  });
  await page.reload();
  await editorMounted(page);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  // Register before the runtime, then hold its next paint on the old source.
  await frame(page).locator("body").evaluate(() => document.documentElement.setAttribute("data-hold-menu-paint", ""));
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    editor.replaceActiveRange({ path: "index.html", start: 0, end: 0, expected: "", text: "<!-- changed before menu -->" });
  });
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toContain("<!-- changed before menu -->");
  await sectionRow(page).hover();
  await sectionRow(page).getByRole("button", { name: "Actions for Section A native browser preview", exact: true }).click();
  await expect(page.locator("#status")).toContainText("The source changed. Wait for the preview");
  await expect(menu(page)).toHaveCount(0);
  expect(await storedDraft(page, `components/${tag}/${tag}.html`)).toBeUndefined();
});

test("typing and History viewing keep the browser context menu", async ({ page, baseURL }) => {
  await frame(page).locator(".hero h1").click();
  await expect(frame(page).locator(".hero h1")).toHaveAttribute("contenteditable", /^(true|plaintext-only)$/);
  const browserMenuAllowed = () => frame(page).locator(".hero h1").evaluate(el =>
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true })));
  expect(await browserMenuAllowed()).toBe(true);
  await expect(menu(page)).toHaveCount(0);
  const source = await effectiveSource(page, baseURL, "index.html");
  const edited = await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: "index.html", content: source!.replace("A native browser preview", "Updated on GitHub") },
  });
  expect(edited.ok()).toBeTruthy();
  await page.reload();
  await editorMounted(page);
  await page.locator("#history-button").click();
  const history = page.getByRole("dialog", { name: "History", exact: true });
  await expect(history.locator(".commit-history__item")).toHaveCount(2);
  await history.locator(".commit-history__item").nth(1).locator(".commit-history__view").click();
  await expect(page.getByRole("region", { name: "Earlier version" })).toBeVisible();
  await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");
  expect(await browserMenuAllowed()).toBe(true);
  await expect(menu(page)).toHaveCount(0);
});

test("after following a link in the preview, one right-click makes that page's section a component", async ({ page, baseURL }) => {
  await frame(page).getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).getByRole("heading", { name: "About this project" })).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  // The selection opens about/index.html; the menu it came with stays open meanwhile.
  await clickSection(page);
  await expect(menu(page)).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole("menuitem", { name: "Make component", exact: true }).click();
  await expect(page.locator(".edit-mode__title")).toHaveText("Editing<section-about-this-project>");
  await expect.poll(() => effectiveSource(page, baseURL, "about/index.html")).toContain("<section-about-this-project>");
});

test("the Structure menu opens the page first when a stylesheet is the open file", async ({ page, baseURL }) => {
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files" }).click();
  await page.locator("#files").getByRole("button", { name: "styles", exact: true }).click();
  await page.locator("#files").getByRole("button", { name: "site.css", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await page.keyboard.press("Escape");
  await sectionRow(page).click({ button: "right" });
  await menu(page).getByRole("menuitem", { name: "Make component", exact: true }).click();
  await expect(page.locator(".edit-mode__title")).toHaveText(`Editing<${tag}>`);
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toContain(`<${tag}>`);
});

test("closing a row's menu leaves the row's folding as it was", async ({ page }) => {
  await sectionRow(page).locator(".page-structure__toggle").click();
  await expect(sectionRow(page)).toHaveAttribute("aria-expanded", "true");
  await sectionRow(page).click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(sectionRow(page)).toHaveAttribute("aria-expanded", "true");
});
