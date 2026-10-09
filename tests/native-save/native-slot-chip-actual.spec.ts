import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The slot chip (build slice 23): in Edit component mode on the starter's
// Recent work, made a section component with a title slot, a fixed lede and
// the items slot, selecting a part shows its chip after the element's name in
// the edit bar label: purple for the title, pink for the items, grey and
// struck through for the lede. A click reports one toggle, after a short wait;
// a double-click reports none.
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

/** The chip shown, the name before it, and how it is drawn. */
const shown = (page: Page) => chip(page).evaluate((el) => ({
  text: el.textContent,
  before: el.previousElementSibling?.textContent?.trim(),
  last: el === el.parentElement!.lastElementChild,
  kind: [...el.classList].find((name) => name.startsWith("slot-chip--")),
  pressed: el.getAttribute("aria-pressed"),
  background: getComputedStyle(el).backgroundColor,
  struck: getComputedStyle(el).textDecorationLine,
}));

test("Edit component mode shows each part's slot chip after its name; a click reports one toggle, a double-click none", { tag: "@actual" }, async ({ page, baseURL }) => {
  await openMode(page, baseURL);
  const work = frame(page).locator("section-work");
  await page.evaluate(() => {
    const reports: unknown[] = [];
    (window as unknown as { slotChipReports: unknown[] }).slotChipReports = reports;
    window.addEventListener("native-slot-chip", (event) => reports.push((event as CustomEvent).detail));
  });
  const reports = () => page.evaluate(() => (window as unknown as { slotChipReports: { action: string; template: string; node: number[]; chip: { state: string; name: string } }[] }).slotChipReports);

  // The title: a slot, purple.
  await work.getByText("Section title", { exact: true }).click();
  await expect(chip(page)).toHaveText("title");
  const title = await shown(page);
  expect(title).toMatchObject({ before: "Heading", last: true, kind: "slot-chip--slot", pressed: "true", struck: "none" });
  await expect(label(page).locator(".edit-bar__context")).toContainText("Section work");
  if (shots) await page.screenshot({ path: `${shots}/title-slot.png` });

  // The items: the fallback card stands for the items slot, pink, with its count.
  await work.locator("h3:visible", { hasText: "Untitled project" }).click();
  await expect(chip(page)).toHaveText("items ×1");
  const items = await shown(page);
  expect(items).toMatchObject({ before: "Card project›", last: true, kind: "slot-chip--items", pressed: "true", struck: "none" });
  expect(items.background).not.toBe(title.background);
  if (shots) await page.screenshot({ path: `${shots}/items-slot.png` });
  // A fixed part: grey, struck through, with the name it would get.
  await work.getByText(LEDE, { exact: true }).click();
  await expect(chip(page)).toHaveText("text");
  const lede = await shown(page);
  expect(lede).toMatchObject({ before: "Paragraph", last: true, kind: "slot-chip--fixed", pressed: "false", struck: "line-through" });
  expect(lede.background).not.toBe(title.background);
  if (shots) await page.screenshot({ path: `${shots}/fixed-part.png` });

  // One click: one toggle reported, for this part, after a short wait.
  await chip(page).click();
  await expect.poll(reports).toHaveLength(1);
  expect((await reports())[0]).toEqual({ action: "toggle", template: TEMPLATE, node: [0, 1], chip: { state: "fixed", name: "text", part: [0, 1] } });

  // A double-click: none. A timer set in the page after it, for longer than the
  // click's wait, runs after any click it could have left waiting.
  await chip(page).dblclick();
  await page.evaluate(() => new Promise((done) => setTimeout(done, 3 * 240)));
  expect(await reports()).toHaveLength(1);

  // The title's chip reports its own toggle.
  await work.getByText("Section title", { exact: true }).click();
  await expect(chip(page)).toHaveText("title");
  await chip(page).click();
  await expect.poll(reports).toHaveLength(2);
  expect((await reports())[1]).toMatchObject({ node: [0, 0, 0], chip: { state: "slot", name: "title", slot: [0, 0] } });

  // Outside the mode no chip shows.
  await page.locator(".canvas-bar").getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(toolbar(page)).toBeVisible();
  await expect(page.locator(".slot-chip")).toHaveCount(0);
});

// Slice 24: a double-click on a slot's chip puts a caret in its own text; the
// name is made valid as typed; Enter or leaving commits, Esc cancels.
test("a double-click renames a slot in its chip: valid as typed, Enter or leaving commits, Esc cancels", { tag: "@actual" }, async ({ page, baseURL }) => {
  await openMode(page, baseURL);
  const work = frame(page).locator("section-work");
  await page.evaluate(() => {
    const reports: unknown[] = [];
    (window as unknown as { slotChipReports: unknown[] }).slotChipReports = reports;
    window.addEventListener("native-slot-chip", (event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      reports.push(detail);
      // The owner may refuse a name: this one stands for a taken one.
      if (detail.name === "taken") event.preventDefault();
    });
  });
  const reports = () => page.evaluate(() => (window as unknown as { slotChipReports: { action: string; node: number[]; name?: string }[] }).slotChipReports);
  const name = () => chip(page).locator(".slot-chip__name");
  const settle = () => page.evaluate(() => new Promise((done) => setTimeout(done, 3 * 240)));

  await work.getByText("Section title", { exact: true }).click();
  await expect(chip(page)).toHaveText("title");

  // A stand-in for the slot's Structure badge (slice 46): another chip of the same slot.
  await chip(page).evaluate((el) => {
    const badge = el.cloneNode(true) as HTMLElement;
    badge.id = "badge-stand-in";
    document.body.append(badge);
  });
  const badge = page.locator("#badge-stand-in");

  // Esc cancels: the old name, nothing reported.
  await chip(page).dblclick();
  await expect(name()).toBeFocused();
  await expect(name()).toHaveAttribute("contenteditable", /plaintext-only|true/);
  expect(await label(page).locator("input, textarea").count()).toBe(0);
  if (shots) await page.screenshot({ path: `${shots}/rename-caret.png` });
  await page.keyboard.type("Lead ");
  await expect(chip(page)).toHaveText("lead-");
  await page.keyboard.type("Text");
  await expect(chip(page)).toHaveText("lead-text");
  await expect(badge).toHaveText("lead-text");
  if (shots) await page.screenshot({ path: `${shots}/rename-typed.png` });
  // The editor's keys stay out of it: Backspace edits the name, not the page.
  await page.keyboard.press("Backspace");
  await expect(chip(page)).toHaveText("lead-tex");
  await page.keyboard.press("Escape");
  await expect(chip(page)).toHaveText("title");
  await expect(badge).toHaveText("title");
  await expect(name()).not.toHaveAttribute("contenteditable");
  await expect(chip(page)).toBeFocused();
  await settle();
  expect(await reports()).toEqual([]);
  await expect(work.getByText("Section title", { exact: true })).toBeVisible();

  // Enter commits: the owner hears the valid name.
  await chip(page).dblclick();
  await page.keyboard.type("Lead Text");
  await expect(chip(page)).toHaveText("lead-text");
  await page.keyboard.press("Enter");
  await expect.poll(reports).toHaveLength(1);
  expect((await reports())[0]).toMatchObject({ action: "rename", template: TEMPLATE, node: [0, 0, 0], name: "lead-text", chip: { state: "slot", name: "title" } });
  await expect(chip(page)).toHaveText("lead-text");
  await expect(badge).toHaveText("lead-text");
  await expect(chip(page)).toHaveAttribute("aria-label", "Slot “lead-text”");
  await expect(name()).not.toHaveAttribute("contenteditable");
  if (shots) await page.screenshot({ path: `${shots}/rename-committed.png` });
  await settle();
  expect(await reports()).toHaveLength(1);

  // A name the owner refuses: the old one comes back.
  await chip(page).dblclick();
  await page.keyboard.type("Taken");
  await page.keyboard.press("Enter");
  await expect.poll(reports).toHaveLength(2);
  await expect(chip(page)).toHaveText("lead-text");
  await expect(badge).toHaveText("lead-text");
  await badge.evaluate((el) => el.remove());
  // From the keyboard: F2 renames the focused chip.
  await expect(chip(page)).toBeFocused();
  await page.keyboard.press("F2");
  await expect(name()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chip(page)).toBeFocused();

  // Leaving commits: the items slot renamed, then a click on the page.
  await work.locator("h3:visible", { hasText: "Untitled project" }).click();
  await expect(chip(page)).toHaveText("items ×1");
  await chip(page).dblclick();
  await expect(name()).toBeFocused();
  await page.keyboard.type("Projects ");
  await expect(chip(page)).toHaveText("projects- ×1");
  await work.getByText(LEDE, { exact: true }).click();
  await expect.poll(reports).toHaveLength(3);
  expect((await reports())[2]).toMatchObject({ action: "rename", name: "projects", chip: { state: "items", name: "", slot: [0, 2, 0] } });

  // A fixed part's chip has no name to rename: a double-click does nothing.
  await expect(chip(page)).toHaveText("text");
  await chip(page).dblclick();
  await expect(name()).not.toHaveAttribute("contenteditable");
  await settle();
  expect(await reports()).toHaveLength(3);
});
