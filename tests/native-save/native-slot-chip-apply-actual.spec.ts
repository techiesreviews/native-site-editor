import { readFileSync } from "node:fs";
import { effectiveSource } from "./drafts";
import { expect, test, type Page } from "@playwright/test";

// Slice 44: the label chip changes the template, each action one undo step.
// Recent work has a title slot, fixed lede and unnamed items slot.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_SLOT_CHIP_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const label = (page: Page) => page.locator(".edit-bar__label");
const chip = (page: Page) => label(page).locator("> .slot-chip");
const shots = process.env.ASE_SLOT_CHIP_SHOTS;
const TEMPLATE = "components/section-work/section-work.html";
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
function homeWithWork() {
  const home = readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/index.html`, "utf8");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  expect(cards).toHaveLength(3);
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${cards.join("\n      ")}
    </section-work>${home.slice(end)}`;
}

async function openMode(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, workTemplate], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
}

test("slot chip toggles and renames the template in one undo step without reloading the frame", { tag: "@actual" }, async ({ page, baseURL }) => {
  await openMode(page, baseURL);
  const work = frame(page).locator("section-work");
  await frame(page).locator("html").evaluate(() => { (window as unknown as { slotMark: string }).slotMark = "slice-44"; });
  const srcdoc = await page.locator(".native-preview-frame").getAttribute("srcdoc");
  const source = () => effectiveSource(page, baseURL, TEMPLATE);
  const unchangedFrame = async () => {
    expect(await frame(page).locator("html").evaluate(() => (window as unknown as { slotMark?: string }).slotMark)).toBe("slice-44");
    expect(await page.locator(".native-preview-frame").getAttribute("srcdoc")).toBe(srcdoc);
  };
  const undo = () => page.getByRole("button", { name: "Undo", exact: true }).click();
  const redo = () => page.getByRole("button", { name: "Redo", exact: true }).click();
  const rename = async (value: string) => {
    await chip(page).dblclick();
    await expect(chip(page).locator(".slot-chip__name")).toBeFocused();
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
  };

  await work.getByText("Section title", { exact: true }).click();
  await expect(chip(page)).toHaveClass(/slot-chip--slot/);
  await work.locator("h3:visible", { hasText: "Untitled project" }).click();
  await expect(chip(page)).toHaveText("items ×1");
  await expect(chip(page)).toHaveClass(/slot-chip--items/);
  await work.getByText(LEDE, { exact: true }).click();
  await expect(chip(page)).toHaveClass(/slot-chip--fixed/);
  if (shots) await page.screenshot({ path: `${shots}/apply-fixed.png` });

  const slotted = workTemplate.replace(`<p class="lede">${LEDE}</p>`, `<slot name="text"><p class="lede">${LEDE}</p></slot>`);
  await chip(page).click();
  await expect.poll(source).toBe(slotted);
  await expect(chip(page)).toHaveClass(/slot-chip--slot/);
  await expect(chip(page)).toHaveText("text");
  await expect(label(page)).toContainText("Paragraph");
  if (shots) await page.screenshot({ path: `${shots}/apply-slot.png` });
  await unchangedFrame();
  await undo();
  await expect.poll(source).toBe(workTemplate);
  await expect(chip(page)).toHaveClass(/slot-chip--fixed/);
  await redo();
  await expect.poll(source).toBe(slotted);
  await expect(chip(page)).toHaveClass(/slot-chip--slot/);
  await chip(page).click();
  await expect.poll(source).toBe(workTemplate);
  await expect(chip(page)).toHaveClass(/slot-chip--fixed/);
  await unchangedFrame();

  await work.getByText("Section title", { exact: true }).click();
  await chip(page).click();
  await expect.poll(source).toBe(workTemplate.replace('<slot name="title"><h2>Section title</h2></slot>', '<h2>Section title</h2>'));
  await expect(work.getByText("Section title", { exact: true })).toBeVisible();
  await expect(chip(page)).toHaveClass(/slot-chip--fixed/);
  await expect(label(page)).toContainText("Heading");
  await undo();
  await expect.poll(source).toBe(workTemplate);
  await expect(chip(page)).toHaveText("title");
  await unchangedFrame();

  await rename("heading");
  await expect.poll(source).toBe(workTemplate.replace('name="title"', 'name="heading"'));
  await expect(chip(page)).toHaveText("heading");
  if (shots) await page.screenshot({ path: `${shots}/apply-renamed.png` });
  await undo();
  await expect.poll(source).toBe(workTemplate);
  await expect(chip(page)).toHaveText("title");

  // Give the fixed lede a slot, then refuse its taken name on the title.
  await work.getByText(LEDE, { exact: true }).click();
  await chip(page).click();
  await expect.poll(source).toBe(slotted);
  await work.getByText("Section title", { exact: true }).click();
  await rename("text");
  await expect(chip(page)).toHaveText("title");
  expect(await source()).toBe(slotted);
  await undo();
  await expect.poll(source).toBe(workTemplate);
  await unchangedFrame();
});
