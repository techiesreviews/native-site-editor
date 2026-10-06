import { seedSavedSections } from "./static-sections";
import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { effectiveSource } from "./drafts";

// The edit bar on a master's elements while it is open in its page: the purple Edit opens .editor/sections/<id>.html,
// and the page on show renders that master in the copy's place while the page's own HTML and CSS
// stay byte for byte. Typing in the preview or in Code changes only the master. Runs on the native
// static starter: STATIC_SECTIONS_FIXTURE=native ASE_NATIVE_SAVE_FIXTURE=<.scratch/native-static-preview>.
test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Runs on the native static starter (STATIC_SECTIONS_FIXTURE=native).");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();

test.beforeEach(async ({ page, baseURL }) => { await seedSavedSections(page, baseURL); });

const JSON_PATH = ".editor/page-builder.json";
const MASTER = ".editor/sections/intro.html";
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


async function selectMasterHeading(page: Page) {
  await editIntro(page);
  await frame(page).locator("section.section-intro h2").click();
  await expect(bar(page).locator(".edit-bar__label")).toContainText("Heading");
}

test("a master's heading gets its bar (Intro › Heading, level, B, I) and changes only the master, one Undo", { tag: "@native-static" }, async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await load(page, baseURL);
  await addIntro(page);
  await expect.poll(async () => JSON.parse((await effectiveSource(page, baseURL, JSON_PATH)) ?? "{}").pages?.["index.html"]?.sections?.["intro-1"]?.recordId).toBe("intro");
  const home = (await effectiveSource(page, baseURL, "index.html"))!;
  const css = await effectiveSource(page, baseURL, "styles/sections.css");
  await selectMasterHeading(page);
  await expect(bar(page).locator(".edit-bar__label")).toContainText("Intro");
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Bold", exact: true })).toBeVisible();
  // No moving, duplicating or removing inside a master, and no second Edit.
  for (const name of ["Move up", "Move down", "Duplicate", "Remove"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  await bar(page).getByRole("button", { name: /In the Intro master/ }).click();
  await expect(bar(page).locator(".edit-bar__label")).toHaveText("Intro");
  for (const name of ["Move up", "Move down", "Duplicate", "Remove"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  await frame(page).locator("section.section-intro h2").click();
  // Heading level h2 → h3: the master only.
  const master = (await effectiveSource(page, baseURL, MASTER))!;
  await bar(page).getByRole("combobox", { name: "Heading level" }).selectOption("h3");
  await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe(master.replace("<h2>", "<h3>").replace("</h2>", "</h3>"));
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  expect(await effectiveSource(page, baseURL, "styles/sections.css")).toBe(css);
  await banner(page).getByRole("button", { name: "Done" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe(master);
  // Natural keyboard ranges: both formatting commands edit only the master.
  for (const [name, tag] of [["Bold", "strong"], ["Italic", "em"]]) {
    await frame(page).locator("section.section-intro h2").click();
    await page.keyboard.press("Home");
    for (let i = 0; i < 7; i++) await page.keyboard.press("Shift+ArrowRight");
    await bar(page).getByRole("button", { name, exact: true }).click();
    await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe(master.replace("Section heading", `<${tag}>Section</${tag}> heading`));
    expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
    expect(await effectiveSource(page, baseURL, "styles/sections.css")).toBe(css);
    await banner(page).getByRole("button", { name: "Done" }).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => effectiveSource(page, baseURL, MASTER)).toBe(master);
  }
  // After Done, an old control can't write the master or the page.
  const level = await bar(page).getByRole("combobox", { name: "Heading level" }).elementHandle();
  expect(level).not.toBeNull();
  await frame(page).locator("section.section-intro h2").click();
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(master);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  await level!.evaluate((control: HTMLSelectElement) => { control.value = "h4"; control.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(master);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  // Reopening the same path gives a new session; the previous callback stays stale.
  await editIntro(page);
  await level!.evaluate((control: HTMLSelectElement) => { control.value = "h4"; control.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(master);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  expect(errors).toEqual([]);
});
