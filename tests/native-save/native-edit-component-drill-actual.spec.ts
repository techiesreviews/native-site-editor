import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Drill from a section template into its fallback card, edit shared text,
// and return by its breadcrumb; the preview document stays the same.
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
// ASE_EDIT_MODE_SHOTS=<dir> saves screenshots there.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const canvasBar = (page: Page) => page.locator(".canvas-bar");
const shots = process.env.ASE_EDIT_MODE_SHOTS;
const TEMPLATE = "components/section-work/section-work.html";

// Recent work as a section component: a title slot, and the items slot (the unnamed one) whose fallback is one card-project.
const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
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

/* Slots are display: contents, so the section spaces its parts with a gap. */
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

h2 {
  margin: 0;
}
`;
function homeWithWork(withCards = true) {
  const home = readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/index.html`, "utf8");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  expect(cards).toHaveLength(3);
  const items = withCards ? cards.join("\n      ") : "";
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${items}
    </section-work>${home.slice(end)}`;
}

async function seed(page: Page, baseURL: string | undefined, withCards = true) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, workTemplate], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork(withCards)]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
}

// A mark on the frame's window: still there only if the document was never replaced.
const markFrame = (page: Page) => frame(page).locator("html").evaluate(() => { (window as unknown as { aseMark: string }).aseMark = "slice-47"; });
const frameMark = (page: Page) => frame(page).locator("html").evaluate(() => (window as unknown as { aseMark?: string }).aseMark);

const CARD = "components/card-project/card-project.html";

test("nested card opens in place, edits its template and returns by the breadcrumb", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await markFrame(page);
  const srcdoc = await page.locator(".native-preview-frame").getAttribute("srcdoc");
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  const work = frame(page).locator("section-work");
  await work.getByText("Untitled project", { exact: true }).filter({ visible: true }).click();
  await expect(toolbar(page).getByRole("button", { name: "Open Card project component", exact: true })).toBeVisible();
  await toolbar(page).getByRole("button", { name: "Open Card project component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", CARD);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>›<card-project>");
  await expect.poll(async () => {
    const box = (await frame(page).locator("[data-native-selection-box='edit-frame']").boundingBox())!;
    const card = (await work.locator("card-project").filter({ visible: true }).boundingBox())!;
    return Math.abs(box.y + 4 - card.y) + Math.abs(box.height - 8 - card.height);
  }).toBeLessThan(4);
  const title = work.locator("h3:visible");
  await title.dblclick();
  await expect(title).toHaveAttribute("contenteditable", "plaintext-only");
  await title.fill("Drilled project");
  await title.press("Enter");
  await expect.poll(() => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), CARD)).toContain("Drilled project");
  await expect(work.getByText("Drilled project", { exact: true }).filter({ visible: true })).toBeVisible();
  expect(await frameMark(page)).toBe("slice-47");
  if (shots) await page.screenshot({ path: `${shots}/drilled.png` });
  await canvasBar(page).getByRole("button", { name: "Back to <section-work>", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>");
  await expect(toolbar(page).getByRole("button", { name: "Open Card project component", exact: true })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/back.png` });
  // The same card opens again from its label.
  await toolbar(page).getByRole("button", { name: "Open Card project component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", CARD);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>›<card-project>");
  await canvasBar(page).getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true })).toBeVisible();
  expect(await frameMark(page)).toBe("slice-47");
  expect(await page.locator(".native-preview-frame").getAttribute("srcdoc")).toBe(srcdoc);
});

test("this page's content can't hide the fallback card opened; a deeper level gets placeholders; Esc keeps the chain", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await markFrame(page);
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  const bar = canvasBar(page);
  await frame(page).locator("section-work").getByText("Untitled project", { exact: true }).filter({ visible: true }).click();
  await toolbar(page).getByRole("button", { name: "Open Card project component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", CARD);
  // This page's content would hide the fallback card opened: refused, placeholders stay.
  await bar.getByRole("button", { name: "Show this page's content", exact: true }).click();
  await expect(page.locator("#status")).toContainText("would hide <card-project>");
  await expect(bar.getByRole("button", { name: "Show placeholders", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(frame(page).locator("section-work").getByText("Untitled project", { exact: true }).filter({ visible: true })).toBeVisible();
  // The card's own nested note opens from its label too: its text selected, then the note through the chip before it.
  await frame(page).locator("section-work").getByText("Project", { exact: true }).filter({ visible: true }).click();
  await toolbar(page).getByRole("button", { name: "In the text slot of Card note: select the instance", exact: true }).click();
  await toolbar(page).getByRole("button", { name: "Open Card note component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/card-note/card-note.html");
  await expect(bar.locator(".edit-mode__title")).toHaveText("Editing<section-work>›<card-project>›<card-note>");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  // Placeholders reach the opened level too: what card-project's template puts in the note shows no more, its own fallback does.
  await expect.poll(() => frame(page).locator("section-work").evaluate((work) => {
    const note = work.shadowRoot!.querySelector("card-project")?.shadowRoot?.querySelector("card-note");
    const slot = note?.shadowRoot?.querySelector("slot[name='text']") as HTMLSlotElement | null | undefined;
    return slot ? slot.assignedNodes().length : -1;
  })).toBe(0);
  await frame(page).locator("body").press("Escape");
  await expect(bar.locator(".edit-mode__title")).toHaveText("Editing<section-work>›<card-project>›<card-note>");
  await bar.getByRole("button", { name: "Back to <section-work>", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(toolbar(page).getByRole("button", { name: "Open Card project component", exact: true })).toBeVisible();
  expect(await frameMark(page)).toBe("slice-47");
  await bar.getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
});

test("this page's content can't hide an opened fallback in a section's unfilled slot either", { tag: "@actual" }, async ({ page, baseURL }) => {
  // The page fills only the title: a section component hides its unfilled items slot, and the fallback card with it.
  await seed(page, baseURL, false);
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  const bar = canvasBar(page);
  await frame(page).locator("section-work").getByText("Untitled project", { exact: true }).filter({ visible: true }).click();
  await toolbar(page).getByRole("button", { name: "Open Card project component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", CARD);
  await bar.getByRole("button", { name: "Show this page's content", exact: true }).click();
  await expect(page.locator("#status")).toContainText("would hide <card-project>");
  await expect(bar.getByRole("button", { name: "Show placeholders", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
});
