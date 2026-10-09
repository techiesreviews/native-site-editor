import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Edit component mode, in place (build slice 41): the starter's Recent work
// made a section component, opened from its edit bar. The instance shows its
// template where it sits, framed, the page shaded; placeholders always show.
// Done leaves. The preview's document is never replaced.
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
function homeWithWork() {
  const home = readFileSync(`${process.env.ASE_NATIVE_SAVE_FIXTURE}/index.html`, "utf8");
  const start = home.indexOf(`<section class="flow" id="work">`);
  const end = home.indexOf("</section>", start) + "</section>".length;
  expect(start).toBeGreaterThan(0);
  const cards = home.slice(start, end).match(/<card-project>[\s\S]*?<\/card-project>/g)!;
  expect(cards).toHaveLength(3);
  const items = cards.join("\n      ");
  return `${home.slice(0, start)}<section-work id="work">
      <h2 slot="title">Recent work</h2>
      ${items}
    </section-work>${home.slice(end)}`;
}

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [[TEMPLATE, workTemplate], ["components/section-work/section-work.css", workCss], ["index.html", homeWithWork()]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator("section-work h2:visible").first()).toHaveText("Recent work", { timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
}

// A mark on the frame's window: still there only if the document was never replaced.
const markFrame = (page: Page) => frame(page).locator("html").evaluate(() => { (window as unknown as { aseMark: string }).aseMark = "slice-41"; });
const frameMark = (page: Page) => frame(page).locator("html").evaluate(() => (window as unknown as { aseMark?: string }).aseMark);

test("Edit component opens Recent work in place: placeholders, template edit, Done, with no preview reload", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await markFrame(page);
  const loads = await page.locator(".native-preview-frame").getAttribute("srcdoc");

  // Select the instance through Structure, then Edit component on its edit bar.
  await page.getByRole("treeitem", { name: /^Section work/ }).first().locator(".page-structure__label").click();
  await toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);

  // The slim bar.
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>");
  await expect(canvasBar(page).getByRole("button", { name: /^used on 1 page/ })).toBeVisible();
  await expect(canvasBar(page).locator(".canvas-crumbs")).toBeHidden();

  // Placeholders: the template's fallbacks show, not the page's cards; the frame and the shade are drawn.
  const work = frame(page).locator("section-work");
  // The fallback card (each page card has its own fallback title too, hidden under the page's).
  const fallbackCard = work.locator("h3:visible", { hasText: "Untitled project" });
  await expect(work.getByText("Section title", { exact: true })).toBeVisible();
  await expect(fallbackCard).toHaveCount(1);
  await expect(work.getByText("Fern & Kettle", { exact: true })).toBeHidden();
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  await expect(frame(page).locator("[data-native-selection-box='edit-shade']:visible")).not.toHaveCount(0);
  // The template's own slots keep their names (the component's CSS can name them).
  expect(await work.evaluate((host) => [...host.shadowRoot!.querySelectorAll("slot")].map((slot) => slot.name))).toEqual(["title", ""]);
  // In view, below the site's sticky header.
  await expect.poll(async () => {
    const header = (await frame(page).locator("site-header").boundingBox())!;
    const shown = (await work.getByText("Section title", { exact: true }).boundingBox())!;
    const area = (await page.locator(".native-preview-frame").boundingBox())!;
    return shown.y >= header.y + header.height && shown.y + shown.height <= area.y + area.height;
  }).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/placeholders.png` });

  // An edit of the template shows in place at once, the mode and the frame's document unchanged.
  const template = await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), TEMPLATE);
  const at = template!.indexOf("Section title");
  await page.evaluate(async ({ path, at }) => {
    (await import("/src/components/code-editor.ts")).replaceActiveRange({ path, start: at, end: at + "Section title".length, text: "Selected projects", expected: "Section title" });
  }, { path: TEMPLATE, at });
  await expect(work.getByText("Selected projects", { exact: true })).toBeVisible();
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>");
  await expect(fallbackCard).toHaveCount(1);
  expect(await frameMark(page)).toBe("slice-41");

  // A click inside the frame selects the template's part; one on the shaded page selects nothing.
  await work.getByText("Selected projects", { exact: true }).click();
  await expect(toolbar(page)).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect.poll(() => page.evaluate(() => document.querySelector(".edit-bar__label")?.textContent ?? "")).toContain("Heading");
  const framed = (await frame(page).locator("[data-native-selection-box='edit-frame']").boundingBox())!;
  const canvas = (await page.locator(".native-preview-frame").boundingBox())!;
  expect(framed.y + framed.height + 40).toBeLessThan(canvas.y + canvas.height);
  await page.mouse.click(framed.x + 40, framed.y + framed.height + 30);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(page.locator(".edit-bar__label")).toContainText("Heading");

  // Done only leaves: the page again, the instance selected, its content shown.
  await canvasBar(page).getByRole("button", { name: "Done editing component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveCount(0);
  await expect(frame(page).locator("[data-native-selection-box='edit-shade']:visible")).toHaveCount(0);
  await expect(work.getByText("Fern & Kettle", { exact: true })).toBeVisible();
  await expect(fallbackCard).toHaveCount(0);
  await expect(toolbar(page).getByRole("button", { name: "Edit Section work component", exact: true })).toBeVisible();

  // The same document all along: no preview reload.
  expect(await frameMark(page)).toBe("slice-41");
  expect(await page.locator(".native-preview-frame").getAttribute("srcdoc")).toBe(loads);
});

test("Structure's Edit component opens the mode on that row's instance; a page row leaves it", { tag: "@actual" }, async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await markFrame(page);
  const row = page.getByRole("treeitem", { name: /^Section work/ }).first();
  await row.hover();
  await row.getByRole("button", { name: "Edit component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", TEMPLATE);
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveText("Editing<section-work>");
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeVisible();
  // The edited instance is the one on that row, not just any section-work.
  await expect.poll(async () => {
    const framed = (await frame(page).locator("[data-native-selection-box='edit-frame']").boundingBox())!;
    const host = (await frame(page).locator("section-work").boundingBox())!;
    return Math.abs(framed.y + 4 - host.y);
  }).toBeLessThan(2);

  // Selecting a page element (here through Structure) opens the page, which ends the mode.
  await page.getByRole("treeitem", { name: /^Section contact/ }).first().locator(".page-structure__label").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(canvasBar(page).locator(".edit-mode__title")).toHaveCount(0);
  await expect(frame(page).locator("[data-native-selection-box='edit-frame']")).toBeHidden();
  await expect(frame(page).locator("section-work").getByText("Fern & Kettle", { exact: true })).toBeVisible();
  expect(await frameMark(page)).toBe("slice-41");
});
