import { openPageSettingsFromPages } from "./settings-entry";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Page settings › Social: the page source decides whether the share title and
// description follow the page's own. A choice remembered from an earlier
// Apply never hides, or overwrites, a different value written in Code.
const home = readFileSync("fixtures/native-starter/index.html", "utf8");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Page settings", exact: true });
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));

async function load(page: Page, baseURL: string | undefined, source?: string) {
  if (source !== undefined) {
    // The bare URL signs in (the fake GitHub's session cookie); after an earlier
    // load it also reopens that workspace, which may read index.html before the
    // edit lands and still say "Up to date". The app is closed while the branch moves.
    await page.goto(baseURL!);
    await page.goto("about:blank");
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: source } })).status()).toBe(204);
  }
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openSettings(page: Page, tab: "General" | "Social") {
  if (!await page.locator("#explorer").evaluate((el) => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("tab", { name: tab, exact: true }).click();
  return dialog(page);
}
/** Replaces the page in the real Code editor, as a user pasting does. */
async function writeInCode(page: Page, text: string) {
  if (await page.locator("#explorer").evaluate((el) => el.matches(":popover-open"))) await page.keyboard.press("Escape");
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await page.locator('#content [role="textbox"]').first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => mounted(page)).toBe(text);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(text);
}

for (const kind of ["title", "description"] as const) {
  const tag = `og:${kind}`, link = kind === "title" ? "Use page title" : "Use page description";
  const field = kind === "title" ? "Social title" : "Social description", page_ = kind === "title" ? "Title" : "Description";
  const custom = kind === "title" ? "Custom share title" : "Custom share description";
  test(`a share ${kind} written in Code after a linked Apply shows unlinked and survives a page ${kind} change; Undo and Redo are exact`, async ({ page, baseURL, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await load(page, baseURL);
    // Apply once with the share value linked: that choice is remembered for this page.
    let settings = await openSettings(page, "Social");
    await expect(settings.getByLabel(link, { exact: true })).toBeChecked();
    await settings.getByRole("tab", { name: "General", exact: true }).click();
    await settings.getByRole("textbox", { name: "Description", exact: true }).fill("Linked once");
    await settings.getByRole("button", { name: "Apply page settings" }).click();
    await expect(settings).not.toBeVisible();
    // Code gives the page its own, different share value.
    const before = (await mounted(page))!;
    const withCustom = before.replace(new RegExp(`<meta property="${tag}" content="[^"]*">`), `<meta property="${tag}" content="${custom}">`);
    expect(withCustom).not.toBe(before);
    await writeInCode(page, withCustom);
    // Reopened: unlinked, showing the value from Code.
    settings = await openSettings(page, "Social");
    await expect(settings.getByLabel(link, { exact: true })).not.toBeChecked();
    await expect(settings.getByRole("textbox", { name: field, exact: true })).toHaveValue(custom);
    // Only the page's own value changes; the share value from Code stays.
    await settings.getByRole("tab", { name: "General", exact: true }).click();
    await settings.getByRole("textbox", { name: page_, exact: true }).fill(`Reviewer new ${kind}`);
    await settings.getByRole("button", { name: "Apply page settings" }).click();
    await expect(settings).not.toBeVisible();
    const after = (await mounted(page))!;
    expect(after).toContain(`<meta property="${tag}" content="${custom}">`);
    expect(after).toContain(kind === "title" ? "<title>Reviewer new title</title>" : '<meta name="description" content="Reviewer new description">');
    // One Undo back to the Code edit; Redo again.
    await page.locator(".code-editor__undo").first().click();
    await expect.poll(() => mounted(page)).toBe(withCustom);
    await page.locator(".code-editor__redo").first().click();
    await expect.poll(() => mounted(page)).toBe(after);
  });
}

test("missing, equal and empty share values: link state, shown value and the not-set hint", async ({ page, baseURL }) => {
  // Missing: linked, with the hint.
  await load(page, baseURL, home.replace(/\n  <meta property="og:title"[^>]*>/, "").replace(/\n  <meta property="og:description"[^>]*>/, ""));
  let settings = await openSettings(page, "Social");
  await expect(settings.getByLabel("Use page title", { exact: true })).toBeChecked();
  await expect(settings.getByLabel("Use page description", { exact: true })).toBeChecked();
  await expect(settings).toContainText("Not set, uses page title.");
  await expect(settings).toContainText("Not set, uses page description.");
  await expect(settings.getByRole("textbox", { name: "Social title", exact: true })).toHaveValue("Native Studio");
  await page.keyboard.press("Escape");
  // Equal to the page's own: linked, no hint (the fixture as it is).
  await load(page, baseURL, home);
  settings = await openSettings(page, "Social");
  await expect(settings.getByLabel("Use page title", { exact: true })).toBeChecked();
  await expect(settings).not.toContainText("Not set, uses page title.");
  await page.keyboard.press("Escape");
  // Present but empty, unlike the page title: unlinked and shown empty, not the page title.
  await load(page, baseURL, home.replace('<meta property="og:title" content="Native Studio">', '<meta property="og:title" content="">'));
  settings = await openSettings(page, "Social");
  await expect(settings.getByLabel("Use page title", { exact: true })).not.toBeChecked();
  await expect(settings.getByRole("textbox", { name: "Social title", exact: true })).toHaveValue("");
  await expect(settings).not.toContainText("Not set, uses page title.");
  // Choosing the link explicitly replaces it with the page title.
  await settings.getByLabel("Use page title", { exact: true }).check();
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(settings).not.toBeVisible();
  await expect.poll(() => mounted(page)).toContain('<meta property="og:title" content="Native Studio">');
});
