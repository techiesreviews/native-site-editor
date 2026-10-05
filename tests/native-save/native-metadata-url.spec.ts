import { openPageSettingsFromPages } from "./settings-entry";
import { expect, test } from "@playwright/test";

for (const dirty of [false, true]) test(`page URL ${dirty ? "refuses changed" : "accepts untouched fallback"} social metadata`, async ({ page, baseURL }) => {
  const path = "notes/first-note/index.html";
  await page.goto(`${baseURL}/#repo=531&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
  const before = await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path)!, path);
  expect(before).not.toContain('property="og:title"');
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
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

for (const roundtrip of [false, true]) test(`applying ${roundtrip ? "round-trip" : "unchanged"} page details preserves every original source byte`, async ({ page, baseURL }) => {
  const path = "notes/first-note/index.html";
  await page.goto(`${baseURL}/#repo=531&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
  const before = await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path)!, path);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const panel = page.getByRole("dialog", { name: "Page settings", exact: true });
  if (roundtrip) {
    await panel.getByLabel("Title", { exact: true }).fill("A temporary title");
    await panel.getByLabel("Title", { exact: true }).fill("The first note");
  }
  await panel.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(panel).toBeHidden();
  const result = await page.evaluate(async path => ({
    source: (await import("/src/components/code-editor.ts")).getMountedSource(path),
    draft: (await import("/src/drafts.ts")).draftStore().get({ account: "native-demo-user", repoId: 531, repo: "native-demo-user/native-conventions", branch: "main" }, path),
  }), path);
  expect(result.source).toBe(before);
  expect(result.draft).toBeUndefined();
});

test("missing linked social tags stay absent when the title changes, but independent social edits create and remove tags", async ({ page, baseURL }) => {
  const path = "notes/first-note/index.html";
  await page.goto(`${baseURL}/#repo=531&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
  const open = async () => {
    await page.locator("#explorer-toggle").click();
    await page.getByRole("tab", { name: "Pages", exact: true }).click();
    await openPageSettingsFromPages(page);
    return page.getByRole("dialog", { name: "Page settings", exact: true });
  };
  const source = () => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path)!, path);
  let panel = await open();
  await panel.getByLabel("Title", { exact: true }).fill("Changed page title");
  await panel.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(panel).toBeHidden();
  expect(await source()).toContain("<title>Changed page title</title>");
  expect(await source()).not.toContain('property="og:title"');
  panel = await open();
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Use page title", { exact: true }).uncheck();
  await panel.getByLabel("Social title", { exact: true }).fill("Independent share title");
  await panel.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(panel).toBeHidden();
  expect(await source()).toContain('property="og:title" content="Independent share title"');
  panel = await open();
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Social title", { exact: true }).fill("");
  await panel.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(panel).toBeHidden();
  expect(await source()).not.toContain('property="og:title"');
});

test("authored linked social tags follow changed page details", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const panel = page.getByRole("dialog", { name: "Page settings", exact: true });
  await panel.getByLabel("Title", { exact: true }).fill("Authored linked title");
  await panel.getByLabel("Description", { exact: true }).fill("Authored linked description");
  await panel.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(panel).toBeHidden();
  const source = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")!);
  expect(source).toContain('property="og:title" content="Authored linked title"');
  expect(source).toContain('property="og:description" content="Authored linked description"');
});

test("unlinking untouched social text preserves its old title and description when page details change", async ({ page, baseURL }) => {
  const path = "notes/first-note/index.html";
  await page.goto(`${baseURL}/#repo=531&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
  // Give this no-OG page an authored description so both independent values
  // must survive a changed primary value, rather than only testing emptiness.
  await page.evaluate(async path => {
    const editor = await import("/src/components/code-editor.ts");
    const source = editor.getMountedSource(path)!;
    const at = source.indexOf("</head>");
    editor.replaceActiveRange({ path, start: at, end: at, expected: "", text: '<meta name="description" content="Original independent description">\n' });
  }, path);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const panel = page.getByRole("dialog", { name: "Page settings", exact: true });
  const originalTitle = await panel.getByLabel("Title", { exact: true }).inputValue();
  const originalDescription = await panel.getByLabel("Description", { exact: true }).inputValue();
  expect(originalDescription).toBe("Original independent description");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Use page title", { exact: true }).uncheck();
  await panel.getByLabel("Use page description", { exact: true }).uncheck();
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("Changed primary title");
  await panel.getByLabel("Description", { exact: true }).fill("Changed primary description");
  await panel.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(panel).toBeHidden();
  const result = await page.evaluate(async path => {
    const source = (await import("/src/components/code-editor.ts")).getMountedSource(path)!;
    return { source, values: (await import("/src/page-builder/site-head.ts")).readHeadSettings(source) };
  }, path);
  expect(result.values.title).toBe("Changed primary title");
  expect(result.values.description).toBe("Changed primary description");
  expect(result.values["og:title"]).toBe(originalTitle);
  expect(result.values["og:description"]).toBe(originalDescription);
  expect(result.source).toContain('property="og:title"');
  expect(result.source).toContain('property="og:description"');
});

test("URL changes refuse an unsaved link preference", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=531&branch=main&file=notes/first-note/index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator("h1")).toHaveText("First note");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const panel = page.getByRole("dialog", { name: "Page settings", exact: true });
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Use page title", { exact: true }).uncheck();
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  const url = panel.getByRole("textbox", { name: "URL", exact: true });
  await url.fill("/notes/unlinked/"); await url.press("Enter");
  await expect(panel).toContainText("Apply page details before changing the URL");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/first-note/index.html");
});
