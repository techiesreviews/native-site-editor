import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

// Plain HTML/CSS sections in the same Add panel: four curated defaults and
// the records saved in .editor/page-builder.json. Adding one writes ordinary
// HTML (and a stylesheet link only when the page does not load the section
// stylesheet yet) and appends its rules to styles/sections.css; the JSON is
// editor-only. Runs on a copy of the actual starter, unchanged:
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const CSS = "styles/sections.css";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path = "index.html") => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const OUT = process.env.STATIC_SECTIONS_OUT ?? ".scratch/native-static-add-host/spec";

// STATIC_SECTIONS_FIXTURE=native runs the last group against the native static starter instead.
const native = process.env.STATIC_SECTIONS_FIXTURE === "native";
const actual = (name: string, body: (args: { page: Page; baseURL: string | undefined }) => Promise<void>) =>
  test(name, async ({ page, baseURL }) => { test.skip(native, "Runs on the actual starter."); await body({ page, baseURL }); });

// The page's own flow section, byte for byte: its heading and cards stay together.
const flowOf = (html: string | undefined) => { const start = html!.indexOf('<section class="flow"'); return html!.slice(start, html!.indexOf("</section>", start)); };
async function load(page: Page, baseURL: string | undefined, path = "index.html") {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openAdd(page: Page, select = "section.flow h2") {
  await frame(page).locator(select).first().click();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel(page)).toBeVisible();
}
async function add(page: Page, name: RegExp) {
  await panel(page).getByRole("searchbox").fill("");
  const option = panel(page).getByRole("option", { name });
  await option.focus();
  await expect(option).not.toHaveAttribute("aria-disabled", "true");
  await option.press("Enter");
}

actual("on the real starter, defaults go into the stylesheet it already imports; one Undo; Save gives ready HTML that needs no editor", async ({ page, baseURL }) => {
  await load(page, baseURL);
  const siteCss = await file(page, baseURL, "styles/site.css");
  const sectionsCss = await file(page, baseURL, CSS);
  expect(siteCss).toContain('@import url("sections.css");');
  expect(sectionsCss).toContain("@layer sections");
  const before = await mounted(page);
  await openAdd(page);
  await expect(panel(page).getByRole("heading", { name: "Plain HTML sections" })).toBeVisible();
  for (const name of ["Intro", "Features", "Split", "Contact"]) await expect(panel(page).getByRole("option", { name: new RegExp(`^${name} HTML$`) })).toHaveCount(1);
  await panel(page).getByRole("searchbox").fill("Heading");
  await expect(panel(page).getByRole("option", { name: /HTML$/ })).toHaveCount(0);
  await add(page, /^Intro HTML$/);
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  const home = await mounted(page);
  // With the flow's heading selected, the section goes after the flow section, at the page's level.
  await expect(frame(page).locator("main > section.flow + section.section-intro")).toHaveCount(1);
  expect(flowOf(home)).toBe(flowOf(before));
  expect(home).toContain('<section class="section-intro"><h2>Section heading</h2>');
  // site.css already imports styles/sections.css: no second link.
  expect(home.match(/rel="stylesheet"/g)?.length).toBe(before!.match(/rel="stylesheet"/g)?.length);
  expect(home).not.toMatch(/static-section|saved-section|data-native|reusableSections|<script[^>]*>[^<]*section-intro/);
  await expect.poll(async () => (await storedDraft(page, CSS))?.content ?? "").toContain("@layer sections {\n  .section-intro {");
  const css = (await storedDraft(page, CSS))!.content;
  expect(css.startsWith(sectionsCss)).toBe(true);
  expect(await storedDraft(page, "styles/site.css")).toBeUndefined();
  const sidecar = (await storedDraft(page, SIDECAR))!.content;
  expect(JSON.parse(sidecar).reusableSections.records.intro.rootClass).toBe("section-intro");
  await expect(frame(page).locator("section.section-intro")).toHaveCSS("text-align", "center");

  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  await expect.poll(async () => (await storedDraft(page, CSS))?.content).toBe(css);
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(sidecar);

  // The site's own Text size (its utilities layer) wins over the section's layered seed.
  await frame(page).locator("section.section-intro h2").click();
  const size = page.getByRole("combobox", { name: "Text size" });
  await size.selectOption({ label: "XL" });
  await expect(frame(page).locator("section.section-intro h2")).toHaveCSS("font-size", "20px");
  expect(await mounted(page)).toContain('<h2 class="text-xl">Section heading</h2>');
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(home);
  expect((await storedDraft(page, CSS))?.content).toBe(css);

  // Features through the plus between two sections: that very gap.
  await frame(page).locator("section.flow").hover();
  await page.getByRole("button", { name: /^Add a section before “Recent work”/ }).first().dispatchEvent("click");
  await panel(page).getByRole("option", { name: /^Features HTML$/ }).click();
  await expect(frame(page).locator("section.section-features + section.flow")).toHaveCount(1);
  const withFeatures = (await storedDraft(page, CSS))!.content;
  expect(withFeatures.startsWith(css)).toBe(true);
  expect(withFeatures.match(/\.section-intro \{/g)?.length).toBe(1);

  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const published = await file(page, baseURL, "index.html");
  expect(await file(page, baseURL, CSS)).toBe(withFeatures);
  expect(await file(page, baseURL, "styles/site.css")).toBe(siteCss);

  // The added sections are ordinary HTML: no scripts, custom elements, slots or editor attributes.
  for (const root of ["section-intro", "section-features"]) {
    const start = published.indexOf(`<section class="${root}">`);
    const html = published.slice(start, published.indexOf("</section>", start) + 10);
    expect(html).not.toMatch(/<script|<slot|<template|<[a-z]+-[a-z-]+[\s>]|data-native|\son[a-z]+=/);
  }
  // Served as plain files, with scripts off and no .editor folder, they read and look the same.
  // (The starter's own components still need its components.js; that part of the page is not claimed.)
  const site = await page.context().browser()!.newContext({ javaScriptEnabled: false, viewport: { width: 1200, height: 900 } });
  const plain = await site.newPage();
  const errors: string[] = [], requests: string[] = [];
  plain.on("pageerror", (error) => errors.push(String(error)));
  plain.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await plain.route("http://site.test/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
    requests.push(path);
    if (path.startsWith(".editor/")) return route.fulfill({ status: 404, body: "" });
    const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
    if (!response.ok()) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: await response.body(), contentType: path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html" });
  });
  await plain.goto("http://site.test/index.html");
  await expect(plain.locator("section.section-intro > h2")).toHaveText("Section heading");
  await expect(plain.locator("section.section-intro")).toHaveCSS("text-align", "center");
  await expect(plain.locator("section.section-features h3").first()).toHaveText("First feature");
  await plain.locator("section.section-intro").scrollIntoViewIfNeeded();
  await plain.screenshot({ path: `${OUT}-js-off.png` });
  expect(requests.some((path) => path.startsWith(".editor"))).toBe(false);
  expect(errors).toEqual([]);
  await site.close();
});

actual("a saved custom section previews and inserts its own HTML with the live stylesheet; a subpage needs no new link", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const record = { id: "intro", label: "Intro", rootClass: "section-intro", stylesheetPath: CSS,
    html: '<section class="section-intro"><h2>Our custom intro</h2></section>', css: ".section-intro { color: teal; }" };
  const live = (await file(page, baseURL, CSS)) + ".section-intro { color: rgb(200, 0, 0); }\n";
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { intro: record } } }, null, 2) + "\n" } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: CSS, content: live } });
  await load(page, baseURL, "about/index.html");
  const before = await mounted(page, "about/index.html");
  await openAdd(page, "main h1");
  const option = panel(page).getByRole("option", { name: /^Intro HTML$/ });
  await expect(option).toHaveCount(1);
  const thumb = option.frameLocator("iframe");
  await expect(thumb.locator("section.section-intro h2")).toHaveText("Our custom intro");
  await expect(thumb.locator("section.section-intro")).toHaveCSS("color", "rgb(200, 0, 0)");
  await add(page, /^Intro HTML$/);
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Our custom intro");
  await expect(frame(page).locator("section.section-intro")).toHaveCSS("color", "rgb(200, 0, 0)");
  const about = await mounted(page, "about/index.html");
  expect(about).toContain(record.html);
  expect(about.match(/rel="stylesheet"/g)?.length).toBe(before!.match(/rel="stylesheet"/g)?.length);
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["about/index.html"]);
});

actual("invalid editor JSON hides plain sections instead of falling back to defaults", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: "{ not json" } });
  await load(page, baseURL);
  await openAdd(page);
  await expect(panel(page).getByRole("option").first()).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: "Plain HTML sections" })).toHaveCount(0);
  // Said inline, without a dialog: why they are missing and how to get them back.
  await expect(panel(page).locator(".pb-add-panel__notice")).toContainText(`${SIDECAR} can't be read`);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await storedDrafts(page)).toEqual([]);
  // Repaired in the file: they come back and the notice goes.
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: JSON.stringify({ version: 1, pages: {}, collections: {} }, null, 2) + "\n" } });
  await load(page, baseURL);
  await openAdd(page);
  await expect(panel(page).getByRole("heading", { name: "Plain HTML sections" })).toBeVisible();
  await expect(panel(page).locator(".pb-add-panel__notice")).toBeHidden();
});

actual("a page edited while the Add panel is open closes it: nothing is added to the older source", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await frame(page).locator("section.flow").hover();
  await page.getByRole("button", { name: /^Add a section before “Recent work”/ }).first().dispatchEvent("click");
  await expect(panel(page).getByRole("option", { name: /^Intro HTML$/ })).toBeVisible();
  // A real source edit in the code editor while the panel is open.
  const editor = page.locator("#content [role='textbox']").first();
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n<!-- edited while adding -->");
  await expect.poll(() => mounted(page)).toContain("<!-- edited while adding -->");
  const edited = await mounted(page);
  // The plus's gap was pinned to the older source, so its panel closes and offers nothing.
  await expect(panel(page)).toBeHidden();
  expect(await mounted(page)).toBe(edited);
  await expect(frame(page).locator("section.section-intro")).toHaveCount(0);
  expect(await storedDraft(page, CSS)).toBeUndefined();
});

// A public code-editor edit to a mounted stylesheet, then a real (synthetic) click
// on the option in the same turn: the edit lands after the gap's point was pinned.
async function editStylesheetThenClick(page: Page, option: string) {
  return page.evaluate(async (option) => {
    const editor = await import("/src/components/code-editor.ts");
    const path = ["styles/sections.css", "styles/site.css", "styles/elements.css"].find((candidate) => {
      if (!editor.isMounted(candidate)) return false;
      const source = editor.getMountedSource(candidate)!;
      try { editor.replaceActiveRange({ path: candidate, start: source.length, end: source.length, expected: "", text: "\n/* foreign edit */\n" }); return true; } catch { return false; }
    });
    if (!path) throw new Error("No stylesheet took the edit.");
    [...document.querySelectorAll<HTMLElement>(".pb-add-panel [role='option']")].find((element) => element.textContent?.startsWith(option))!.click();
    return path;
  }, option);
}

actual("a stylesheet edited after the gap was opened and before the click: the click derives again and keeps the edit", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await frame(page).locator("section.flow").hover();
  await page.getByRole("button", { name: /^Add a section before “Recent work”/ }).first().dispatchEvent("click");
  await expect(panel(page).getByRole("option", { name: /^Intro HTML$/ })).toBeVisible();
  const path = await editStylesheetThenClick(page, "Intro");
  expect(path).toMatch(/\.css$/);
  // Not the pinned bytes: the click re-reads every source, so the add goes on top of the foreign edit.
  await expect(frame(page).locator("main > section.section-intro + section.flow")).toHaveCount(1);
  await expect.poll(async () => (await storedDraft(page, CSS))?.content ?? "").toContain(".section-intro {");
  const edited = (await storedDraft(page, path))!.content;
  expect(edited).toContain("/* foreign edit */");
});

actual("the page edited while Add waits in restoreFile: nothing is inserted and the edit stays", async ({ page, baseURL }) => {
  // The code editor shows a stylesheet, so adding to the page awaits restoreFile first.
  await load(page, baseURL, "styles/site.css");
  await expect(frame(page).locator("section.flow h2")).toBeVisible();
  const before = await file(page, baseURL, "index.html");
  await frame(page).locator("section.flow").hover();
  await page.getByRole("button", { name: /^Add a section before “Recent work”/ }).first().dispatchEvent("click");
  await expect(panel(page).getByRole("option", { name: /^Intro HTML$/ })).toBeVisible();
  // Test harness note: a synthetic click; the handler is the product's own.
  // A synthetic click runs the real handler to its first await (restoreFile). Its
  // continuations are microtasks, so the edit is chained on microtasks too: the
  // first moment the page is mounted again and the section not yet added, the
  // page gets a public code-editor edit. "lost" means the add finished first.
  const result = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const target = [...document.querySelectorAll<HTMLElement>(".pb-add-panel [role='option']")].find((element) => element.textContent?.startsWith("Intro"))!;
    target.click();
    for (let hop = 0; hop < 20_000; hop++) {
      if (editor.isMounted("index.html")) {
        const source = editor.getMountedSource("index.html")!;
        if (source.includes("section-intro")) return `lost@${hop}`;
        try { editor.replaceActiveRange({ path: "index.html", start: source.length, end: source.length, expected: "", text: "\n<!-- foreign edit -->\n" }); return `edited@${hop}`; } catch { /* not active yet */ }
      }
      await (hop < 10_000 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 0)));
    }
    return "timeout";
  });
  console.log(`AWAIT-RACE ${result}`);
  expect(result).toMatch(/^edited@/);
  // The section's own check after restoreFile refuses (without it, the lower source guard would, with another message).
  await expect(page.locator("#notice")).toContainText("The page, its stylesheets or the editor's JSON changed. Choose the section again.");
  await expect(frame(page).locator("section.section-intro")).toHaveCount(0);
  // No insert write anywhere; the foreign edit stays, as its own history step.
  const edited = (await storedDraft(page, "index.html"))!.content;
  expect(edited).toBe(before + "\n<!-- foreign edit -->\n");
  expect(await storedDraft(page, CSS)).toBeUndefined();
  expect(await storedDraft(page, SIDECAR)).toBeUndefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
});

actual("added while a stylesheet is open in the editor: no notice, and one Undo takes back page, CSS and JSON", async ({ page, baseURL }) => {
  await load(page, baseURL, "styles/site.css");
  await expect(frame(page).locator("section.flow h2")).toBeVisible();
  const before = await file(page, baseURL, "index.html");
  await frame(page).locator("section.flow").hover();
  await page.getByRole("button", { name: /^Add a section before “Recent work”/ }).first().dispatchEvent("click");
  await panel(page).getByRole("option", { name: /^Intro HTML$/ }).click();
  await expect(frame(page).locator("main > section.section-intro + section.flow")).toHaveCount(1);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html", CSS].sort());
  await page.waitForTimeout(500);
  const notice = await page.locator("#notice").isVisible() ? await page.locator("#notice").textContent() : "";
  console.log(`HIST notice after a clean add: ${JSON.stringify(notice)}`);
  expect(notice).toBe("");
  const added = await mounted(page), drafts = (await storedDrafts(page)).map((draft) => [draft.path, draft.content]);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => [draft.path, draft.content])).toEqual(drafts);
  expect(await mounted(page)).toBe(added);
  await expect(page.locator("#notice")).toBeHidden();
  await page.screenshot({ path: `${OUT}-history-redo.png` });
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  expect(await file(page, baseURL, "index.html")).toBe(added);
});

for (const [label, scheme, width] of [["light", "light", 1440], ["dark", "dark", 1440], ["narrow", "light", 900]] as const) {
  actual(`Add panel screenshot on the real starter (${label}), with every console warning and error logged`, async ({ page, baseURL }) => {
    const logged: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") logged.push(`${message.type()}: ${message.text()} @ ${message.location().url}:${message.location().lineNumber}`); });
    page.on("pageerror", (error) => logged.push(`pageerror: ${String(error)}`));
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width, height: 1000 });
    await load(page, baseURL);
    const beforeAdd = logged.length;
    await openAdd(page);
    for (const name of ["Intro", "Features", "Split", "Contact"]) {
      const option = panel(page).getByRole("option", { name: new RegExp(`^${name} HTML$`) });
      await option.scrollIntoViewIfNeeded();
      await expect(option.locator(".pb-thumb")).toHaveClass(/is-ready/);
      // Whole: as tall as the section (after its late re-measure), at the canvas's width.
      await expect.poll(() => option.evaluate((element) => {
        const root = element.querySelector<HTMLElement>(".pb-thumb")!, frame = root.querySelector("iframe")!;
        const section = frame.contentDocument!.querySelector("main")!.firstElementChild!;
        const whole = Math.min(1000, section.getBoundingClientRect().height) * new DOMMatrix(getComputedStyle(frame).transform).a;
        return parseFloat(getComputedStyle(frame).width) >= 640 && root.clientHeight >= Math.floor(whole);
      })).toBe(true);
    }
    await panel(page).getByRole("heading", { name: "Plain HTML sections" }).scrollIntoViewIfNeeded();
    // Provenance: which messages came only after Add opened, and how many sandboxed thumbnail frames it made.
    await page.waitForTimeout(1000);
    const beforeShot = logged.length;
    const thumbs = await page.locator(".pb-add-panel .pb-thumb iframe[sandbox='allow-same-origin']").count();
    const otherSandboxed = await page.locator("iframe[sandbox]:not(.pb-thumb iframe)").count();
    await page.screenshot({ path: `${OUT}-add-${label}.png` });
    await page.waitForTimeout(500);
    console.log(`CONSOLE ${label}: before Add ${beforeAdd}, after Add opened ${beforeShot - beforeAdd}, during/after screenshot ${logged.length - beforeShot}; thumbnail frames (sandbox without allow-scripts) ${thumbs}; other sandboxed frames ${otherSandboxed}\n${logged.join("\n")}`);
  });
}

actual("adding a section beside a stored collection leaves its recipe and cards as they are", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "services/one/index.html", content: `<!doctype html><html><head><title>New services · Larkspur Studio</title><meta name="description" content="About services."></head><body><main><h1>New services</h1></main></body></html>` } });
  await load(page, baseURL);
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  const inspector = page.getByRole("region", { name: "Collection settings", exact: true });
  await inspector.getByRole("checkbox", { name: "/services/", exact: true }).check();
  await inspector.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"pagePath": "index.html"');
  const collections = JSON.parse((await storedDraft(page, SIDECAR))!.content).collections;
  const cards = await frame(page).locator("card-project").count();
  await openAdd(page);
  await add(page, /^Contact HTML$/);
  await expect(frame(page).locator("section.contact-section")).toHaveCount(1);
  const after = JSON.parse((await storedDraft(page, SIDECAR))!.content);
  expect(after.collections).toEqual(collections);
  expect(after.reusableSections.records.contact.rootClass).toBe("contact-section");
  await expect(frame(page).locator("card-project")).toHaveCount(cards);
  await expect(page.locator("#notice")).not.toContainText("not added");
});

// A new section is centred in the preview, clear of the sticky site header, like a
// section picked in Structure; the selection is that new section, nothing else.
for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["narrow", { width: 900, height: 1000 }]] as const) {
  actual(`an Intro added after Recent work shows whole below the sticky header and stays selected (${label})`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    await load(page, baseURL);
    const before = await mounted(page);
    await openAdd(page);
    await add(page, /^Intro HTML$/);
    await expect(frame(page).locator("main > section.flow + section.section-intro")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    const view = () => frame(page).locator("html").evaluate((html) => {
      const box = (el: Element | null) => { const r = el!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return { intro: box(document.querySelector("main > section.section-intro")), header: box(document.querySelector("site-header")),
        selected: box(document.querySelector('[data-native-selection-box="selected"]')), height: html.clientHeight, pad: parseFloat(getComputedStyle(html).scrollPaddingTop) || 0 };
    });
    // Whole, clear of the header, and centred as Structure does (in the view below the page's scroll-padding), not hugging an edge.
    await expect.poll(async () => { const v = await view(); return v.intro.top >= v.header.bottom - 1 && v.intro.bottom <= v.height + 1
      && Math.abs((v.intro.top + v.intro.bottom) / 2 - (v.pad + v.height) / 2) < 24; }).toBe(true);
    const v = await view();
    // The selection box is drawn around the new Intro.
    for (const side of ["top", "bottom", "left", "right"] as const) expect(Math.abs(v.selected[side] - v.intro[side])).toBeLessThan(3);
    await expect(page.getByRole("toolbar", { name: "Edit bar" })).toBeVisible();
    const home = await mounted(page);
    expect(home).toContain('<section class="section-intro"><h2>Section heading</h2>');
    expect(home).not.toMatch(/data-native|static-section|saved-section/);
    expect((await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "index.html", CSS].sort());
    await page.screenshot({ path: `${OUT}-reveal-${label}.png` });
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(() => storedDrafts(page)).toEqual([]);
    expect(await mounted(page)).toBe(before);
    await page.locator(".code-editor__redo").first().click();
    await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  });
}

test.describe("native static starter", () => {
  test.skip(!native, "Needs ASE_NATIVE_SAVE_FIXTURE pointing at the native static starter.");
  test("all four defaults join the imported sections stylesheet; the whole page then works with scripts off", async ({ page, baseURL }) => {
    await load(page, baseURL);
    const before = await mounted(page);
    const sectionsCss = await file(page, baseURL, CSS);
    await openAdd(page);
    await add(page, /^Intro HTML$/);
    await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
    const home = await mounted(page);
    expect(home.match(/rel="stylesheet"/g)?.length).toBe(before!.match(/rel="stylesheet"/g)?.length);
    await expect.poll(async () => (await storedDraft(page, CSS))?.content ?? "").toContain(".section-intro {");
    expect((await storedDraft(page, CSS))!.content.startsWith(sectionsCss)).toBe(true);
    expect((await storedDrafts(page)).some((draft) => draft.path.startsWith(".editor/legacy"))).toBe(false);
    // The other three join too; Contact uses contact-section beside the starter's own .section-contact.
    for (const [name, root] of [["Features", "section-features"], ["Split", "section-split"], ["Contact", "contact-section"]]) {
      await add(page, new RegExp(`^${name} HTML$`));
      await expect(frame(page).locator(`section.${root}`)).toHaveCount(1);
    }
    const four = await mounted(page), fourCss = (await storedDraft(page, CSS))!.content;
    // Each at the page's level after the selected flow section; the flow's heading and cards untouched.
    for (const root of ["section-intro", "section-features", "section-split", "contact-section"]) await expect(frame(page).locator(`main > section.${root}`)).toHaveCount(1);
    await expect(frame(page).locator("section.flow section")).toHaveCount(0);
    expect(flowOf(four)).toBe(flowOf(before));
    expect(four.match(/rel="stylesheet"/g)?.length).toBe(before!.match(/rel="stylesheet"/g)?.length);
    await page.locator(".code-editor__undo").first().click();
    await expect(frame(page).locator("section.contact-section")).toHaveCount(0);
    await page.locator(".code-editor__redo").first().click();
    await expect.poll(() => mounted(page)).toBe(four);
    await expect.poll(async () => (await storedDraft(page, CSS))?.content).toBe(fourCss);
    for (const name of ["Contact", "Split", "Features", "Intro"]) await page.locator(".code-editor__undo").first().click();
    await expect.poll(() => mounted(page)).toBe(before);
    for (const name of ["Intro", "Features", "Split", "Contact"]) await page.locator(".code-editor__redo").first().click();
    await expect.poll(() => mounted(page)).toBe(four);
    await publishButton(page).click();
    await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
    await page.keyboard.press("Escape");
    const site = await page.context().browser()!.newContext({ javaScriptEnabled: false, viewport: { width: 1200, height: 900 } });
    const plain = await site.newPage();
    const errors: string[] = [], requests: string[] = [];
    plain.on("pageerror", (error) => errors.push(String(error)));
    plain.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await plain.route("http://site.test/**", async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
      requests.push(path);
      if (path.startsWith(".editor/")) return route.fulfill({ status: 404, body: "" });
      const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
      if (!response.ok()) return route.fulfill({ status: 404, body: "" });
      await route.fulfill({ body: await response.body(), contentType: path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html" });
    });
    await plain.goto("http://site.test/index.html");
    await expect(plain.locator("section.section-intro > h2")).toHaveText("Section heading");
    await expect(plain.locator("section.section-intro")).toHaveCSS("text-align", "center");
    await expect(plain.locator("section.section-hero h1")).toBeVisible();
    await expect(plain.locator("section.contact-section")).toHaveCSS("text-align", "center");
    await expect(plain.locator("section.section-split .split-media")).toBeVisible();
    for (const root of ["section-intro", "section-features", "section-split", "contact-section"]) await expect(plain.locator(`main > section.${root}`)).toHaveCount(1);
    expect(flowOf(await file(page, baseURL, "index.html"))).toBe(flowOf(before));
    await plain.screenshot({ path: `${OUT}-native-js-off.png`, fullPage: true });
    expect(requests.some((path) => path.startsWith(".editor") || path.endsWith(".js"))).toBe(false);
    expect(errors).toEqual([]);
    await site.close();
  });
});
