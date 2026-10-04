import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { storedDraft } from "./drafts";

// Against the real starter (read-only checkout given by ASE_NATIVE_SAVE_FIXTURE;
// the fake GitHub holds every change in memory): the card popover's folder
// chooser, and how editor panels' text fields look (src/ui/inline-field.css).
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE, "Set ASE_NATIVE_SAVE_FIXTURE to the starter checkout.");

const pageErrors: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const shots = ".scratch/inline-paths/starter";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const popover = (page: Page) => page.getByRole("dialog", { name: "New card with its own page" });
const folders = (page: Page) => popover(page).getByRole("listbox", { name: "Folder for the new page" });
const url = (page: Page) => popover(page).locator(".card-add__url");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("card-project").first()).toBeVisible();
}
async function openPopover(page: Page) {
  await frame(page).locator("card-project").last().scrollIntoViewIfNeeded();
  await frame(page).locator("card-project").last().hover();
  await page.locator(".card-ghost__add").click();
  await expect(popover(page).getByRole("textbox", { name: "Page title" })).toBeFocused();
}

for (const scheme of ["light", "dark"] as const) for (const narrow of [false, true]) {
  const name = `${scheme}${narrow ? "-narrow" : ""}`;
  test(`starter popover, folders and new folder (${name})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    if (narrow) await page.setViewportSize({ width: 820, height: 800 });
    await open(page, baseURL);
    await openPopover(page);
    await page.keyboard.type("Oak & Ash");
    await expect(url(page)).toHaveText("URL /work/oak-ash/");
    await page.screenshot({ path: `${shots}/popover-${name}.png` });
    await popover(page).locator(".card-add__path").click();
    await expect(folders(page).getByRole("option").first()).toHaveText("/work/");
    await expect(folders(page).getByRole("option", { name: "/about/" })).toBeVisible();
    await page.screenshot({ path: `${shots}/folders-${name}.png` });
    await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
    await folders(page).getByRole("textbox", { name: "New folder's name" }).fill("chairs");
    await expect(url(page)).toHaveText("URL /work/chairs/oak-ash/");
    await page.screenshot({ path: `${shots}/new-folder-${name}.png` });
  });
}

test("starter: a page in a new folder and its card, then one Undo restores the home page exactly", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPopover(page);
  await page.keyboard.type("Oak");
  await popover(page).locator(".card-add__path").click();
  await folders(page).getByRole("option", { name: "New folder in /work/" }).click();
  await folders(page).getByRole("textbox", { name: "New folder's name" }).fill("chairs");
  await page.keyboard.press("Enter");
  const home = page.locator("#content .view-lines");
  const before = await home.textContent();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Created the page Oak at /work/chairs/oak/");
  await expect(frame(page).locator("card-project")).toHaveCount(4);
  expect((await storedDraft(page, "work/chairs/oak/index.html"))?.content).toContain("Oak");
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  await expect.poll(async () => (await storedDraft(page, "work/chairs/oak/index.html"))?.content).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? before).not.toContain("/work/chairs/oak/");
});

// Every text-like field visible in a panel: its class and the box it draws.
async function audit(page: Page, root: string) {
  return page.locator(root).evaluateAll((roots) => roots.flatMap((rootEl) => [...rootEl.querySelectorAll("input, textarea")]
    .filter((field) => (field as HTMLElement).offsetParent && ["text", "url", "email", "tel", "number", "textarea", ""].includes((field as HTMLInputElement).type ?? ""))
    .map((field) => {
      const style = getComputedStyle(field);
      return { cls: field.className, parent: field.parentElement?.className, border: `${style.borderTopWidth} ${style.borderTopColor}`, background: style.backgroundColor, shadow: style.boxShadow, height: (field as HTMLElement).offsetHeight };
    })));
}

for (const scheme of ["light", "dark"] as const) for (const narrow of [false, true]) {
  const name = `${scheme}${narrow ? "-narrow" : ""}`;
  test(`starter panels' text fields read inline (${name})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    if (narrow) await page.setViewportSize({ width: 820, height: 900 });
    await open(page, baseURL);
    const report: Record<string, unknown> = {};
    // Structure: a component's properties for the selected card.
    await frame(page).locator("card-project h3").first().click();
    await page.waitForTimeout(400);
    report.structure = await audit(page, "#explorer, .page-structure, .component-fields, .component-slot__fields");
    await page.screenshot({ path: `${shots}/panel-structure-${name}.png` });
    // Style panel.
    const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
    if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
    await page.waitForTimeout(400);
    report.style = await audit(page, "[aria-label='Style panel']");
    await page.screenshot({ path: `${shots}/panel-style-${name}.png` });
    // The card's collection settings.
    await page.locator(".selected-collection > summary").click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    report.collection = await audit(page, ".selected-collection");
    await page.screenshot({ path: `${shots}/panel-collection-${name}.png` });
    // A container with a class rule: its property values.
    await page.getByRole("button", { name: "div.cards", exact: true }).click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    for (const section of await page.locator("[aria-label='Style panel'] details.style-panel__section:not([open]) > summary").all()) await section.click({ timeout: 3000 }).catch(() => undefined);
    report.styleValues = await audit(page, "[aria-label='Style panel']");
    await page.screenshot({ path: `${shots}/panel-style-values-${name}.png` });
    // A component's text slot in the Structure tree.
    await page.locator("#explorer, .page-structure").getByText("Content", { exact: true }).first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    report.component = await audit(page, ".page-structure, .component-field, .component-slot__fields, .component-attribute");
    await page.screenshot({ path: `${shots}/panel-component-${name}.png` });
    await page.screenshot({ path: `${shots}/panel-style-${name}.png` });
    // Site settings.
    if (!await page.locator("#explorer").evaluate((el) => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
    await page.getByRole("tab", { name: "Pages", exact: true }).click();
    await page.locator("#page-settings-toggle").click();
    await page.waitForTimeout(400);
    report.pageSettings = await audit(page, ".site-settings");
    await page.screenshot({ path: `${shots}/panel-page-settings-${name}.png` });
    await writeFile(`${shots}/audit-${name}.json`, JSON.stringify(report, null, 2));
    // Every audited field is boxless at rest: no visible border all round.
    for (const fields of Object.values(report) as { border: string; cls: string; parent: string }[][])
      for (const field of fields) expect.soft(/^0px|rgba\(0, 0, 0, 0\)/.test(field.border.split(" ").slice(1).join(" ")) || field.border.startsWith("0px"), `${field.parent} > ${field.cls}: ${field.border}`).toBe(true);
  });
}
