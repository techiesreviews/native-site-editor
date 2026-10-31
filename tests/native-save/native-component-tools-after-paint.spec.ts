import { expect, test, type Page } from "@playwright/test";
import { clickOnText } from "./click-text";
import { editorMounted, effectiveSource } from "./drafts";

// The component tools (src/page-builder/components.ts) load two frames and a beat after the first
// preview paint (src/workspace-mount.ts, ticket agents-and-multiplayer 42): their module's request is
// held here, so the page shows and works before they land, and draws their parts once they do.
const TOOLS = "/src/page-builder/components.ts";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
const firstCard = (page: Page) => tree(page).getByRole("treeitem", { name: /^Project card Reusable cards/ }).first();
const titleBadge = (page: Page) => tree(page).locator(".page-structure__slot-badge").and(page.getByRole("button", { name: "Edit Title", exact: true }));
const editBar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const selectedCrumb = (page: Page) => page.locator(".canvas-crumb[aria-current=true]");

async function holdModule(page: Page, path: string) {
  let held!: () => void;
  const reached = new Promise<void>(resolve => { held = resolve; });
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === path, async route => {
    held();
    await released;
    await route.continue();
  });
  return { reached, release };
}

async function openHome(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  await tree(page).getByRole("treeitem", { name: "Section", exact: true }).locator(".page-structure__toggle").click();
}

test("before the component tools land the instance shows without their parts; once they land the rows and the edit bar draw them, with no reselect", async ({ page, baseURL }) => {
  const tools = await holdModule(page, TOOLS);
  await openHome(page, baseURL);
  await tools.reached;
  await firstCard(page).click();
  await expect(firstCard(page)).toHaveAttribute("aria-selected", "true");
  await expect(editBar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(editBar(page).locator(".edit-bar__kind--component")).toHaveCount(0);
  await expect(titleBadge(page)).toHaveCount(0);
  tools.release();
  await expect(editBar(page).locator(".edit-bar__kind--component")).toHaveText("Project card");
  await expect(firstCard(page)).toHaveAttribute("aria-selected", "true");
  if ((await firstCard(page).getAttribute("aria-expanded")) !== "true") await firstCard(page).locator(".page-structure__toggle").click();
  await expect(titleBadge(page)).toBeVisible();
});

// The page's menu holds the component tools' entries: a plain section offers Make component.
// The pointer goes between two of its paragraphs, so the section itself is right-clicked.
async function rightClickSection(page: Page) {
  const first = frame(page).locator('[data-key="filler-1"]'), second = frame(page).locator('[data-key="filler-2"]');
  await first.scrollIntoViewIfNeeded();
  const [a, b] = [await first.boundingBox(), await second.boundingBox()];
  await page.mouse.click(a!.x + 20, (a!.y + a!.height + b!.y) / 2, { button: "right" });
}
test("a right-click before the component tools land opens the element's menu once they do", async ({ page, baseURL }) => {
  const tools = await holdModule(page, TOOLS);
  await openHome(page, baseURL);
  await tools.reached;
  const menu = page.getByRole("menu", { name: "Element actions", exact: true });
  await rightClickSection(page);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(menu).toBeHidden();
  tools.release();
  await expect(menu.getByRole("menuitem", { name: "Make component", exact: true })).toBeVisible();
});

test("a component tools load that fails is reported once, stays quiet through later edits, and the tools load after a reload", async ({ page, baseURL }) => {
  let requests = 0;
  await page.route(url => url.pathname === TOOLS, async route => {
    if (!requests++) await route.abort("failed");
    else await route.continue();
  });
  // Recovery offers a manual reload rather than reloading the tab.
  await page.addInitScript(() => { if (!sessionStorage.getItem("am42-reloaded")) sessionStorage.setItem("native-site-editor:chunk-reload", "1"); });
  await openHome(page, baseURL);
  const notice = page.locator("#notice");
  await expect(notice).toContainText("reload the page manually");
  expect(requests).toBe(1);
  // The page still works: the instance selects, without its component parts.
  await firstCard(page).click();
  await expect(editBar(page).locator(".edit-bar__kind")).toHaveText("Project card");
  await expect(editBar(page).locator(".edit-bar__kind--component")).toHaveCount(0);
  // The notice put away (as the editor does when a later action succeeds), edits repaint the page and bring it back never.
  await notice.evaluate(element => { element.hidden = true; });
  const title = frame(page).locator('[data-key="filler-title"]');
  for (const text of [" again", "!"]) {
    await clickOnText(title);
    await expect(title).toHaveAttribute("contenteditable", /.+/);
    await page.keyboard.press("End");
    await page.keyboard.type(text);
    await page.keyboard.press("Escape");
    await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toContain(`Scroll to verify again${text === "!" ? "!" : ""}`);
  }
  await expect(notice).toBeHidden();
  expect(requests).toBe(1);
  await page.evaluate(() => sessionStorage.setItem("am42-reloaded", "1"));
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await expect.poll(() => requests).toBe(2);
  await tree(page).getByRole("treeitem", { name: "Section", exact: true }).locator(".page-structure__toggle").click();
  await firstCard(page).click();
  await expect(editBar(page).locator(".edit-bar__kind--component")).toHaveText("Project card");
});

test("the Add panel's New component pressed before the component tools land places the component once they do", async ({ page, baseURL }) => {
  const tools = await holdModule(page, TOOLS);
  await openHome(page, baseURL);
  await tools.reached;
  const panel = page.getByRole("dialog", { name: "Add to the page" });
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await panel.getByRole("button", { name: "+ New component", exact: true }).click();
  await panel.getByRole("textbox", { name: "Component name" }).pressSequentially("services");
  await panel.getByRole("button", { name: "Create", exact: true }).click();
  await expect(frame(page).locator("section-services")).toHaveCount(0);
  tools.release();
  await expect(frame(page).locator("main > section.filler + section-services")).toHaveCount(1);
  await expect(page.locator("#status")).toContainText("Made the component <section-services>");
});

// Page Structure's row menu is the component tools' entries for a page's section: before they land
// the row has no ⋯ (nothing to offer); the rows redraw when they land, with Make component.
test("a Page Structure section row offers Make component once the component tools land", async ({ page, baseURL }) => {
  const tools = await holdModule(page, TOOLS);
  await openHome(page, baseURL);
  await tools.reached;
  const row = tree(page).getByRole("treeitem", { name: "Section", exact: true });
  const more = row.locator(":scope > .row-action-overlay").getByRole("button", { name: "Actions for Section", exact: true });
  await row.hover();
  await expect(more).toHaveCount(0);
  tools.release();
  await row.hover();
  await more.click();
  await expect(page.getByRole("menu", { name: "Actions for Section", exact: true }).getByRole("menuitem", { name: "Make component", exact: true })).toBeVisible();
});

// The tools landing between an edit bar change and the preview's update (a Bold just pressed) leave the
// bar to the preview's next selection: the next change in the bar reads the bytes the Bold wrote.
// The preview's update travels by postMessage, which page.route cannot hold, so this order is not
// forced here; tests/workspace-mount.test.ts forces it.
test("component tools that land right after a Bold leave the next bar change working", async ({ page, baseURL }) => {
  // A phone, as the UX check met it: Page Structure is folded into the sheet.
  await page.setViewportSize({ width: 390, height: 844 });
  const tools = await holdModule(page, TOOLS);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero p.lead")).toBeVisible();
  await editorMounted(page);
  await tools.reached;
  await frame(page).locator(".hero p.lead").click();
  await expect(selectedCrumb(page)).toHaveText("p.lead");
  // The Blocks rail adds a paragraph after the lead; the lead's bar already says "Paragraph", so the
  // wait is on the crumb turning to the new paragraph, or the Bold lands on the lead's bar.
  await page.getByRole("navigation", { name: "Blocks", exact: true }).getByRole("button", { name: "Paragraph", exact: true }).click();
  await expect(selectedCrumb(page)).toHaveText("p");
  await editBar(page).getByRole("button", { name: "Bold" }).click();
  tools.release();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("l");
  await expect(editBar(page).getByRole("combobox", { name: "Text size" })).toHaveValue("l");
  // Bold and L both land on the new paragraph; the lead keeps its plain text.
  await expect.poll(() => effectiveSource(page, baseURL, "index.html"))
    .toMatch(/<p class="lead"[^>]*>[^<]*<\/p>\s*<p style="font-size: 1.25rem"><strong>Text<\/strong><\/p>/);
  await expect(page.getByText("The source changed. Select the element again and try again.")).toHaveCount(0);
});
