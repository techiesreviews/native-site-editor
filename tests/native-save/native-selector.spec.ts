import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const cssPath = "src/styles/site.css";
const componentCssPath = "src/components/project-card/project-card.css";
const cssSource = readFileSync(resolve(fixture, cssPath), "utf8");
const componentCssSource = readFileSync(resolve(fixture, componentCssPath), "utf8");
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const manifestSource = readFileSync(resolve(fixture, ".astro-editor/native.json"), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
});

async function pasteInto(page: Page, host: string, source: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await expect(textbox).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

async function copyEditorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  return page.evaluate(() => navigator.clipboard.readText());
}

async function copySelectedEditorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+C");
  return page.evaluate(() => navigator.clipboard.readText());
}

test("selecting a page element opens its source and matching CSS rule", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  await frame.locator(".hero h1").click();

  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(page.locator("#secondary-rules")).toContainText(".hero h1");
  await expect(page.locator("#content-secondary .view-lines")).toContainText(".hero h1");
  await expect.poll(() => copySelectedEditorText(page, "#content-secondary")).toContain(".hero h1");
});

test("shared CSS stays open before and after preview selection clears", async ({ page }) => {
  test.setTimeout(30_000);
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(page.locator("#secondary-rules")).toContainText("body");
  await expect(page.locator("#content-secondary .view-lines")).toContainText("body");

  const frameHandle = await page.locator(".native-preview-frame").elementHandle();
  const child = await frameHandle!.contentFrame();
  await child!.evaluate(() => {
    window.parent.postMessage({
      source: "astro-native-preview",
      type: "select",
      context: "stale",
      path: "",
      selectors: [],
    }, "*");
  });

  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(page.locator("#secondary-rules")).toContainText("body");
  await expect(page.locator("#content-secondary .view-lines")).toContainText("body");
});

test("selection with no direct matching rules falls back to shared body CSS", async ({ page }) => {
  test.setTimeout(30_000);
  const source = indexSource.replace(
    "<p data-key=\"filler-5\">Paragraph five closes out the filler block on the home route.</p>",
    "<unmatched-probe data-key=\"probe\">Probe</unmatched-probe>\n    <p data-key=\"filler-5\">Paragraph five closes out the filler block on the home route.</p>",
  );
  await pasteInto(page, "#content", source);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("unmatched-probe")).toBeVisible();

  await frame.locator("unmatched-probe").click();

  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(page.locator("#secondary-rules")).toContainText("body");
  await expect.poll(() => copySelectedEditorText(page, "#content-secondary")).toContain("body");
});

test("selecting inside a shadow component opens the component owner and shared CSS stays live through undo and redo", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("project-card")).toHaveCount(3, { timeout: 30_000 });

  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  await child!.evaluate(() => {
    const card = document.querySelector("project-card") as HTMLElement;
    const body = card.shadowRoot!.querySelector(".project-card__body") as HTMLElement;
    body.click();
  });

  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/project-card/project-card.html");
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(page.locator("#secondary-rules")).toContainText(".project-card__body");
  await expect.poll(() => copySelectedEditorText(page, "#content-secondary")).toContain(".project-card__body");

  const redTitleCss = cssSource.replace(
    ".project-card__body {\n  margin: 0;\n  color: var(--muted);",
    ".project-card__body {\n  margin: 0;\n  color: rgb(190, 20, 40);",
  );
  expect(redTitleCss).not.toBe(cssSource);
  await pasteInto(page, "#content-secondary", redTitleCss);
  await expect
    .poll(() => frame.locator(".project-card__body").first().evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(190, 20, 40)");
  await expect
    .poll(() => frame.locator(".project-card__body").nth(1).evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(190, 20, 40)");

  await page.locator("#content-secondary [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+Z");
  await expect
    .poll(() => frame.locator(".project-card__body").first().evaluate((el) => getComputedStyle(el).color))
    .not.toBe("rgb(190, 20, 40)");

  await page.locator("#content-secondary [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect
    .poll(() => frame.locator(".project-card__body").first().evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(190, 20, 40)");
});

test("refreshing a native selection while typing CSS does not steal the secondary editor caret", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("project-card")).toHaveCount(3, { timeout: 30_000 });
  // The component's own stylesheet loads after the frame reports the tag; the
  // click must resolve against it, not only the shared stylesheet.
  await expect
    .poll(() => frame.locator(".project-card").first().evaluate((el) => getComputedStyle(el).borderLeftColor))
    .toBe("rgb(47, 109, 58)");
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  await child!.evaluate(() => {
    const card = document.querySelector("project-card") as HTMLElement;
    const title = card.shadowRoot!.querySelector(".project-card__title") as HTMLElement;
    title.click();
  });
  await expect(page.locator("#secondary-title")).toHaveText(componentCssPath);

  const textbox = page.locator("#content-secondary [role=\"textbox\"]").first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+End");
  const suffix = "\n/* caret-stable */";
  await page.keyboard.type(suffix);
  await expect
    .poll(() => frame.locator(".project-card__title").first().evaluate((el) => getComputedStyle(el).fontSize))
    .toBe("20px");

  const text = await copyEditorText(page, "#content-secondary");
  expect(text.endsWith(suffix)).toBeTruthy();
});

test("links select by default, ctrl/cmd click navigates, and bad messages stay filtered", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await frame.getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();

  await frame.locator(".hero h1").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/about.html");
  await expect(page.locator("#secondary-rules")).toContainText(".hero h1");
  await expect.poll(() => copySelectedEditorText(page, "#content-secondary")).toContain(".hero h1");

  const frameHandle = await page.locator(".native-preview-frame").elementHandle();
  const child = await frameHandle!.contentFrame();
  await child!.evaluate(() => {
    window.parent.postMessage({
      source: "astro-native-preview",
      type: "select",
      context: "stale",
      path: "../../etc/passwd",
      selectors: [{ path: "src/styles/site.css", selector: "body" }],
    }, "*");
  });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/about.html");

  // A plain click on a link selects it (the link lives in the header component)
  // and does not navigate: the About page stays rendered.
  await frame.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/site-header/site-header.html");
  await expect(page.locator("#secondary-rules")).toContainText(".site-nav a");
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  await frame.getByRole("link", { name: "Home", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible();
});

test("component CSS loads on demand, scopes to matching shadow root, and edits live", async ({ page }) => {
  expect(JSON.parse(manifestSource).styles).not.toContain(componentCssPath);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("project-card")).toHaveCount(3, { timeout: 30_000 });
  await expect
    .poll(() => frame.locator(".project-card").first().evaluate((el) => getComputedStyle(el).borderLeftColor))
    .toBe("rgb(47, 109, 58)");

  const frameHandle = await page.locator(".native-preview-frame").elementHandle();
  const child = await frameHandle!.contentFrame();
  const scope = await child!.evaluate(() => {
    const card = document.querySelector("project-card") as HTMLElement;
    const header = document.querySelector("site-header") as HTMLElement;
    const text = (sheet: CSSStyleSheet) => [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    const shared = document.adoptedStyleSheets;
    const cardSheets = card.shadowRoot!.adoptedStyleSheets;
    const headerSheets = header.shadowRoot!.adoptedStyleSheets;
    return {
      documentSheets: shared.length,
      cardSheets: cardSheets.length,
      headerSheets: headerSheets.length,
      sharedIsOneInstance: cardSheets[0] === shared[0] && headerSheets[0] === shared[0],
      noStyleElements:
        document.querySelectorAll("style").length +
        card.shadowRoot!.querySelectorAll("style").length +
        header.shadowRoot!.querySelectorAll("style").length,
      sharedText: text(shared[0]),
      cardStyleText: text(cardSheets[1]),
      headerStyleText: text(headerSheets[1]),
    };
  });
  // The shared stylesheet is one constructed sheet adopted by the document and
  // every shadow root, with no copies as <style> elements. Each component
  // adopts only its own sibling stylesheet after it (then the runtime's
  // one-rule sheet for hidden optional parts): none leak into the host
  // document, and the card's rules never reach the header's shadow root.
  expect(scope.documentSheets).toBe(1);
  expect(scope.cardSheets).toBe(3);
  expect(scope.headerSheets).toBe(3);
  expect(scope.sharedIsOneInstance).toBe(true);
  expect(scope.noStyleElements).toBe(0);
  expect(scope.sharedText).toContain("--accent");
  expect(scope.cardStyleText).toContain(".project-card");
  expect(scope.headerStyleText).not.toContain(".project-card");
  expect(scope.headerStyleText).toContain(".site-header");

  await child!.evaluate(() => {
    const card = document.querySelector("project-card") as HTMLElement;
    const title = card.shadowRoot!.querySelector(".project-card__title") as HTMLElement;
    title.click();
  });
  await expect(page.locator("#secondary-title")).toHaveText(componentCssPath);
  await expect(page.locator("#secondary-rules")).toContainText(".project-card__title");
  await expect(page.locator("#secondary-rules")).toContainText("site.css");

  const redCardCss = componentCssSource.replace(
    "border-left: 4px solid rgb(47, 109, 58)",
    "border-left: 4px solid rgb(200, 30, 30)",
  );
  await pasteInto(page, "#content-secondary", redCardCss);
  await expect
    .poll(() => frame.locator(".project-card").first().evaluate((el) => getComputedStyle(el).borderLeftColor))
    .toBe("rgb(200, 30, 30)");

  await page.locator("#content-secondary [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+Z");
  await expect
    .poll(() => frame.locator(".project-card").first().evaluate((el) => getComputedStyle(el).borderLeftColor))
    .toBe("rgb(47, 109, 58)");
});

test("slotted light DOM selection keeps page ownership and inline grouped CSS ignores inactive duplicates", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const source = indexSource
    .replace("<span slot=\"title\">Reusable cards</span>", "<span class=\"slot-probe\" slot=\"title\">Reusable cards</span>")
    .replace(
      "</main>",
      `<style>
@media (max-width: 1px) {
  .slot-probe { color: rgb(1, 2, 3); }
}
.slot-probe, .lead { color: rgb(190, 20, 40); }
</style>
</main>`,
    );
  await pasteInto(page, "#content", source);
  await expect
    .poll(() => frame.locator(".slot-probe").evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(190, 20, 40)");

  await frame.locator(".slot-probe").click();

  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect.poll(() => caretToLineEnd(page, "#content")).toBe("Reusable cards</span>");
  await page.locator("#secondary-rules button", { hasText: "slot-probe" }).first().click();
  const selected = await copySelectedEditorText(page, "#content");
  expect(selected).toContain(".slot-probe, .lead");
  expect(selected).toContain("rgb(190, 20, 40)");
  expect(selected).not.toContain("max-width: 1px");
  await expect(page.locator("#content-secondary .view-lines")).toContainText("body");
});

// Text from the editor caret to the end of its line.
async function caretToLineEnd(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowLeft");
  return text;
}

test("selecting an element puts the caret after its start tag in the owning source", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("project-card")).toHaveCount(3, { timeout: 30_000 });

  await frame.locator(".filler p").nth(2).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(page.locator("#content .code-editor__element")).toHaveCount(1);
  await expect
    .poll(() => caretToLineEnd(page, "#content"))
    .toBe("Paragraph three of filler content, still plain semantic HTML rendered natively.</p>");

  // Slotted light DOM belongs to the page, under the right card.
  await frame.locator("project-card").nth(1).locator("p[slot=body]").click();
  await expect.poll(() => caretToLineEnd(page, "#content"))
    .toBe("The header and footer are custom elements shared across Home and About.</p>");

  // Inside a shadow root the component template owns the element.
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  await child!.evaluate(() => {
    const card = document.querySelectorAll("project-card")[2] as HTMLElement;
    (card.shadowRoot!.querySelector("card-note") as HTMLElement).click();
  });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/project-card/project-card.html");
  await expect.poll(() => caretToLineEnd(page, "#content")).toBe("Shared across cards</card-note>");

  // Edits above the element keep the mark on it.
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("<!-- note -->\n");
  await expect(page.locator("#content .code-editor__element")).toHaveCount(1);
});

test("a click while the file is still opening is not lost", async ({ page }) => {
  await page.reload();
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("project-card")).toHaveCount(3, { timeout: 30_000 });
  await frame.locator(".filler p").nth(2).click();
  await expect(page.locator("#content .code-editor__element")).toHaveCount(1);
  await expect
    .poll(() => caretToLineEnd(page, "#content"))
    .toBe("Paragraph three of filler content, still plain semantic HTML rendered natively.</p>");
});

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b, selector).not.toBeNull();
  return b!;
}

async function drag(page: Page, selector: string, dx: number, dy: number) {
  const h = await box(page, selector);
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test("preview frame fills the pane above the code split", async ({ page }) => {
  const main = await box(page, "#main");
  const split = await box(page, "#main > .code-split");
  const pane = await box(page, "#main > .preview-pane");
  const frame = await box(page, ".native-preview-frame");
  expect(Math.abs(frame.height - (main.height - split.height))).toBeLessThanOrEqual(4);
  expect(Math.abs(frame.width - pane.width)).toBeLessThanOrEqual(2);
});

test("code-pane splitters resize the preview and the primary pane", async ({ page }) => {
  const splitBefore = await box(page, "#main > .code-split");
  const frameBefore = await box(page, ".native-preview-frame");
  const frameWindowBefore = await page.locator(".native-preview-frame").elementHandle();
  const innerBefore = await frameWindowBefore!.contentFrame();
  await drag(page, ".code-resize", 0, -150);
  await expect.poll(async () => (await box(page, "#main > .code-split")).height - splitBefore.height).toBeGreaterThan(140);
  const splitAfter = await box(page, "#main > .code-split");
  const frameAfter = await box(page, ".native-preview-frame");
  expect(Math.abs(splitAfter.height - splitBefore.height - 150)).toBeLessThanOrEqual(4);
  expect(Math.abs(frameBefore.height - frameAfter.height - 150)).toBeLessThanOrEqual(4);
  await expect
    .poll(() => innerBefore!.evaluate(() => document.scrollingElement!.scrollHeight > innerHeight))
    .toBe(true);

  await page.locator(".code-resize").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await box(page, ".native-preview-frame")).height - frameAfter.height).toBeGreaterThan(8);

  await page.frameLocator(".native-preview-frame").locator(".hero h1").click();
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(page.locator(".code-width-resize")).toBeVisible();
  const primaryBefore = await box(page, "#main .code-pane");
  await drag(page, ".code-width-resize", -120, 0);
  await expect.poll(async () => Math.abs((await box(page, "#main .code-pane")).width - primaryBefore.width)).toBeGreaterThan(80);
});

// The explorer: a folder only opens or closes in the tree; a component file
// opens with its own stylesheet beside it and the preview stays.
async function explorerItem(page: Page, name: string) {
  const item = page.locator("#explorer").getByRole("button", { name, exact: true }).first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  return item;
}

test("folders only expand, and a component file opens beside its own CSS", async ({ page }) => {
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await page.locator("#explorer-toggle").click();
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.locator("#explorer")).toBeVisible();
  for (const part of ["src", "components", "project-card"]) {
    const item = await explorerItem(page, part);
    if ((await item.getAttribute("aria-expanded")) === "false") await item.click();
    await expect(item).toHaveAttribute("aria-expanded", "true");
    // The open page and its stylesheet are untouched by browsing folders.
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
    await expect(page.locator("#secondary-title")).toHaveText(cssPath);
    await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached();
  }
  // Collapsing a folder changes nothing either.
  await (await explorerItem(page, "project-card")).click();
  await expect(await explorerItem(page, "project-card")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await (await explorerItem(page, "project-card")).click();

  await (await explorerItem(page, "project-card.html")).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/project-card/project-card.html");
  await expect(page.locator("#content .view-lines")).toContainText("project-card__title", { timeout: 20_000 });
  await expect(page.locator("#secondary-title")).toHaveText(componentCssPath);
  await expect(page.locator("#content-secondary .view-lines")).toContainText("project-card");
  await expect(page.locator(".native-preview-frame")).toBeVisible();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();

  // A component without its own stylesheet opens beside the shared one.
  await page.locator("#explorer-toggle").click();
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  await page.getByRole("tab", { name: "Files" }).click();
  const featureFolder = await explorerItem(page, "feature-block");
  if ((await featureFolder.getAttribute("aria-expanded")) === "false") await featureFolder.click();
  await (await explorerItem(page, "feature-block.html")).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/feature-block/feature-block.html");
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  // No page uses it, so the preview shows the component by itself, still editable.
  const frame = page.frameLocator(".native-preview-frame");
  const featureTitle = frame.locator("feature-block h2");
  await expect(featureTitle).toHaveText("A feature worth sharing");
  await expect(frame.locator(".hero h1")).toHaveCount(0);
  // Inside the page container, so it is no wider than a page section.
  await expect(frame.locator("main.page > feature-block")).toHaveCount(1);
  expect((await frame.locator("feature-block").boundingBox())!.width).toBeLessThanOrEqual(960);
  await featureTitle.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/feature-block/feature-block.html");
  // Editing the template renders in place.
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await page.keyboard.press("Enter");
  await expect(featureTitle).toHaveText("A feature worth sharing!");
  await expect(page.locator("#content .view-lines")).toContainText("A feature worth sharing!</slot>");

  // Opening a page brings its route back.
  await page.locator("#explorer-toggle").click();
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  await page.getByRole("tab", { name: "Files" }).click();
  const pages = await explorerItem(page, "pages");
  if ((await pages.getAttribute("aria-expanded")) === "false") await pages.click();
  await (await explorerItem(page, "index.html")).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(frame.locator(".hero h1")).toBeVisible();
  await expect(frame.locator("feature-block")).toHaveCount(0);
});
