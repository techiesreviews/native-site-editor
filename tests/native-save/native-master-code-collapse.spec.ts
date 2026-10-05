import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { effectiveSource } from "./drafts";

test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Requires the native static starter.");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();
const MASTER = ".editor/sections/intro.html", JSON_PATH = ".editor/page-builder.json";
const grip = (page: Page) => page.getByRole("separator", { name: "Resize code pane", exact: true });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
async function openMaster(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await frame(page).locator("main > section h2").first().click();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add to the page" });
  await add.getByRole("option", { name: /^Intro HTML$/ }).focus();
  await page.keyboard.press("Enter");
  await add.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("treeitem", { name: /^(Section|Intro) Section heading/ }).locator(".page-structure__label").first().click();
  await bar(page).getByRole("button", { name: "Edit Intro component", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved section master" })).toBeVisible();
}
async function collapse(page: Page, testInfo: Parameters<Parameters<typeof test>[1]>[1]) {
  await grip(page).focus();
  await page.keyboard.press("Home");
  await expect(grip(page)).toHaveAttribute("aria-valuetext", "Code hidden");
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(frame(page).locator("section.section-intro")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("master-code-hidden.png") });
  const state = await page.evaluate(async () => ({
    code: localStorage.getItem("astro-editor.code-height"),
    masterSource: (await import("/src/components/code-editor.ts")).getMountedSource(".editor/sections/intro.html"),
    banner: [...document.querySelectorAll(".master-banner")].map(element => ({ text: element.textContent, ancestors: [...(function* () { for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) yield ancestor; })()].map(ancestor => ({ id: ancestor.id, className: ancestor.className, inert: ancestor.inert, ariaHidden: ancestor.getAttribute("aria-hidden"), display: getComputedStyle(ancestor).display })) })),
    barButtons: [...document.querySelectorAll(".edit-bar button")].map(button => button.textContent),
  }));
  await testInfo.attach("collapsed-master-state", { body: JSON.stringify(state, null, 2), contentType: "application/json" });
}

test("Done remains reachable after a person hides Code while editing a master, and preserves their collapsed state", async ({ page, baseURL }, testInfo) => {
  await openMaster(page, baseURL);
  const master = await effectiveSource(page, baseURL, MASTER), home = await effectiveSource(page, baseURL, "index.html"), json = await effectiveSource(page, baseURL, JSON_PATH);
  await collapse(page, testInfo);
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(master);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  expect(await effectiveSource(page, baseURL, JSON_PATH)).toBe(json);
  const done = page.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeVisible({ timeout: 3000 });
  await done.click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(grip(page)).toHaveAttribute("aria-valuetext", "Code hidden");
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "0");
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(master);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  expect(await effectiveSource(page, baseURL, JSON_PATH)).toBe(json);
});

test("Update copies remains reachable with Code hidden and updates only linked copies as one Undo and Redo", async ({ page, baseURL }, testInfo) => {
  await openMaster(page, baseURL);
  await frame(page).locator("section.section-intro h2").click();
  const beforeMaster = await effectiveSource(page, baseURL, MASTER), home = await effectiveSource(page, baseURL, "index.html"), json = await effectiveSource(page, baseURL, JSON_PATH);
  await bar(page).getByRole("combobox", { name: "Heading level", exact: true }).selectOption("h3");
  const editedMaster = beforeMaster.replace(/<h2/g, "<h3").replace(/<\/h2>/g, "</h3>");
  await expect.poll(() => effectiveSource(page, baseURL, MASTER)).toBe(editedMaster);
  await collapse(page, testInfo);
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  const update = page.getByRole("button", { name: "Update copies", exact: true });
  await expect(update).toBeVisible({ timeout: 3000 });
  await update.click();
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).not.toBe(home);
  const updatedHome = await effectiveSource(page, baseURL, "index.html"), updatedJson = await effectiveSource(page, baseURL, JSON_PATH);
  expect(updatedHome).toContain("<h3");
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(editedMaster);
  await grip(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(home);
  expect(await effectiveSource(page, baseURL, JSON_PATH)).toBe(json);
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(editedMaster);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => effectiveSource(page, baseURL, "index.html")).toBe(updatedHome);
  expect(await effectiveSource(page, baseURL, JSON_PATH)).toBe(updatedJson);
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "0");
});
