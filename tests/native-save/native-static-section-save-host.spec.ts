import { seedSavedSections } from "./static-sections";
import { requireActualFixture } from "./fixture-contract";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

requireActualFixture();

// Update saved section: the edit bar of a page's own plain <section> root that
// matches one saved section ("Update Intro") saves its
// exact HTML back to the matching saved section in .editor/page-builder.json.
// Only that JSON changes; the page, its stylesheets and copies already on
// pages stay as they are, and future Adds use the saved HTML. Runs on a copy
// of the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
test.beforeEach(async ({ page, baseURL }) => { await seedSavedSections(page, baseURL); });

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

test("Update Intro updates only the saved JSON record; one Undo; future Adds use it; copies stay", { tag: "@actual" }, async ({ page, baseURL }) => {
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

  // A child element: no Update action, and no Make component either.
  await heading.click();
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: /^Update / })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /Make component/ })).toHaveCount(0);

  // The section root.
  await frame(page).locator("section.section-intro").click({ position: { x: 5, y: 5 } });
  const save = bar(page).getByRole("button", { name: "Update Intro", exact: true });
  await expect(save).toBeVisible();
  await expect(save).toHaveAttribute("title", /saved section “Intro”.*future inserts only.*stay as they are/);
  await expect(bar(page).getByRole("button", { name: /Make component/ })).toHaveCount(0);
  // Screenshots without the Add panel's overlay.
  if (await panel(page).isVisible()) await panel(page).getByRole("button", { name: /close/i }).click();
  await expect(panel(page)).toBeHidden();
  await expect(save).toBeInViewport();
  await page.screenshot({ path: `${OUT}/save-section-light.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${OUT}/save-section-dark.png` });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 820, height: 1000 });
  await frame(page).locator("section.section-intro").scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.screenshot({ path: `${OUT}/save-section-narrow.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await save.click();
  await expect.poll(async () => records((await storedDraft(page, SIDECAR))?.content).intro.html).toBe(sectionOf(edited, "section-intro"));
  await expect(page.locator("#status")).toHaveText("Updated Intro for future inserts. This page and copies already on pages stay as they are.");
  const savedText = (await storedDraft(page, SIDECAR))!.content;
  const savedJson = JSON.parse(savedText);
  expect(savedJson.reusableSections.records.intro.css).toBe(seededJson.reusableSections.records.intro.css);
  expect({ ...savedJson, reusableSections: undefined }).toEqual({ ...seededJson, reusableSections: undefined });
  expect(await mounted(page)).toBe(edited);
  expect((await storedDraft(page, "index.html"))?.content).toBe(edited);
  expect((await storedDraft(page, CSS))?.content).toBe(css);

  // Saving again with nothing new is a no-op: no write, no history entry.
  await save.click();
  await expect(page.locator("#status")).toHaveText("Intro already matches this section; future inserts use it.");
  expect((await storedDraft(page, SIDECAR))!.content).toBe(savedText);

  // One Undo puts the JSON back and keeps the page edit; one Redo saves again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(seeded);
  expect(await mounted(page)).toBe(edited);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(savedText);
  expect(await mounted(page)).toBe(edited);

  // A section without a saved record offers no Update action and nothing is written.
  await frame(page).locator("section.flow h2").click();
  await page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByText("section.flow", { exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: /^Update / })).toHaveCount(0);
  expect((await storedDraft(page, SIDECAR))!.content).toBe(savedText);

  // A component instance root: neither Update nor Make component.
  await frame(page).locator("section-hero h1").first().click();
  await page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByText("section-hero", { exact: true }).click();
  await expect(bar(page).getByRole("button", { name: /^Update / })).toHaveCount(0);
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

// The stylesheet pane is already open beside the page (elements.css) before Add:
// it is not part of the operation, so Add, Undo and Redo neither warn nor touch it.
test("Add with an unchanged stylesheet pane open: no warning, page and JSON drafts, one Undo and Redo, also after the pane follows another stylesheet", { tag: "@actual" }, async ({ page, baseURL }) => {
  await load(page, baseURL);
  const elementsCss = await file(page, baseURL, "styles/elements.css");
  const notice = page.locator("#notice");
  await frame(page).locator("section.flow h2").click();
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css");
  expect(await mounted(page, "styles/elements.css")).toBe(elementsCss);
  const before = await mounted(page);
  await addIntro(page, "section.flow h2");
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html"].sort());
  const drafts = await storedDrafts(page);
  await expect(notice).not.toContainText("not part of this owned source transition");
  await expect(notice).not.toContainText("changed");
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css");
  expect(await mounted(page, "styles/elements.css")).toBe(elementsCss);
  await page.screenshot({ path: `${OUT}/pane-open-add.png` });

  // One Undo clears both Add drafts with the pane still open; one Redo restores them exactly.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css");
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual(drafts);
  await expect(notice).not.toContainText("not part of this owned source transition");

  // The pane moved to another stylesheet (the section's own) before Undo.
  await frame(page).locator("section.section-intro").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#secondary-title")).toHaveText(CSS);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual(drafts);

});

// One history spans every file (dbee5e2): typing in the open stylesheet pane after
// Add is the latest step, so the primary Undo takes back only that typing. The
// Add's page and JSON drafts and the page source stay exactly as they were.
test("Undo after typing in the stylesheet pane following Add takes back the typing and leaves the Add whole", { tag: "@actual" }, async ({ page, baseURL }) => {
  await load(page, baseURL);
  await frame(page).locator("section.flow h2").click();
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css");
  await addIntro(page, "section.flow h2");
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html"].sort());
  const added = await mounted(page);
  const addDrafts = await storedDrafts(page);
  const css = await mounted(page, "styles/elements.css");

  await page.locator("#content-secondary [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("/* foreign */");
  await expect.poll(() => mounted(page, "styles/elements.css")).toContain("/* foreign */");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html", "styles/elements.css"].sort());

  const undo = page.locator(".code-editor__undo").first();
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute("title", "Undo");
  // The typing undoes stop by stop (Monaco's word stops); every step leaves the Add whole.
  await undoTypingSteps(page, css, () => undo.click(), async () => {
    expect(await mounted(page)).toBe(added);
    expect((await storedDrafts(page)).filter((draft) => draft.path !== "styles/elements.css")).toEqual(addDrafts);
  });
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect(refusal(page)).toHaveCount(0);
});

// Monaco's own Undo/Redo keys in the primary page editor. The focus is put in
// that editor's input and checked before every key press.
async function focusPrimary(page: Page) {
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  expect(await page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active?.closest(".monaco-editor") && active.closest("#content") && !active.closest("#content-secondary"));
  })).toBe(true);
}
async function typeInPane(page: Page, text: string) {
  await page.locator("#content-secondary [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
  await expect.poll(() => mounted(page, "styles/elements.css")).toContain(text);
}
// Undo, one step at a time, until the stylesheet is back to `css`: each step must
// take back some of the typing and nothing else (`whole` checks the rest).
async function undoTypingSteps(page: Page, css: string | undefined, step: () => Promise<unknown>, whole: () => Promise<void>) {
  for (let steps = 0; (await mounted(page, "styles/elements.css")) !== css; steps++) {
    expect(steps, "the typing undoes in a few steps").toBeLessThan(6);
    const text = await mounted(page, "styles/elements.css");
    await step();
    await expect.poll(() => mounted(page, "styles/elements.css")).not.toBe(text);
    expect(css && (await mounted(page, "styles/elements.css"))!.startsWith(css)).toBe(true);
    await whole();
  }
}
const refusal = (page: Page) => page.locator("#content .code-editor__notice, .code-editor__notice").filter({ hasText: "touched several files together" });
async function addWithPane(page: Page, baseURL: string | undefined) {
  await load(page, baseURL);
  await frame(page).locator("section.flow h2").click();
  await expect(page.locator("#secondary-title")).toHaveText("styles/elements.css");
  const before = await mounted(page);
  await addIntro(page, "section.flow h2");
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html"].sort());
  return { before, added: (await mounted(page))!, drafts: await storedDrafts(page) };
}

test("Monaco Undo and Redo keys in the page editor run the whole Add", { tag: "@actual" }, async ({ page, baseURL }) => {
  const { before, added, drafts } = await addWithPane(page, baseURL);
  // A valid shared history: Undo is available with its plain title.
  await expect(page.locator(".code-editor__undo").first()).toBeEnabled();
  await expect(page.locator(".code-editor__undo").first()).toHaveAttribute("title", "Undo");
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => storedDrafts(page)).toEqual(drafts);
  expect(await mounted(page)).toBe(added);
  await expect(refusal(page)).toHaveCount(0);
});

// Undo from the page editor takes back the latest step in any file: the stylesheet
// pane's typing, never part of the Add.
test("Monaco Undo in the page editor takes back typing in the stylesheet pane and never part of the Add", { tag: "@actual" }, async ({ page, baseURL }) => {
  const { before, added, drafts: addDrafts } = await addWithPane(page, baseURL);
  const css = await mounted(page, "styles/elements.css");
  await typeInPane(page, "/* foreign */");
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(3);
  const others = async () => (await storedDrafts(page)).filter((draft) => draft.path !== "styles/elements.css");
  await undoTypingSteps(page, css, async () => { await focusPrimary(page); await page.keyboard.press("ControlOrMeta+z"); }, async () => {
    expect(await mounted(page)).toBe(added);
    expect(await others()).toEqual(addDrafts);
  });
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await page.screenshot({ path: `${OUT}/keyboard-undo-typing.png` });
  // With the typing gone, the next Undo is the Add: its page and JSON drafts go together.
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedDrafts(page)).filter((draft) => draft.path !== "styles/elements.css")).toEqual([]);
  expect(await mounted(page)).toBe(before);
  expect(await mounted(page, "styles/elements.css")).toBe(css);
  await expect(frame(page).locator("section.section-intro")).toHaveCount(0);
  await expect(refusal(page)).toHaveCount(0);
});

test("Monaco Undo in the page editor removes later typing, then reverts the whole Add in one step", { tag: "@actual" }, async ({ page, baseURL }) => {
  const { before, added, drafts: added3 } = await addWithPane(page, baseURL);
  // Typing and undoing it re-saves the page draft; only its timestamp moves.
  const content = async () => (await storedDrafts(page)).map(({ updatedAt: _updatedAt, ...draft }) => draft);
  const drafts = added3.map(({ updatedAt: _updatedAt, ...draft }) => draft);
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("x");
  await expect.poll(() => mounted(page)).toBe(`${added}x`);
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => mounted(page)).toBe(added);
  await expect.poll(content).toEqual(drafts);
  // The next Undo is the Add: its page and JSON drafts go together.
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await expect(frame(page).locator("section.section-intro")).toHaveCount(0);
  await expect(refusal(page)).toHaveCount(0);
});

test("Monaco Redo in the page editor never redoes only the page after the stylesheet pane was typed in", { tag: "@actual" }, async ({ page, baseURL }) => {
  const { before } = await addWithPane(page, baseURL);
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  await typeInPane(page, "/* foreign */");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path)).toEqual(["styles/elements.css"]);
  const drafts = await storedDrafts(page);
  const typed = await mounted(page, "styles/elements.css");
  for (const key of ["ControlOrMeta+Shift+z", "Control+y"]) {
    // Known gap: no feedback, tech debt 11. Redo does nothing and says nothing;
    // neither the page nor its JSON comes back, and the typing stays.
    await focusPrimary(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    expect(await mounted(page)).toBe(before);
    expect(await storedDrafts(page)).toEqual(drafts);
    expect(await mounted(page, "styles/elements.css")).toBe(typed);
    await expect(frame(page).locator("section.section-intro")).toHaveCount(0);
  }
});

test("Monaco Undo and Redo keys in the page editor follow a Source editor edit made after Add", { tag: "@actual" }, async ({ page, baseURL }) => {
  const { before, added, drafts } = await addWithPane(page, baseURL);
  const strip = (list: Awaited<ReturnType<typeof storedDrafts>>) => list.map(({ updatedAt: _updatedAt, ...draft }) => draft);
  const added3 = strip(drafts);
  // A real Source editor edit of the added section's rule, in the stylesheet pane.
  await frame(page).locator("section.section-intro").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#secondary-title")).toHaveText(CSS);
  await page.evaluate(async path => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource(path)!;
    editor.replaceActiveRange({ path, start: source.length, end: source.length, expected: "", text: "\n.section-intro { margin-top: 17px; }\n" });
  }, CSS);
  await expect.poll(() => mounted(page, CSS)).toContain("margin-top: 17px");
  const styled = (await mounted(page, CSS))!;
  await expect.poll(async () => (await storedDraft(page, CSS))?.content).toBe(styled);
  const styledDrafts = strip(await storedDrafts(page));
  await expect(page.locator(".code-editor__undo").first()).toBeEnabled();
  await expect(page.locator(".code-editor__undo").first()).toHaveAttribute("title", "Undo");
  const addedCss = await file(page, baseURL, CSS);

  // First Ctrl+Z undoes the style only; the Add's page and JSON drafts stay.
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => mounted(page, CSS)).toBe(addedCss);
  await expect.poll(async () => strip(await storedDrafts(page))).toEqual(added3);
  expect(await mounted(page)).toBe(added);
  await expect(refusal(page)).toHaveCount(0);
  // Second Ctrl+Z undoes the whole Add.
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  // Redo restores the Add exactly, then the style.
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => strip(await storedDrafts(page))).toEqual(added3);
  expect(await mounted(page)).toBe(added);
  await focusPrimary(page);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => mounted(page, CSS)).toBe(styled);
  await expect.poll(async () => strip(await storedDrafts(page))).toEqual(styledDrafts);
  await expect(refusal(page)).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/keyboard-style-redo.png` });
});

// After a fresh load the editor JSON is only on the branch: selecting the added
// section reads it, then offers Update for that same selection only.
test("after a fresh load, Update appears once the editor JSON is read", { tag: "@actual" }, async ({ page, baseURL }) => {
  await load(page, baseURL);
  await addIntro(page, "section.flow h2");
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain("section-intro");
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await load(page, baseURL);
  expect(await storedDrafts(page)).toEqual([]);
  await frame(page).locator("section.section-intro").click({ position: { x: 5, y: 5 } });
  await expect(bar(page).getByRole("button", { name: "Update Intro", exact: true })).toBeVisible();
  await frame(page).locator("section.flow h2").click();
  await page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByText("section.flow", { exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: /^Update / })).toHaveCount(0);
  expect(await storedDrafts(page)).toEqual([]);
});

// The editor JSON is read once, slowly (a held response); another matching
// section picked meanwhile gets Update when the read ends, and the first
// pick is not drawn again over it.
test("a section picked while the editor JSON is still read gets Update when the read ends", { tag: "@actual" }, async ({ page, baseURL }) => {
  await load(page, baseURL);
  await addIntro(page, "section.flow h2");
  await expect(frame(page).locator("section.flow + section.section-intro")).toHaveCount(1);
  await addIntro(page, "section-contact");
  await expect(frame(page).locator("section.section-intro")).toHaveCount(2);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let asked = 0;
  // The editor reads files by their Git blob SHA; hold the batch that has the editor JSON.
  const json = Buffer.from(await file(page, baseURL, SIDECAR));
  const sha = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${json.length}\0`), json])).digest("hex");
  await page.route((url) => url.pathname.startsWith("/api/file") && decodeURIComponent(url.search).includes(sha), async (route) => { asked++; await held; await route.fallback(); });
  await load(page, baseURL);
  const [first, second] = [frame(page).locator("section.section-intro").first(), frame(page).locator("section.section-intro").last()];
  await first.click({ position: { x: 5, y: 5 } });
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect.poll(() => asked).toBeGreaterThan(0);
  await second.scrollIntoViewIfNeeded();
  await second.click({ position: { x: 5, y: 5 } });
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: /^Update / })).toHaveCount(0);
  release();
  await expect(bar(page).getByRole("button", { name: "Update Intro", exact: true })).toBeVisible();
  // Still the second section: the selection box is around it, not the first.
  const box = await frame(page).locator('[data-native-selection-box="selected"]').boundingBox();
  const target = await second.boundingBox();
  expect(Math.abs(box!.y - target!.y)).toBeLessThan(3);
  expect(Math.abs(box!.height - target!.height)).toBeLessThan(3);
  expect(await storedDrafts(page)).toEqual([]);
  await page.unroute(() => true);
});

// Undo and Redo of an Add select what the step restores: Undo the element
// selected for the Add (not the section that took the new one's place), Redo
// the added section again, also with a Source editor edit undone and redone around it.
test("Undo and Redo of an Add with a Source editor edit keep the selection on the restored elements", { tag: "@actual" }, async ({ page, baseURL }) => {
  const { before, added } = await addWithPane(page, baseURL);
  const crumb = page.locator(".canvas-crumb[aria-current=true]");
  const selectedIs = (selector: string) => frame(page).locator("html").evaluate((_, selector) => {
    const box = document.querySelector('[data-native-selection-box="selected"]') as HTMLElement | null, el = document.querySelector(selector);
    if (!box || box.style.display === "none" || !el) return false;
    const a = box.getBoundingClientRect(), b = el.getBoundingClientRect();
    return Math.abs(a.top - b.top) < 3 && Math.abs(a.height - b.height) < 3 && Math.abs(a.width - b.width) < 3;
  }, selector);
  const intro = frame(page).locator("section.section-intro");
  await intro.click({ position: { x: 5, y: 5 } });
  await page.evaluate(async path => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource(path)!;
    editor.replaceActiveRange({ path, start: source.length, end: source.length, expected: "", text: "\n.section-intro { margin-top: 17px; }\n" });
  }, CSS);
  await expect.poll(() => mounted(page, CSS)).toContain("margin-top: 17px");
  const styled = (await mounted(page, CSS))!;
  await expect.poll(async () => (await storedDraft(page, CSS))?.content).toBe(styled);

  const key = async (keys: string) => { await focusPrimary(page); await page.keyboard.press(keys); };
  await key("ControlOrMeta+z");
  await expect.poll(() => mounted(page, CSS)).not.toContain("margin-top: 17px");
  await expect.poll(() => selectedIs("section.section-intro")).toBe(true);
  await expect(crumb).toHaveText("section.section-intro");
  await key("ControlOrMeta+z");
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  // The heading selected for the Add, not the contact section now at the Intro's place.
  await expect.poll(() => selectedIs("section.flow > h2")).toBe(true);
  await expect(crumb).toHaveText("h2");
  await key("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html"].sort());
  expect(await mounted(page)).toBe(added);
  await expect.poll(() => selectedIs("section.section-intro")).toBe(true);
  await expect(crumb).toHaveText("section.section-intro");
  await key("ControlOrMeta+Shift+z");
  await expect.poll(() => mounted(page, CSS)).toBe(styled);
  await expect(intro).toHaveCSS("margin-top", "17px");
  await expect.poll(() => selectedIs("section.section-intro")).toBe(true);
  await expect(crumb).toHaveText("section.section-intro");
  await expect(refusal(page)).toHaveCount(0);
});
