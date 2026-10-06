import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const text = before.replace(/(<main[^>]*>)[\s\S]*?<\/main>/, '$1\n<video controls width="320" height="180" src="/media/old.mp4" title="Original video"></video>\n<iframe src="about:blank" title="Original embed" width="320" height="180"></iframe>\n<form action="/send"><p>Existing form</p><input name="original" aria-label="Original input"><button type="submit">Send</button></form>\n</main>');
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text });
  });
  await expect(frame(page).locator("video")).toBeVisible();
});

test("existing video attributes preserve native HTML and one Undo restores a field edit", async ({ page }) => {
  const before = await source(page);
  await frame(page).locator("video").click({ position: { x: 5, y: 5 } });
  await bar(page).getByRole("button", { name: "Video URL", exact: true }).click();
  await page.getByRole("textbox", { name: "Video URL", exact: true }).fill("/media/new.mp4?a=1&b=2");
  await expect.poll(() => source(page)).toContain('src="/media/new.mp4?a=1&amp;b=2" title="Original video"');
  await page.keyboard.press("Escape");
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(before);
  await expect(frame(page).locator("video")).toHaveAttribute("src", "/media/old.mp4");
});

test("form method and input name use native fields without changing other attributes", async ({ page }) => {
  await frame(page).locator("form p").click();
  const tree = page.getByRole("tree", { name: "Page structure" });
  const form = tree.getByRole("treeitem", { name: "Form", exact: true });
  await form.click();
  await bar(page).getByRole("combobox", { name: "Method", exact: true }).selectOption("post");
  await expect.poll(() => source(page)).toContain('<form action="/send" method="post">');
  if (await form.getAttribute("aria-expanded") !== "true") { await form.focus(); await page.keyboard.press("ArrowRight"); }
  await tree.getByRole("treeitem", { name: /^input/ }).click();
  await bar(page).getByRole("button", { name: "Name", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.fill("new");
  await name.pressSequentially("-field");
  await expect.poll(() => source(page)).toContain('<input name="new-field" aria-label="Original input">');
  await page.keyboard.press("Escape");
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toContain('<input name="original" aria-label="Original input">');
  await expect.poll(() => source(page)).toContain('<form action="/send" method="post">');
});

test("a detached native field refuses an agent source replacement", async ({ page }) => {
  await frame(page).locator("video").click({ position: { x: 5, y: 5 } });
  await bar(page).getByRole("button", { name: "Title", exact: true }).click();
  const field = page.getByRole("textbox", { name: "Title", exact: true });
  await field.evaluate(element => Object.assign(window, { detachedNativeField: element }));
  const changed = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const next = `<!-- agent changed source -->\n${before}`;
    editor.replaceActiveRange({ path: "index.html", start: 0, end: before.length, expected: before, text: next });
    return next;
  });
  await page.evaluate(() => {
    const field = (window as unknown as { detachedNativeField: HTMLInputElement }).detachedNativeField;
    field.value = "Must not land";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await source(page)).toBe(changed);
  await expect(page.locator("#status")).toContainText("source or selection changed");
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Title", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Fresh retry");
  await expect.poll(() => source(page)).toContain('title="Fresh retry"');
  expect(await source(page)).toContain("<!-- agent changed source -->");
});


test("existing embeds expose native title and safe URL fields", async ({ page }) => {
  await page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: "iframe", exact: true }).click();
  await bar(page).getByRole("button", { name: "Title", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("A clear embed title");
  await page.keyboard.press("Escape");
  await expect.poll(() => source(page)).toContain('src="about:blank" title="A clear embed title"');
  await bar(page).getByRole("button", { name: "Embed URL", exact: true }).click();
  const before = await source(page);
  await page.getByRole("textbox", { name: "Embed URL", exact: true }).fill("javascript:alert(1)");
  await expect(page.locator("#status")).toContainText("URL");
  expect(await source(page)).toBe(before);
});

test("images use Choose image and Alt while real hyperlinks retain Address", async ({ page }) => {
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource("index.html")!;
    const start = before.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start, end: start, expected: "", text: '<img src="/images/studio-desk.svg" alt="Studio desk"><a href="/about/">Real hyperlink</a>\n' });
  });
  await frame(page).locator('img[alt="Studio desk"]').click();
  await expect(bar(page).getByRole("button", { name: "Choose image…", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Alt text", exact: true })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Address", exact: true })).toHaveCount(0);
  await frame(page).getByRole("link", { name: "Real hyperlink", exact: true }).click();
  await expect(bar(page).getByRole("button", { name: "Address", exact: true })).toBeVisible();
});
