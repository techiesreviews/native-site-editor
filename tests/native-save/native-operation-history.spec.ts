import { expect, test, type Page } from "@playwright/test";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
async function history(page: Page, direction: "undo" | "redo") {
  expect(await page.evaluate(async direction => (await import("/src/components/code-editor.ts")).runVisualHistory(direction, "index.html"), direction)).toBe(true);
}
test("metadata compound history preserves the earlier visual step through Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const original = await source(page);
  await frame(page).locator(".hero h1").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("combobox", { name: "Heading level" }).selectOption("h2");
  await expect(frame(page).locator(".hero h2")).toBeVisible();
  const heading = await source(page);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("Guarded history title");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(settings).toBeHidden();
  await expect.poll(() => source(page)).toContain("Guarded history title");
  const applied = await source(page);
  await history(page, "undo"); await expect.poll(() => source(page)).toBe(heading);
  await history(page, "undo"); await expect.poll(() => source(page)).toBe(original);
  await history(page, "redo"); await expect.poll(() => source(page)).toBe(heading);
  await history(page, "redo"); await expect.poll(() => source(page)).toBe(applied);
});

test("a failed primary save retries after another file clears the storage error", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const result = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const store = (await import("/src/drafts.ts")).draftStore();
    const save = store.save.bind(store);
    let attempts = 0;
    let primary: Parameters<typeof store.save>[0] | undefined;
    store.save = value => {
      const success = save(value);
      if (value.path === "index.html") {
        attempts++;
        primary = value;
        store.error = "Simulated primary quota failure";
        return false;
      }
      return success;
    };
    try {
      const before = editor.getMountedSource("index.html")!;
      editor.replaceActiveRange({ path: "index.html", start: before.indexOf("<h1"), end: before.indexOf("<h1") + 3, expected: "<h1", text: "<h2" });
      // Use the actual mounted file's scope from its saved record.
      if (!primary) throw new Error("Primary draft missing");
      save({ ...primary, path: "quota-other.css", content: "a { color: red }", original: "", baseSha: null });
      store.error = null;
      const initialAttempts = attempts;
      editor.clearHistory();
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      return { initialAttempts, attempts, warned: unload.defaultPrevented };
    } finally { store.save = save; }
  });
  expect(result.attempts).toBeGreaterThan(result.initialAttempts);
  expect(result.warned).toBe(true);
});

test("a synchronous source-save listener cannot replace owned draft metadata", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const before = await source(page);
  await page.evaluate(async () => {
    const store = (await import("/src/drafts.ts")).draftStore();
    const save = store.save.bind(store);
    let replaced = false;
    store.save = value => {
      const success = save(value);
      if (!replaced && value.path === "index.html" && value.content.includes("Collision history title")) {
        replaced = true;
        const foreign = { ...value, baseSha: "foreign-base", mode: "100755", movedFrom: "foreign.html" };
        save(foreign);
        Object.assign(window, { collisionDraft: foreign });
      }
      return success;
    };
  });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Page settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("Collision history title");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(() => source(page)).toBe(before);
  const foreign = await page.evaluate(async () => {
    const store = (await import("/src/drafts.ts")).draftStore();
    const injected = (window as unknown as { collisionDraft: Parameters<typeof store.save>[0] }).collisionDraft;
    const current = store.get(injected, injected.path);
    return { exact: current === injected, baseSha: current?.baseSha, mode: current?.mode, movedFrom: current?.movedFrom, content: current?.content };
  });
  expect(foreign).toEqual({ exact: true, baseSha: "foreign-base", mode: "100755", movedFrom: "foreign.html", content: expect.stringContaining("Collision history title") });
});
