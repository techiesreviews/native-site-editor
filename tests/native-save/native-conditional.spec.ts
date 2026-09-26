import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Conditional template parts in the preview: an element whose slots the
// page left empty is hidden, `data-if` follows a named slot, and both
// follow the page as it changes.
const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const cardPath = "src/components/project-card/project-card.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const cardSource = readFileSync(resolve(fixture, cardPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

async function pasteInto(page: Page, host: string, source: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await expect(textbox).toBeAttached({ timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

const display = (page: Page, index: number) =>
  page.frameLocator(".native-preview-frame").locator("project-card").nth(index)
    .evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector(".project-card__actions")!).display);

test("an empty slot's wrapper is hidden until the page fills it", async ({ page }) => {
  // No card passes a link: the actions paragraph is hidden in all three.
  for (const index of [0, 1, 2]) await expect.poll(() => display(page, index)).toBe("none");

  await pasteInto(page, "#content", indexSource.replace(
    `<span slot="title">Reusable cards</span>`,
    `<span slot="title">Reusable cards</span>\n      <a slot="link" href="#/about/">See the project</a>`,
  ));
  await expect.poll(() => display(page, 0)).toBe("block");
  await expect(page.frameLocator(".native-preview-frame").getByRole("link", { name: "See the project" })).toBeVisible();
  await expect.poll(() => display(page, 1)).toBe("none");
  await expect.poll(() => display(page, 2)).toBe("none");

  // Taking the link away hides it again.
  await pasteInto(page, "#content", indexSource);
  await expect.poll(() => display(page, 0)).toBe("none");
});

test("data-if shows an element only when its named slot is filled", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const note = (index: number) => frame.locator("project-card").nth(index)
    .evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector("card-note")!).display);
  await expect.poll(() => note(0)).not.toBe("none");
  // Open the template and make the note depend on the link slot.
  // The card's own article (the body paragraph is the page's slotted element).
  await frame.locator("project-card article").first().evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", cardPath);
  await pasteInto(page, "#content", cardSource.replace(`<card-note data-key="card-note">`, `<card-note data-if="link" data-key="card-note">`));
  for (const index of [0, 1, 2]) await expect.poll(() => note(index)).toBe("none");
});

test("a section component hides the parts its instance leaves out, unless it fills none", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const shown = (selector: string) => frame.locator("feature-block")
    .evaluate((el, s) => getComputedStyle(el.shadowRoot!.querySelector(s)!).display, selector);
  await pasteInto(page, "#content", indexSource.replace("</main>", `  <feature-block>\n    <span slot="title">Only a title</span>\n  </feature-block>\n</main>`));
  await expect(frame.locator("feature-block [slot='title']")).toHaveText("Only a title");
  await expect.poll(() => shown("h2")).not.toBe("none");
  // No data-if: the body the instance left out is hidden, fallback and all.
  await expect.poll(() => shown("p")).toBe("none");

  // A bare instance shows the template's fallbacks.
  await pasteInto(page, "#content", indexSource.replace("</main>", `  <feature-block></feature-block>\n</main>`));
  await expect.poll(() => shown("p")).not.toBe("none");
  await expect.poll(() => shown("h2")).not.toBe("none");
});
