import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Plus buttons between page sections open a picker of the components that
// fit a section slot (template is one <section>); choosing one writes an
// instance into the page source as one undo step and selects it.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const featurePath = "components/feature-block/feature-block.html";
const featureSource = readFileSync(resolve(fixture, featurePath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

async function editorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

async function scrollFrame(page: Page, to: "top" | "bottom") {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await child!.evaluate((where) => window.scrollTo(0, where === "top" ? 0 : document.documentElement.scrollHeight), to);
}

const plus = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
// Plus buttons show only above and below the item under the pointer.
const shown = (page: Page) => page.locator(".insert-point.is-near .insert-point__plus");
async function hoverIn(page: Page, selector: string) {
  await page.frameLocator(".native-preview-frame").locator(selector).first().hover();
}
const picker = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });

test("a section plus inserts a component from its section-only group alongside native HTML", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  // One plus per gap among <main>'s sections, including both ends.
  await expect(page.locator(".insert-point__plus")).toHaveCount(4);
  const before = plus(page, "Add a section before “Scroll to verify”");
  // The gap between the cards and the filler sits below the frame's first screen.
  await frame.locator("section.filler h2").scrollIntoViewIfNeeded();
  await hoverIn(page, "section.cards");
  await expect(shown(page)).toHaveCount(2);
  await expect(shown(page).first()).toHaveAccessibleName(/^Add a section before “Reusable cards/);
  await expect(before).toBeVisible();
  await expect(page.locator(".insert-point:not(.is-near) .insert-point__plus").first()).toHaveCSS("pointer-events", "none");
  await hoverIn(page, "section.filler h2");
  await expect(shown(page)).toHaveCount(2);
  await expect(shown(page).first()).toHaveAccessibleName("Add a section before “Scroll to verify”");
  // Centred over the sections, in the middle of the gap between them.
  // Measured together, since fonts arriving can still move the page a little.
  await expect.poll(async () => {
    const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
    const cards = (await frame.locator("section.cards").boundingBox())!;
    const filler = (await frame.locator("section.filler").boundingBox())!;
    const plusBox = (await before.boundingBox())!;
    const middle = plusBox.y + plusBox.height / 2;
    return middle >= cards.y + cards.height - 1 && middle <= filler.y + 1 && plusBox.y >= frameBox.y &&
      Math.abs(plusBox.x + plusBox.width / 2 - (filler.x + filler.width / 2)) <= 1;
  }).toBe(true);

  await before.click();
  await expect(before).toHaveAttribute("aria-expanded", "true");
  await expect(picker(page)).toBeVisible();
  await expect(picker(page)).toContainText("Goes before “Scroll to verify”");
  await expect(picker(page).getByRole("searchbox", { name: "Search elements and components" })).toBeFocused();
  // The component group contains only section templates; native HTML has separate groups.
  const options = picker(page).getByRole("group", { name: "More sections" }).getByRole("option");
  await expect(options).toHaveText([/^Feature block\s*<feature-block>$/]);

  await options.first().click();
  await expect(picker(page)).toBeHidden();
  await expect(frame.locator("section.cards + feature-block + section.filler")).toHaveCount(1);
  await expect(frame.getByRole("heading", { name: "A feature worth sharing" })).toBeVisible();
  // The instance carries its own copy of the template's text slots.
  const inserted = indexSource.replace(
    `  <section class="filler"`,
    `  <feature-block>\n    <span slot="title">A feature worth sharing</span>\n    <span slot="body">Describe what makes it useful.</span>\n  </feature-block>\n  <section class="filler"`,
  );
  await expect.poll(() => editorText(page, "#content")).toBe(inserted);
  await expect(page.locator("#status")).toHaveText("Feature block added");
  // The new instance is selected.
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Feature block");
  // Typing in its title changes this page, not the shared template.
  const title = frame.locator("feature-block [slot='title']");
  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Only here");
  await page.keyboard.press("Enter");
  await expect(title).toHaveText("Only here");
  await expect.poll(() => editorText(page, "#content")).toContain(`<span slot="title">Only here</span>`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page, "#content")).toBe(inserted);
  // Its own gap now has plus buttons on both sides.
  await expect(page.locator(".insert-point__plus")).toHaveCount(5);

  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator("feature-block")).toHaveCount(0);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("the picker searches, moves by keyboard and closes back to its plus", async ({ page }) => {
  const end = plus(page, "Add a section at the end");
  // Plus buttons scrolled out of the frame are hidden.
  await expect(end).toBeHidden();
  await scrollFrame(page, "bottom");
  await hoverIn(page, "section.filler p:last-child");
  await end.click();
  const search = picker(page).getByRole("searchbox", { name: "Search elements and components" });
  await expect(picker(page)).toContainText("Goes at the end");
  await page.keyboard.type("zzz");
  await expect(picker(page)).toContainText("No items match “zzz”");
  await picker(page).getByRole("button", { name: "Clear search" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await search.fill("Feature block");
  await page.keyboard.press("ArrowDown");
  await expect(picker(page).getByRole("option", { name: /Feature block/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker(page)).toBeHidden();
  await expect(end).toBeFocused();
  await expect(end).toHaveAttribute("aria-expanded", "false");

  // Keyboard focus shows a plus without hovering.
  await expect(end.locator("xpath=..")).toHaveCSS("opacity", "1");
  // Enter inserts only a single match: "feat" matches Features and Feature block, so nothing yet.
  await end.click();
  await page.keyboard.type("feat");
  await expect(picker(page).getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(picker(page)).toBeVisible();
  await expect(page.frameLocator(".native-preview-frame").locator("feature-block")).toHaveCount(0);
  // Read without moving focus: the picker closes when focus leaves it.
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe(indexSource);
  // Typed on to one match, Enter inserts it at the end of the page's sections.
  await page.keyboard.type("ure block");
  await expect(picker(page).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.frameLocator(".native-preview-frame").locator("section.filler + feature-block")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toContain(
    `  </section>\n  <feature-block>\n    <span slot="title">A feature worth sharing</span>\n    <span slot="body">Describe what makes it useful.</span>\n  </feature-block>\n</main>`,
  );
});

test("with no section component the picker still offers the native page sections", async ({ page, baseURL }) => {
  // Feature block's template made a <div>: nothing fits between sections.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(featurePath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", featurePath, { timeout: 30_000 });
  const textbox = page.locator("#content [role='textbox']").first();
  await expect(textbox).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), featureSource.replaceAll("section", "div"));
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => editorText(page, "#content")).toBe(featureSource.replaceAll("section", "div"));

  await page.goto(`${baseURL}/${nativeHash}`);
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await hoverIn(page, "section.hero");
  await plus(page, "Add a section before “A native browser preview”").click();
  await expect(picker(page).getByRole("searchbox")).toBeVisible();
  await expect(picker(page).getByRole("option", { name: /Feature block/ })).toHaveCount(0);
  await expect(picker(page).getByRole("group", { name: "More sections" })).toHaveCount(0);
  await expect(picker(page).getByRole("group", { name: "Page sections" }).getByRole("option")).toHaveText([/^Intro/, /^Features/, /^Split/, /^Contact/]);
  await expect(picker(page).getByRole("option", { name: /^Heading/ })).toHaveCount(0);
  // Choosing one writes an ordinary section before the hero; Undo restores the page exactly.
  await picker(page).getByRole("option", { name: /^Intro/ }).click();
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator("main > section:first-child + section.hero")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toMatch(/<main class="page" data-key="main">\n\s*<section class="[^"]+">[\s\S]*<\/section>\n\s*<section class="hero"/);
  expect(await editorText(page, "#content")).not.toContain("<feature-block>");
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("inserting while a component file is open edits the page", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const footerPath = "components/site-footer/site-footer.html";
  const footerSource = readFileSync(resolve(fixture, footerPath), "utf8");
  // A click in the footer selects this page's instance; its root's Edit opens the shared template.
  await frame.locator(".site-footer p").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await page.getByRole("treeitem", { name: /^Site footer/ }).locator(".page-structure__label").first().click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: "Edit Site footer component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", footerPath);
  await scrollFrame(page, "top");
  await hoverIn(page, "section.hero");
  await plus(page, "Add a section before “A native browser preview”").click();
  await picker(page).getByRole("option", { name: /Feature block/ }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(frame.locator("main > feature-block:first-child + section.hero")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toContain(
    `<main class="page" data-key="main">\n  <feature-block>\n    <span slot="title">A feature worth sharing</span>\n    <span slot="body">Describe what makes it useful.</span>\n  </feature-block>\n  <section class="hero"`,
  );
  // The shared footer template is untouched, byte for byte.
  expect(await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), footerPath) ?? footerSource).toBe(footerSource);
});
