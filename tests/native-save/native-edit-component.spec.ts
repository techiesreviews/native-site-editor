import { expect, test, type Page } from "@playwright/test";
import { effectiveSource } from "./drafts";

// Edit component mode: the template's fixed text is edited in place (build
// slice 42, ticket 14 §3 and §6). A section component with a fixed heading
// and a body slot is used on Home and About; its heading is typed into on
// the framed instance, which edits components/<tag>/<tag>.html as one undo
// step that the code pane follows, and every page shows it.
const TEMPLATE = "components/section-promo/section-promo.html";
const template = `<section class="promo">
  <h2>Made by hand</h2>
  <slot name="body"><p>Say what it is.</p></slot>
</section>
`;
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const canvasBar = (page: Page) => page.locator(".canvas-bar");
const mounted = (page: Page) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), TEMPLATE);

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  const use = (body: string) => `<section-promo>\n    <p slot="body">${body}</p>\n  </section-promo>\n  `;
  const pages: [string, string, string][] = [["index.html", `<section class="cards" data-key="cards">`, "Home's own words."], ["about/index.html", `<section class="prose" data-key="prose">`, "About's own words."]];
  const writes: [string, string][] = [[TEMPLATE, template]];
  for (const [path, before, body] of pages) {
    const source = await (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
    expect(source).toContain(before);
    writes.push([path, source.replace(before, `${use(body)}${before}`)]);
  }
  for (const [path, content] of writes) expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
  await expect(frame(page).locator("section-promo").getByText("Home's own words.")).toBeVisible({ timeout: 30_000 });
}

test("Edit component mode edits a fixed heading in place: every page shows it, one undo takes it back", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  const promo = frame(page).locator("section-promo");
  const heading = promo.locator("h2");
  await expect(heading).toHaveText("Made by hand");

  // Into the mode from the instance's edit bar.
  await page.getByRole("treeitem", { name: /^Section promo/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section promo component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-promo>");
  await expect(canvasBar(page).getByRole("button", { name: /^used on 2 pages/ })).toBeVisible();

  // Placeholder text edits the slot's fallback.
  const fallback = promo.getByText("Say what it is.", { exact: true });
  await fallback.dblclick();
  await expect(fallback).toHaveAttribute("contenteditable", /^(plaintext-only|true)$/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("A short line on it.");
  await page.keyboard.press("Enter");
  const withFallback = template.replace("Say what it is.", "A short line on it.");
  await expect.poll(() => mounted(page)).toBe(withFallback);

  // The fixed heading is typed into where it sits: a click selects it, Enter
  // starts typing, and Enter ends the edit.
  await heading.click();
  await expect(toolbar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(heading).not.toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press("Enter");
  await expect(heading).toHaveAttribute("contenteditable", /^(plaintext-only|true)$/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Made with care");
  await page.keyboard.press("Enter");

  // The template changed, its code pane with it; the page's own source did not.
  const edited = withFallback.replace("Made by hand", "Made with care");
  await expect.poll(() => mounted(page)).toBe(edited);
  await expect(heading).toHaveText("Made with care");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-promo>");

  // Done leaves; the page shows the new heading, and so does About.
  await canvasBar(page).getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(heading).toHaveText("Made with care");
  // The preview follows the header's link to About.
  await frame(page).locator("site-header [data-key='nav-about']").click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("About this project");
  await expect(promo.getByText("About's own words.")).toBeVisible();
  await expect(heading).toHaveText("Made with care");
  expect(await effectiveSource(page, baseURL, TEMPLATE)).toBe(edited);

  // One undo, on the page, takes the heading back everywhere; the fallback's edit is a step of its own.
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(heading).toHaveText("Made by hand");
  await expect.poll(() => effectiveSource(page, baseURL, TEMPLATE)).toBe(withFallback);
  await page.locator("#editor-toolbar-host").getByRole("button", { name: "Redo" }).click();
  await expect(heading).toHaveText("Made with care");
});
