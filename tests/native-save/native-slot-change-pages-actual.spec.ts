import { readFileSync } from "node:fs";
import { effectiveSource } from "./drafts";
import { expect, test, type Page } from "@playwright/test";

// Slice 45: a slot change in Edit component mode rewrites the template and
// every page using the component as one undo step. Home and About both use
// section-work (title slot, fixed lede, unnamed items slot).
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_SLOT_PAGES_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const chip = (page: Page) => page.locator(".edit-bar__label > .slot-chip");
const shots = process.env.ASE_SLOT_PAGES_SHOTS;
const TEMPLATE = "components/section-work/section-work.html";
const ABOUT = "about/index.html";
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
const fixture = (path: string) => readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/${path}`, "utf8");
function homeWithWork() {
  const home = fixture("index.html");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${cards.join("\n      ")}
    </section-work>${home.slice(end)}`;
}
function aboutWithWork() {
  const about = fixture(ABOUT);
  const at = about.indexOf(`    <section class="contact flow"`);
  expect(at).toBeGreaterThan(0);
  return `${about.slice(0, at)}    <section-work>
      <h2 slot="title">How we work</h2>
      <p>One project at a time.</p>
    </section-work>
${about.slice(at)}`;
}

async function openMode(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, workTemplate], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()], [ABOUT, aboutWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}

test("slot changes rewrite the template and both pages as one undo step", { tag: "@actual" }, async ({ page, baseURL }) => {
  await openMode(page, baseURL);
  const work = frame(page).locator("section-work");
  const home = homeWithWork(), about = aboutWithWork();
  const files = () => Promise.all([TEMPLATE, "index.html", ABOUT].map((path) => effectiveSource(page, baseURL, path)));
  const undo = () => page.getByRole("button", { name: "Undo", exact: true }).click();
  const status = page.locator("#status");

  // Made fixed: both pages lose their title; the template's heading shows instead. One undo restores all three.
  await work.getByText("Section title", { exact: true }).click();
  await expect(chip(page)).toHaveText("title");
  if (shots) await page.screenshot({ path: `${shots}/1-title-slot.png` });
  await chip(page).focus();
  await page.keyboard.press("Enter");
  const fixedTemplate = workTemplate.replace('<slot name="title"><h2>Section title</h2></slot>', "<h2>Section title</h2>");
  const fixedFiles = [fixedTemplate, home.replace(`      <h2 slot="title">Recent work</h2>\n`, ""), about.replace(`      <h2 slot="title">How we work</h2>\n`, "")];
  await expect.poll(files).toEqual(fixedFiles);
  await expect(chip(page)).toHaveClass(/slot-chip--fixed/);
  // The toggle changed the selected part: the focus is on its new chip.
  await expect(chip(page)).toBeFocused();
  await expect(status).toContainText("Made “title” fixed. 2 pages using it follow.");
  if (shots) await page.screenshot({ path: `${shots}/2-title-fixed.png` });
  await undo();
  await expect.poll(files).toEqual([workTemplate, home, about]);
  await expect(chip(page)).toHaveClass(/slot-chip--slot/);

  // Renamed: both pages' slot attribute follows; one undo.
  await chip(page).dblclick();
  await expect(chip(page).locator(".slot-chip__name")).toBeFocused();
  await page.keyboard.type("heading");
  await page.keyboard.press("Enter");
  await expect.poll(files).toEqual([workTemplate.replace('name="title"', 'name="heading"'),
    home.replace('<h2 slot="title">Recent work', '<h2 slot="heading">Recent work'), about.replace('<h2 slot="title">How we work', '<h2 slot="heading">How we work')]);
  await expect(chip(page)).toHaveText("heading");
  await undo();
  await expect.poll(files).toEqual([workTemplate, home, about]);

  // Made a slot: each page gets its own copy of the lede.
  await work.getByText(LEDE, { exact: true }).click();
  await chip(page).click();
  const copy = `<p slot="text" class="lede">${LEDE}</p>`;
  await expect.poll(files).toEqual([workTemplate.replace(`<p class="lede">${LEDE}</p>`, `<slot name="text"><p class="lede">${LEDE}</p></slot>`),
    home.replace(`<h2 slot="title">Recent work</h2>\n`, `<h2 slot="title">Recent work</h2>\n      ${copy}\n`),
    about.replace(`<h2 slot="title">How we work</h2>\n`, `<h2 slot="title">How we work</h2>\n      ${copy}\n`)]);
  await undo();
  await expect.poll(files).toEqual([workTemplate, home, about]);

  // Made fixed again, then Done: Home shows the template's heading; one Undo on the page brings both pages back.
  await work.getByText("Section title", { exact: true }).click();
  await chip(page).click();
  await expect.poll(files).toEqual(fixedFiles);
  await page.getByRole("button", { name: "Done editing component" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Section title");
  if (shots) await page.screenshot({ path: `${shots}/3-home-after-done.png` });
  await undo();
  await expect.poll(files).toEqual([workTemplate, home, about]);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work");
});
