import { seedSavedSections } from "./static-sections";
import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { effectiveSource } from "./drafts";

// A saved section's master shown in its page: the purple Edit opens .editor/sections/<id>.html,
// and the page on show renders that master in the copy's place while the page's own HTML and CSS
// stay byte for byte. Typing in the preview or in Code changes only the master. Runs on the native
// static starter: STATIC_SECTIONS_FIXTURE=native ASE_NATIVE_SAVE_FIXTURE=<.scratch/native-static-preview>.
test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Runs on the native static starter (STATIC_SECTIONS_FIXTURE=native).");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();

test.beforeEach(async ({ page, baseURL }) => { await seedSavedSections(page, baseURL); });

const JSON_PATH = ".editor/page-builder.json";
const MASTER = ".editor/sections/intro.html";
const SHOTS = process.env.MASTER_HOST_OUT;
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const banner = (page: Page) => page.getByRole("region", { name: "Saved section master" });
async function load(page: Page, baseURL: string | undefined, path = "index.html") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function addIntro(page: Page) {
  await frame(page).locator("main > section h2").first().click();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const option = panel(page).getByRole("option", { name: /^Intro HTML$/ });
  await option.focus();
  await option.press("Enter");
  await panel(page).getByRole("button", { name: "Close" }).click();
}
async function editIntro(page: Page) {
  await page.getByRole("treeitem", { name: /^(Section|Intro) Section heading/ }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Edit Intro component", exact: true }).click();
  await expect(banner(page)).toBeVisible();
}

test("the master shows in its page; typing in the preview or in Code changes only the master; Done shows the page's own copy", { tag: "@native-static" }, async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await load(page, baseURL);
  await addIntro(page);
  await expect.poll(async () => JSON.parse((await effectiveSource(page, baseURL, JSON_PATH)) ?? "{}").pages?.["index.html"]?.sections?.["intro-1"]?.recordId).toBe("intro");
  const home = (await effectiveSource(page, baseURL, "index.html"))!;
  const css = await effectiveSource(page, baseURL, "styles/sections.css");
  await editIntro(page);
  const heading = frame(page).locator("section.section-intro h2");
  await expect(heading).toHaveText("Section heading");
  // Typing in the preview's master copy.
  await heading.click();
  await expect(page.locator(".preview-crumbs, .canvas-crumbs, nav").filter({ hasText: "section.section-intro" }).first()).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.type(" Visual");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await effectiveSource(page, baseURL, MASTER)) ?? "").toContain("Visual");
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(`<section class="section-intro"><h2>Section heading Visual</h2><p>Write a short introduction for this part of the page.</p></section>`);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  expect(await effectiveSource(page, baseURL, "styles/sections.css")).toBe(css);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/visual-typed.png` });
  // Add is not offered while the master is on show.
  await expect(page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  // Code: the preview follows the master's text.
  const typed = (await effectiveSource(page, baseURL, MASTER))!;
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < typed.indexOf("Write"); i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.type("Now ");
  await expect(frame(page).locator("section.section-intro p")).toHaveText("Now Write a short introduction for this part of the page.");
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  // The rest of the page is read-only while the master is open.
  await frame(page).locator("main > section h1, main > section h2").first().click();
  await expect(page.locator("#status")).toContainText("read-only while its master is open");
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  // Undo and Redo of the Code typing, from the keyboard outside the code.
  const coded = (await effectiveSource(page, baseURL, MASTER))!;
  await banner(page).getByRole("button", { name: "Done" }).focus();
  // (The code's own Undo goes word by word.)
  for (let i = 0; i < 4 && (await effectiveSource(page, baseURL, MASTER)) !== typed; i++) { await page.keyboard.press("ControlOrMeta+z"); await page.waitForTimeout(150); }
  await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe(typed);
  await expect(frame(page).locator("section.section-intro p")).toHaveText("Write a short introduction for this part of the page.");
  for (let i = 0; i < 4 && (await effectiveSource(page, baseURL, MASTER)) !== coded; i++) { await page.keyboard.press("ControlOrMeta+Shift+z"); await page.waitForTimeout(150); }
  await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe(coded);
  // Done: the page shows its own copy again, byte for byte as before.
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  await expect(heading).toHaveText("Section heading");
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  // Edit again: the master's text is still there.
  await editIntro(page);
  await expect(heading).toHaveText("Section heading Visual");
  await expect(frame(page).locator("section.section-intro p")).toHaveText("Now Write a short introduction for this part of the page.");
  // Update copies: the page's copy takes the master; the master stays on show; one Undo reverts.
  const json = await effectiveSource(page, baseURL, JSON_PATH);
  await banner(page).getByRole("button", { name: "Update copies" }).click();
  await expect(page.locator("#status")).toContainText("Updated 1");
  await expect.poll(async () => (await effectiveSource(page, baseURL, "index.html")) ?? "").toContain("<h2>Section heading Visual</h2>");
  await expect(heading).toHaveText("Section heading Visual");
  expect(await effectiveSource(page, baseURL, "styles/sections.css")).toBe(css);
  await banner(page).getByRole("button", { name: "Done" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => effectiveSource(page, baseURL, "index.html")).toBe(home);
  await expect.poll(async () => effectiveSource(page, baseURL, JSON_PATH)).toBe(json);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await effectiveSource(page, baseURL, "index.html")) ?? "").toContain("<h2>Section heading Visual</h2>");
  // Done after the update: back to the page, its copy selected where it now is.
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  await expect(heading).toHaveText("Section heading Visual");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-done.png` });
  expect(errors).toEqual([]);
});

test("an invalid master falls back to the page's own copy and Done still works; after Done typing edits the page, not the master", { tag: "@native-static" }, async ({ page, baseURL }) => {
  await load(page, baseURL);
  await addIntro(page);
  await expect.poll(async () => JSON.parse((await effectiveSource(page, baseURL, JSON_PATH)) ?? "{}").pages?.["index.html"]?.sections?.["intro-1"]?.recordId).toBe("intro");
  await editIntro(page);
  const heading = frame(page).locator("section.section-intro h2");
  // Code replaces the master with something that is not a section: the preview shows the page's copy.
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("broken");
  await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe("broken");
  await expect(heading).toHaveText("Section heading");
  await expect(banner(page).getByRole("button", { name: "Update copies" })).toBeDisabled();
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  await expect(banner(page)).toBeHidden();
  // The page's own copy is the page again: typing edits index.html, and the master stays as it was.
  await heading.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" here");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await effectiveSource(page, baseURL, "index.html")) ?? "").toContain("<h2>Section heading here</h2>");
  expect(await effectiveSource(page, baseURL, MASTER)).toBe("broken");
});

test("while a master is open a Structure row's Alt+Up changes nothing and the master stays; after Done it moves the section, one Undo", { tag: "@native-static" }, async ({ page, baseURL }) => {
  await load(page, baseURL);
  await addIntro(page);
  await expect.poll(async () => JSON.parse((await effectiveSource(page, baseURL, JSON_PATH)) ?? "{}").pages?.["index.html"]?.sections?.["intro-1"]?.recordId).toBe("intro");
  await editIntro(page);
  const files = async () => Promise.all(["index.html", "styles/sections.css", JSON_PATH, MASTER].map((path) => effectiveSource(page, baseURL, path)));
  const before = await files();
  const row = page.getByRole("treeitem", { name: /^Section What we offer/ }).first();
  await row.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await page.waitForTimeout(800);
  expect(await files()).toEqual(before);
  await expect(page.locator("#primary-title")).toHaveText(MASTER);
  await expect(banner(page)).toBeVisible();
  await expect(page.locator("#status")).toContainText("read-only while its master is open");
  // After Done the same key moves the section, and one Undo puts it back.
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  const home = await effectiveSource(page, baseURL, "index.html");
  await page.getByRole("treeitem", { name: /^Section What we offer/ }).first().focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(async () => effectiveSource(page, baseURL, "index.html")).not.toBe(home);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => effectiveSource(page, baseURL, "index.html")).toBe(home);
});
