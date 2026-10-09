import { readFileSync } from "node:fs";
import { effectiveSource } from "./drafts";
import { expect, test, type Page } from "@playwright/test";

// Slice 46: Structure shows template parts and shares the label chip's edits.
// Recent work has a title slot, fixed lede and unnamed items slot.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_SLOT_CHIP_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const label = (page: Page) => page.locator(".edit-bar__label");
const chip = (page: Page) => label(page).locator("> .slot-chip");
const shots = process.env.ASE_SLOT_CHIP_SHOTS;
const TEMPLATE = "components/section-work/section-work.html";
const LEDE = "A few of the sites we made this year.";

const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <p class="lede">${LEDE}</p>
  <div class="cards">
    <slot>
      <card-project></card-project>
    </slot>
  </div>
</section>
`;
const workCss = `:host {
  display: block;
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

h2 {
  margin: 0;
}
`;
function homeWithWork() {
  const home = readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/index.html`, "utf8");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  expect(cards).toHaveLength(3);
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${cards.join("\n      ")}
    </section-work>${home.slice(end)}`;
}

async function openMode(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, workTemplate], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  // Every structure the preview reports from here on, to check the slot names it gives.
  await page.evaluate(() => {
    const seen: unknown[] = (window as unknown as { reportedStructures: unknown[] }).reportedStructures = [];
    addEventListener("message", (event) => { if (event.data?.source === "astro-native-preview" && event.data.type === "structure") seen.push(event.data.items); });
  });
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}

test("Structure frames template parts and mirrors slot chip edits in both themes", { tag: "@actual" }, async ({ page, baseURL }) => {
  await openMode(page, baseURL);
  const outline = page.locator(".page-structure__component-outline");
  const row = (text: string) => outline.getByRole("treeitem").filter({ has: page.locator(".page-structure__text", { hasText: text }) });
  const title = row("Section title");
  const lede = row(LEDE);
  const badge = (text: string) => row(text).locator(":scope > .slot-chip");
  const source = () => effectiveSource(page, baseURL, TEMPLATE);
  const undo = () => page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(outline).toBeVisible();
  // Placeholders showing, the page's elements still report the slots they fill (never the runtime's stand-in name).
  expect(JSON.stringify(await page.evaluate(() => (window as unknown as { reportedStructures: unknown[] }).reportedStructures))).not.toContain("ase-placeholder");
  await expect(page.locator(".page-structure [data-slot^='ase-placeholder']")).toHaveCount(0);
  await expect(outline.getByRole("treeitem").first()).toContainText("Section work");
  await expect(outline.getByRole("treeitem")).toHaveCount(5);
  await expect(badge("Section title")).toHaveClass(/slot-chip--slot/);
  await expect(badge("Section title")).toHaveText("title");
  await expect(outline.locator(".slot-chip--items")).toHaveText("items ×1");
  await expect(badge(LEDE)).toHaveClass(/slot-chip--fixed/);
  await expect(badge(LEDE)).toHaveCSS("text-decoration-line", "line-through");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const contrast = await outline.evaluate(el => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const luminance = (color: string) => {
        context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        const linear = [r, g, b].map(value => { const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const border = luminance(getComputedStyle(el).borderTopColor);
      let parent: Element | null = el;
      let background = "rgba(0, 0, 0, 0)";
      while (parent && background === "rgba(0, 0, 0, 0)") { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
      const surface = luminance(background);
      return (Math.max(border, surface) + 0.05) / (Math.min(border, surface) + 0.05);
    });
    expect(contrast).toBeGreaterThan(3);
    if (shots) await page.screenshot({ path: `${shots}/structure-${colorScheme}.png` });
  }
  const instance = outline.getByRole("treeitem").first();
  await instance.locator(".page-structure__label").click();
  await expect(instance).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  const block = outline.getByRole("treeitem", { name: "Block", exact: true });
  const card = outline.getByRole("treeitem", { name: "Card project Untitled project", exact: true });
  await block.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(card).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(card).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(card).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(block).toBeFocused();
  await lede.locator(".page-structure__label").click();
  await expect(lede).toHaveAttribute("aria-selected", "true");
  await expect(chip(page)).toHaveClass(/slot-chip--fixed/);
  await badge(LEDE).click();
  await expect.poll(source).toBe(workTemplate.replace(`<p class="lede">${LEDE}</p>`, `<slot name="text"><p class="lede">${LEDE}</p></slot>`));
  await expect(badge(LEDE)).toHaveClass(/slot-chip--slot/);
  await expect(chip(page)).toHaveClass(/slot-chip--slot/);
  await expect(chip(page)).toHaveText("text");
  await undo();
  await expect.poll(source).toBe(workTemplate);
  await expect(badge(LEDE)).toHaveClass(/slot-chip--fixed/);
  await title.locator(".page-structure__label").click();
  await expect(title).toHaveAttribute("aria-selected", "true");
  await expect(chip(page)).toHaveText("title");
  await badge("Section title").dblclick();
  await expect(badge("Section title").locator(".slot-chip__name")).toBeFocused();
  await page.keyboard.type("Lead Text");
  await expect(badge("Section title")).toHaveText("lead-text");
  await expect(chip(page)).toHaveText("lead-text");
  await expect(title).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect.poll(source).toBe(workTemplate.replace('name="title"', 'name="lead-text"'));
  await expect(chip(page)).toHaveText("lead-text");
  await undo();
  await expect.poll(source).toBe(workTemplate);
  await expect(badge("Section title")).toHaveText("title");
  await expect(chip(page)).toHaveText("title");
  await frame(page).locator("section-work").getByText(LEDE, { exact: true }).click();
  await expect(lede).toHaveAttribute("aria-selected", "true");
  // Template rows fold and navigate, but never offer page-only controls or moves.
  await expect(title.getByRole("button", { name: "Attributes" })).toHaveCount(0);
  await lede.focus();
  await page.keyboard.press("Alt+ArrowUp");
  expect(await source()).toBe(workTemplate);
  // Code edits and Undo/Redo refresh Structure even when the page's light DOM report is identical.
  const at = workTemplate.indexOf("Section title");
  await page.evaluate(async ({ path, at }) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path, start: at, end: at + "Section title".length, text: "Selected projects", expected: "Section title" });
  }, { path: TEMPLATE, at });
  await expect(row("Selected projects")).toBeVisible();
  await undo();
  await expect(title).toBeVisible();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(row("Selected projects")).toBeVisible();
  await undo();
  await expect(title).toBeVisible();
  // A nested card opens from its row: the outline moves round it, its own parts carry the badges.
  await card.hover();
  await card.getByRole("button", { name: "Open Card project component" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/card-project/card-project.html");
  await expect(outline).toHaveCount(1);
  await expect(outline.getByRole("treeitem").first()).toContainText("Card project");
  await expect(outline.locator(".slot-chip--slot", { hasText: "note" })).toBeVisible();
  await expect(outline.locator(".slot-chip--slot", { hasText: "title" })).toBeVisible();
  // The section's own rows stay, outside the outline, without badges.
  const outerTitle = page.locator(".page-structure").getByRole("treeitem").filter({ has: page.locator(".page-structure__text", { hasText: "Section title" }) });
  await expect(outerTitle).toHaveClass(/page-structure__row--outer/);
  await expect(outerTitle.locator(".slot-chip")).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/structure-nested.png` });
  await page.locator(".canvas-bar").getByRole("button", { name: "Back to <section-work>", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(outline.getByRole("treeitem").first()).toContainText("Section work");
  await expect(badge("Section title")).toHaveText("title");
  await page.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(outline).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: /Heading Recent work/ }).first()).toBeVisible();
});
