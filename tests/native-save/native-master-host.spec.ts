import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { storedDraft } from "./drafts";

// Saved-section masters in the real editor, on the native static starter:
// STATIC_SECTIONS_FIXTURE=native ASE_NATIVE_SAVE_FIXTURE=<.scratch/native-static-preview>.
// A page click selects the page's own copy; only the purple Edit on a whole saved
// section opens its master (.editor/sections/<id>.html). Typing in the master changes
// no page; Update copies changes only copies nobody customised, as one Undo.
test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Runs on the native static starter (STATIC_SECTIONS_FIXTURE=native).");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();

const JSON_PATH = ".editor/page-builder.json";
const MASTER = ".editor/sections/intro.html";
const SHOTS = process.env.MASTER_HOST_OUT;
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const banner = (page: Page) => page.getByRole("region", { name: "Saved section master" });
const base = async (page: Page, baseURL: string | undefined, path: string) => {
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
};
// The editor's text for a file: its draft, else the repository's.
// A page click on a section's own padding selects that section (the page's copy).
async function selectSection(page: Page, selector: string) {
  await frame(page).locator(selector).scrollIntoViewIfNeeded();
  await frame(page).locator(selector).evaluate((el) => (el as HTMLElement).click());
}
const effective = async (page: Page, baseURL: string | undefined, path: string) => (await storedDraft(page, path))?.content ?? await base(page, baseURL, path);

async function load(page: Page, baseURL: string | undefined, path = "index.html") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function addIntro(page: Page, select: string) {
  await frame(page).locator(select).first().click();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  const option = panel(page).getByRole("option", { name: /^Intro HTML$/ });
  await option.focus();
  await option.press("Enter");
}

test("Add links each copy; the purple Edit opens the master; Update copies changes only unchanged copies, one Undo", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await load(page, baseURL);
  const homeBefore = await effective(page, baseURL, "index.html");
  await addIntro(page, "main > section h2");
  await expect.poll(async () => (await effective(page, baseURL, "index.html"))?.length ?? 0).toBeGreaterThan(homeBefore!.length);
  const linked = JSON.parse((await effective(page, baseURL, JSON_PATH))!);
  expect(linked.pages["index.html"].sections["intro-1"]).toMatchObject({ kind: "native-section", recordId: "intro" });
  // A second copy on another page, linked too.
  await load(page, baseURL, "about/index.html");
  await addIntro(page, "main > section h1, main > section h2");
  await expect.poll(async () => JSON.parse((await effective(page, baseURL, JSON_PATH))!).pages["about/index.html"]?.sections?.["intro-1"]?.recordId).toBe("intro");
  // The About copy is customised in the code: it must never be overwritten.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("about/index.html")!;
    const next = before.replace("<p>Write a short introduction", "<p>Our own words introduction");
    editor.replaceActiveRange({ path: "about/index.html", start: 0, end: before.length, expected: before, text: next });
  });
  await expect.poll(async () => (await effective(page, baseURL, "about/index.html")) ?? "").toContain("Our own words introduction for this part");
  const aboutCustom = (await effective(page, baseURL, "about/index.html"))!;
  // Back home: a click on the copy selects the page's own section; its label is the saved section.
  await load(page, baseURL);
  await selectSection(page, "section.section-intro");
  await expect(bar(page).locator(".edit-bar__label")).toContainText("Intro");
  const edit = bar(page).getByRole("button", { name: "Edit Intro component", exact: true });
  await expect(edit).toBeVisible();
  // The child has no Edit.
  await frame(page).locator("section.section-intro h2").click();
  await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  await selectSection(page, "section.section-intro");
  await bar(page).getByRole("button", { name: "Edit Intro component", exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Editing Intro master");
  // The master is open in Code; the preview stays on the page.
  await expect(page.locator("#primary-title")).toHaveText(MASTER);
  await expect(frame(page).locator("section.section-intro")).toBeVisible();
  const masterMade = (await effective(page, baseURL, MASTER))!;
  const cssAfterAdds = await effective(page, baseURL, "styles/sections.css");
  expect(masterMade).toBe(`<section class="section-intro"><h2>Section heading</h2><p>Write a short introduction for this part of the page.</p></section>`);
  const madeJson = (await effective(page, baseURL, JSON_PATH))!;
  expect(JSON.parse(madeJson).reusableSections.records.intro.htmlPath).toBe(MASTER);
  expect(madeJson).not.toContain('"html"');
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/master-open.png` });
    await page.setViewportSize({ width: 760, height: 900 });
    await page.screenshot({ path: `${SHOTS}/master-open-narrow.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  // Real typing in the master: pages don't change.
  const homeLinked = (await effective(page, baseURL, "index.html"))!;
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 0; i < masterMade.indexOf("heading</h2>"); i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < "heading".length; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.type("intro");
  await expect.poll(async () => (await effective(page, baseURL, MASTER)) ?? "").toContain("<h2>Section intro</h2>");
  expect(await effective(page, baseURL, "index.html")).toBe(homeLinked);
  expect(await effective(page, baseURL, "about/index.html")).toBe(aboutCustom);
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  // Update copies: the home copy follows; the customised About copy stays.
  const jsonBeforeUpdate = (await effective(page, baseURL, JSON_PATH))!;
  await banner(page).getByRole("button", { name: "Update copies" }).click();
  await expect(page.locator("#status")).toContainText("Updated 1; 1 customised");
  await expect.poll(async () => (await effective(page, baseURL, "index.html")) ?? "").toContain("<h2>Section intro</h2>");
  expect(await effective(page, baseURL, "about/index.html")).toBe(aboutCustom);
  expect(await effective(page, baseURL, "styles/sections.css")).toBe(cssAfterAdds);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-update.png` });
  // One Undo puts the page and the links back; Redo applies them again.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => effective(page, baseURL, "index.html")).toBe(homeLinked);
  await expect.poll(async () => effective(page, baseURL, JSON_PATH)).toBe(jsonBeforeUpdate);
  expect(await effective(page, baseURL, MASTER)).toContain("<h2>Section intro</h2>");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await effective(page, baseURL, "index.html")) ?? "").toContain("<h2>Section intro</h2>");
  // Done: back to the page.
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  await expect(banner(page)).toBeHidden();
  // The published page: plain HTML, no editor attributes or scripts added.
  const home = (await effective(page, baseURL, "index.html"))!;
  const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
  for (const pattern of [/<script\b/g, /data-native|data-editor/g]) expect(count(home, pattern)).toBe(count(homeBefore!, pattern));
  expect(home.replace("<h2>Section intro</h2>", "<h2>Section heading</h2>")).toBe(homeLinked);
  // A new Add gets the master's text and its own link.
  await load(page, baseURL, "work/fern-and-kettle/index.html");
  await addIntro(page, "main h1, main h2");
  await expect.poll(async () => (await effective(page, baseURL, "work/fern-and-kettle/index.html")) ?? "").toContain("<h2>Section intro</h2>");
  await expect.poll(async () => JSON.parse((await effective(page, baseURL, JSON_PATH))!).pages["work/fern-and-kettle/index.html"]?.sections?.["intro-1"]?.basis).toContain("Section intro");
  expect(errors).toEqual([]);
});

test("a broken master can still be left with Done; Update copies refuses; other sections stay available", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await addIntro(page, "main > section h2");
  await expect.poll(async () => JSON.parse((await effective(page, baseURL, JSON_PATH)) ?? "{}").pages?.["index.html"]?.sections?.["intro-1"]?.recordId).toBe("intro");
  const home = (await effective(page, baseURL, "index.html"))!;
  await selectSection(page, "section.section-intro");
  await bar(page).getByRole("button", { name: "Edit Intro component", exact: true }).click();
  await expect(banner(page)).toBeVisible();
  // Replace the whole master with something that is not a section.
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("broken");
  await expect.poll(async () => effective(page, baseURL, MASTER)).toBe("broken");
  // Update copies refuses with a reason and writes nothing.
  const json = await effective(page, baseURL, JSON_PATH);
  await banner(page).getByRole("button", { name: "Update copies" }).click();
  await expect(page.getByText(/exactly one complete <section>|not a valid|section/i).first()).toBeVisible();
  expect(await effective(page, baseURL, "index.html")).toBe(home);
  expect(await effective(page, baseURL, JSON_PATH)).toBe(json);
  await banner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("index.html");
  await expect(banner(page)).toBeHidden();
  expect(await effective(page, baseURL, "index.html")).toBe(home);
  // The other page sections can still be added.
  // (The docked Add panel stays open from the first Add.)
  if (!(await panel(page).isVisible())) await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await panel(page).getByRole("searchbox").fill("");
  await expect(panel(page).getByRole("option", { name: /^Features HTML$/ })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/broken-master-add.png` });
});
