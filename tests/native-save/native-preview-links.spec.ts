import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Links in the preview as the live site has them: the site's loader marks a
// component's links to the page on show with aria-current="page", and the
// runtime does the same (shown only, never written); Ctrl/⌘+click on a link
// with a fragment shows its page scrolled to the element it names.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const headerSource = readFileSync(resolve(fixture, "components/site-header/site-header.html"), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");

async function editorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

async function pasteInto(page: Page, host: string, source: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("header links to the page on show get aria-current=page, following the route, and the template stays as it is", async ({ page }) => {
  const nav = (key: string) => frame(page).locator(`site-header [data-key='${key}']`);
  await expect(nav("nav-home")).toHaveAttribute("aria-current", "page");
  await expect(nav("brand")).toHaveAttribute("aria-current", "page");
  await expect(nav("nav-about")).not.toHaveAttribute("aria-current", /.*/);

  await nav("nav-about").click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("About this project");
  await expect(nav("nav-about")).toHaveAttribute("aria-current", "page");
  await expect(nav("nav-home")).not.toHaveAttribute("aria-current", /.*/);

  // Selecting the marked link opens the header's template, which has no aria-current.
  await nav("nav-about").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-header/site-header.html");
  expect(await editorText(page, "#content")).toBe(headerSource);
});

test("Ctrl/⌘+click on a link with a fragment scrolls its page to the element it names", async ({ page }) => {
  // A root link with a fragment, to an element far down this same page.
  await pasteInto(page, "#content", indexSource
    .replace(`<h1 data-key="hero-title">`, `<p data-key="jump"><a href="/#last-words">To the end</a></p>\n    <h1 data-key="hero-title">`)
    .replace(`<p data-key="filler-5">`, `<p data-key="filler-5" id="last-words">`));
  const link = frame(page).getByRole("link", { name: "To the end" });
  await expect(frame(page).locator("#last-words")).toBeAttached();
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = (await handle!.contentFrame())!;
  expect(await child.evaluate(() => scrollY)).toBe(0);
  await link.click({ modifiers: ["ControlOrMeta"] });
  await expect.poll(() => child.evaluate(() => {
    const top = document.getElementById("last-words")!.getBoundingClientRect().top;
    const bottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 1;
    return scrollY > 0 && (Math.abs(top) < 2 || bottom);
  })).toBe(true);
  // The page on show stays, and so does the open file.
  await expect(frame(page).locator("h1")).toHaveText("A native browser preview");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
});
