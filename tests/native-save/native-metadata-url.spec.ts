import { expect, test } from "@playwright/test";

for (const dirty of [false, true]) test(`page URL ${dirty ? "refuses changed" : "accepts untouched fallback"} social metadata`, async ({ page, baseURL }) => {
  const path = "notes/first-note/index.html";
  await page.goto(`${baseURL}/#repo=531&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
  const before = await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path)!, path);
  expect(before).not.toContain('property="og:title"');
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  const panel = page.getByRole("dialog", { name: "Page settings", exact: true });
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await expect(panel.getByLabel("Social title", { exact: true })).toHaveValue("The first note");
  if (dirty) {
    await panel.getByLabel("Use page title", { exact: true }).uncheck();
    await panel.getByLabel("Social title", { exact: true }).fill("Unsaved distinct social title");
  }
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  const url = panel.getByRole("textbox", { name: "URL", exact: true });
  await url.fill("/notes/hello/");
  await url.press("Enter");
  if (dirty) {
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Apply page details before changing the URL");
    expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path)).toBe(before);
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  } else {
    await expect(panel).toBeHidden();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/hello/index.html");
    await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
    const after = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("notes/hello/index.html")!);
    expect(after).not.toContain('property="og:title"');
    expect(after).not.toContain('property="og:description"');
  }
});
