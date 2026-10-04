import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { publishButton } from "./publish";

// Save section: the edit bar of a page's own plain <section> root saves its
// exact HTML back to the matching saved section in .editor/page-builder.json.
// Only that JSON changes; the page, its stylesheets and copies already on
// pages stay as they are, and future Adds use the saved HTML. Runs on a copy
// of the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const CSS = "styles/sections.css";
const OUT = process.env.STATIC_SECTION_SAVE_OUT ?? ".scratch/native-section-save-host/spec";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const mounted = (page: Page, path = "index.html") => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const sectionOf = (html: string, root: string, from = 0) => { const start = html.indexOf(`<section class="${root}"`, from); return html.slice(start, html.indexOf("</section>", start) + 10); };
const records = (text: string | undefined) => JSON.parse(text!).reusableSections.records;

async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function addIntro(page: Page, select: string) {
  await frame(page).locator(select).first().click();
  if (!(await panel(page).isVisible())) await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  const option = panel(page).getByRole("option", { name: /^Intro HTML$/ });
  await option.focus();
  await option.press("Enter");
}

test("Save section updates only the saved JSON record; one Undo; future Adds use it; copies stay", async ({ page, baseURL }) => {
  await load(page, baseURL);
  const sectionsCss = await file(page, baseURL, CSS);
  await addIntro(page, "section.flow h2");
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain("section-intro");
  const seeded = (await storedDraft(page, SIDECAR))!.content;
  const seededJson = JSON.parse(seeded);

  // A real inline edit of the inserted heading.
  const heading = frame(page).locator("section.section-intro h2");
  await heading.click();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(`Lex's "best" work`);
  await page.keyboard.press("Enter");
  await expect.poll(() => mounted(page)).toContain(`<h2>Lex's "best" work</h2>`);
  const edited = (await mounted(page))!;
  const css = (await storedDraft(page, CSS))?.content;

  // A child element: no Save section, and no Make component either.
  await heading.click();
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Save section" })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /Make component/ })).toHaveCount(0);

  // The section root.
  await frame(page).locator("section.section-intro").click({ position: { x: 5, y: 5 } });
  const save = bar(page).getByRole("button", { name: "Save section", exact: true });
  await expect(save).toBeVisible();
  await expect(save).toHaveAttribute("title", /future Add only.*stay as they are/);
  await expect(bar(page).getByRole("button", { name: /Make component/ })).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/save-section-light.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${OUT}/save-section-dark.png` });
  await page.emulateMedia({ colorScheme: "light" });
  await save.click();
  await expect.poll(async () => records((await storedDraft(page, SIDECAR))?.content).intro.html).toBe(sectionOf(edited, "section-intro"));
  const savedText = (await storedDraft(page, SIDECAR))!.content;
  const savedJson = JSON.parse(savedText);
  expect(savedJson.reusableSections.records.intro.css).toBe(seededJson.reusableSections.records.intro.css);
  expect({ ...savedJson, reusableSections: undefined }).toEqual({ ...seededJson, reusableSections: undefined });
  expect(await mounted(page)).toBe(edited);
  expect((await storedDraft(page, "index.html"))?.content).toBe(edited);
  expect((await storedDraft(page, CSS))?.content).toBe(css);

  // Saving again with nothing new is a no-op: no write, no history entry.
  await save.click();
  await expect(page.locator("#status")).toContainText("already matches");
  expect((await storedDraft(page, SIDECAR))!.content).toBe(savedText);

  // One Undo puts the JSON back and keeps the page edit; one Redo saves again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(seeded);
  expect(await mounted(page)).toBe(edited);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(savedText);
  expect(await mounted(page)).toBe(edited);

  // A section without a saved record refuses inline and writes nothing.
  await frame(page).locator("section.flow h2").click();
  await page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByText("section.flow", { exact: true }).click();
  await bar(page).getByRole("button", { name: "Save section", exact: true }).click();
  await expect(page.locator("#notice")).toContainText("Section not saved");
  expect((await storedDraft(page, SIDECAR))!.content).toBe(savedText);

  // A component instance root: neither Save section nor Make component.
  await frame(page).locator("section-hero h1").first().click();
  await page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByText("section-hero", { exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Save section", exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /Make component/ })).toHaveCount(0);

  // Future Adds use the saved HTML; the first copy stays byte for byte.
  await addIntro(page, "section.flow h2");
  await expect.poll(async () => ((await mounted(page)) ?? "").split(`<h2>Lex's "best" work</h2>`).length).toBe(3);
  const twice = (await mounted(page))!;
  expect(sectionOf(twice, "section-intro")).toBe(sectionOf(edited, "section-intro"));
  expect((await storedDraft(page, CSS))?.content ?? sectionsCss).toBe(css ?? sectionsCss);

  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  expect(await file(page, baseURL, SIDECAR)).toBe((await storedDraft(page, SIDECAR))?.content ?? savedText);
  const published = await file(page, baseURL, "index.html");
  expect(published).toBe(twice);
  expect(sectionOf(published, "section-intro")).not.toMatch(/<script|<slot|<template|<[a-z]+-[a-z-]+[\s>]|data-native|\son[a-z]+=/);

  // Served as plain files with scripts off and no .editor folder, the saved copies read the same.
  const site = await page.context().browser()!.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const plain = await site.newPage();
  const requests: string[] = [];
  await plain.route("http://site.test/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    requests.push(path);
    if (path.startsWith(".editor/")) return route.fulfill({ status: 404, body: "" });
    const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
    if (!response.ok()) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: await response.body(), contentType: path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html" });
  });
  await plain.goto("http://site.test/");
  await expect(plain.locator("section.section-intro h2")).toHaveText([`Lex's "best" work`, `Lex's "best" work`]);
  await expect(plain.locator("section.section-intro").first()).toHaveCSS("text-align", "center");
  expect(requests.some((path) => path.startsWith(".editor/"))).toBe(false);
  await plain.locator("section.section-intro").first().scrollIntoViewIfNeeded();
  await plain.screenshot({ path: `${OUT}/published-narrow-js-off.png` });
  await site.close();
});
