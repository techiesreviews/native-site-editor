import { expect, test, type Page } from "@playwright/test";
import { openPageSettingsFromPages } from "./settings-entry";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
async function history(page: Page, direction: "undo" | "redo") {
  const accepted = await page.evaluate(async direction => (await import("/src/components/code-editor.ts")).runVisualHistory(direction, "index.html"), direction);
  expect(accepted, await page.locator("#status").textContent() ?? "history status").toBe(true);
}
test("metadata compound history survives page remounts and preserves the earlier visual step through Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const original = await source(page);
  await frame(page).locator(".hero h1").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("combobox", { name: "Heading level" }).selectOption("h2");
  await expect(frame(page).locator(".hero h2")).toBeVisible();
  const heading = await source(page);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("Guarded history title");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(settings).toBeHidden();
  await expect.poll(() => source(page)).toContain("Guarded history title");
  const applied = await source(page);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator('#explorer [role="treeitem"][data-route="/about/"]').click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator('#explorer [role="treeitem"][data-route="/"]').click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect.poll(() => source(page)).toBe(applied);
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
  await openPageSettingsFromPages(page);
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

test("clearing a compound journal releases its retained clean Monaco model", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const store = (await import("/src/drafts.ts")).draftStore();
    const save = store.save.bind(store);
    let scope: Parameters<typeof store.save>[0] | undefined;
    store.save = draft => { scope = draft; return save(draft); };
    try {
      const source = editor.getMountedSource("index.html")!;
      const receipt = editor.prepareHistorySources([{ path: "index.html", expectedSource: source, text: `<!-- owned clean model -->\n${source}` }], true)!;
      if (!receipt.apply() || !scope || !editor.recordHistoryAction("index.html", receipt.undo, receipt.redo, receipt.dispose)) throw new Error("Could not prepare owned history");
      if (!await editor.runVisualHistory("undo", "index.html")) throw new Error("Could not undo owned history");
      Object.assign(window, { retainedModelProof: editor.captureFileModelState(scope, "index.html", true) });
    } finally { store.save = save; }
  });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator('#explorer [role="treeitem"][data-route="/about/"]').click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  const result = await page.evaluate(async () => {
    const proof = (window as unknown as { retainedModelProof: { isCurrent(): boolean } }).retainedModelProof;
    const retained = proof.isCurrent();
    (await import("/src/components/code-editor.ts")).clearHistory();
    return { retained, released: !proof.isCurrent() };
  });
  expect(result).toEqual({ retained: true, released: true });
});

test("new page and navigation cross their original history anchor through two Undo and Redo steps", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const original = await source(page);
  await frame(page).locator(".hero h1").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("combobox", { name: "Heading level" }).selectOption("h2");
  await expect(frame(page).locator(".hero h2")).toBeVisible();
  const heading = await source(page);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  const title = page.getByRole("textbox", { name: "New page title", exact: true });
  await title.fill("Services");
  await page.getByLabel("Add to navigation", { exact: true }).check();
  await title.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "services/index.html");
  await expect(page.locator("#status")).toContainText("Created Services and added it to navigation as drafts.");
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "services/index.html"))).toBe(true);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect.poll(() => source(page)).toBe(heading);
  await history(page, "undo"); await expect.poll(() => source(page)).toBe(original);
  await history(page, "redo"); await expect.poll(() => source(page)).toBe(heading);
  await history(page, "redo");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "services/index.html");
  await expect(frame(page).locator("site-header nav a[href='/services/']")).toHaveText("Services");
});

test("a visual edit on a created page restores its owned draft identity before create Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  const title = page.getByRole("textbox", { name: "New page title", exact: true });
  await title.fill("Visual chain");
  await title.press("Enter");
  const path = "visual-chain/index.html";
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.locator("#status")).toContainText("Created");
  const created = await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
  await page.evaluate(async path => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource(path)!;
    const start = text.indexOf("</main>");
    editor.replaceActiveRange({ path, start, end: start, expected: "", text: "<h1>Owned visual heading</h1>\n" });
  }, path);
  await expect(frame(page).locator("main h1")).toHaveText("Owned visual heading");
  const edited = await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
  const step = async (direction: "undo" | "redo", active: string) => {
    expect(await page.evaluate(async ({ direction, active }) => (await import("/src/components/code-editor.ts")).runVisualHistory(direction, active), { direction, active })).toBe(true);
  };
  await step("undo", path);
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path)).toBe(created);
  await step("undo", path);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await step("redo", "index.html");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.locator("#status")).toContainText("Created");
  await step("redo", path);
  expect(await page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path)).toBe(edited);
  await expect(frame(page).locator("main h1")).toHaveText("Owned visual heading");
});

test("an external draft replacement during awaited visual Undo is preserved and refused", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await frame(page).locator(".hero h1").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("combobox", { name: "Heading level" }).selectOption("h2");
  await expect(frame(page).locator(".hero h2")).toBeVisible();
  const result = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const { monaco } = await import("/src/components/monaco.ts");
    const store = (await import("/src/drafts.ts")).draftStore();
    const record = store.get({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" }, "index.html")!;
    const model = monaco.editor.getModels().find(value => value.getValue() === editor.getMountedSource("index.html"))!;
    const undo = model.undo.bind(model);
    let foreign: typeof record;
    model.undo = () => Promise.resolve(undo()).then(() => {
      foreign = { ...record, content: "Foreign replacement bytes", baseSha: "foreign-base", mode: "100755" };
      store.save(foreign);
    });
    try {
      const accepted = await editor.runVisualHistory("undo", "index.html");
      const current = store.get(record, record.path);
      return { accepted, exact: current === foreign!, content: current?.content, baseSha: current?.baseSha, mode: current?.mode };
    } finally { model.undo = undo; }
  });
  expect(result).toEqual({ accepted: false, exact: true, content: "Foreign replacement bytes", baseSha: "foreign-base", mode: "100755" });
});

test("Files rename retains an open stylesheet's owned model through Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  const original = await source(page);
  const stylesheet = (path: string) => page.evaluate(async path => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
  const originalStylesheet = await stylesheet("styles/site.css");
  expect(originalStylesheet).toContain(".hero");
  expect(original).toContain('href="/styles/site.css"');
  const renamedPage = original!.replace('href="/styles/site.css"', 'href="/styles/layout.css"');
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  const explorer = page.locator("#explorer");
  const folder = explorer.getByRole("button", { name: "styles", exact: true });
  if (await folder.getAttribute("aria-expanded") !== "true") await folder.click();
  await explorer.getByRole("button", { name: "site.css", exact: true }).focus();
  await page.keyboard.press("F2");
  const name = explorer.getByRole("textbox", { name: "New name for styles/site.css", exact: true });
  await name.fill("layout.css");
  await name.press("Enter");
  await expect(page.locator("#status")).toContainText("Renamed styles/site.css to styles/layout.css");
  await expect.poll(() => source(page)).toBe(renamedPage);
  await expect(page.locator("#secondary-title")).toHaveText("styles/layout.css");
  await expect.poll(() => stylesheet("styles/layout.css")).toBe(originalStylesheet);
  await history(page, "undo");
  await expect.poll(() => source(page)).toBe(original);
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  await expect.poll(() => stylesheet("styles/site.css")).toBe(originalStylesheet);
  await expect(page.locator("#status")).toContainText("Undid renaming styles/site.css");
  await history(page, "redo");
  await expect.poll(() => source(page)).toBe(renamedPage);
  await expect(page.locator("#secondary-title")).toHaveText("styles/layout.css");
  await expect.poll(() => stylesheet("styles/layout.css")).toBe(originalStylesheet);
  const moved = await page.evaluate(async () => (await import("/src/drafts.ts")).draftStore().get({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" }, "styles/layout.css"));
  expect(moved?.movedFrom).toBe("styles/site.css");
  expect(moved?.content).toBe(originalStylesheet);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
});

test("deferred create Undo preserves a newer save outcome instead of announcing early success", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  const title = page.getByRole("textbox", { name: "New page title", exact: true });
  await title.fill("Status ownership");
  await title.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "status-ownership/index.html");
  await expect(page.locator("#status")).toContainText("Created");
  const result = await page.evaluate(async () => {
    const status = document.getElementById("status")!;
    const before = status.textContent;
    const accepted = await (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "status-ownership/index.html");
    const immediate = status.textContent;
    status.textContent = "Selected files saved to GitHub.";
    return { accepted, before, immediate };
  });
  expect(result.accepted).toBe(true);
  expect(result.immediate).toBe(result.before);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await expect(page.locator("#status")).toHaveText("Selected files saved to GitHub.");
});


test("ordinary canvas edits persist while a history refresh is held", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    Object.assign(window, { releaseNativeHold: editor.holdHistoryRefresh("index.html") });
  });
  await frame(page).locator(".hero h1").click();
  await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("combobox", { name: "Heading level" }).selectOption("h2");
  await expect(frame(page).locator(".hero h2")).toBeVisible();
  const stored = await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const record = (await import("/src/drafts.ts")).draftStore().get({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" }, "index.html");
    (window as unknown as { releaseNativeHold(): void }).releaseNativeHold();
    return { text: record?.content, model: editor.getMountedSource("index.html") };
  });
  expect(stored.text).toBe(stored.model);
  expect(stored.text).toContain("<h2");
  await page.reload();
  await expect(frame(page).locator(".hero h2")).toBeVisible();
});

test("an image can be renamed twice and deleted through guarded Undo and Redo", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  const explorer = page.locator("#explorer");
  const folder = explorer.getByRole("button", { name: "images", exact: true });
  if (await folder.getAttribute("aria-expanded") !== "true") await folder.click();
  for (const [from, to] of [["studio-desk.svg", "desk-one.svg"], ["desk-one.svg", "desk-two.svg"]]) {
    await explorer.getByRole("button", { name: from, exact: true }).focus();
    await page.keyboard.press("F2");
    const name = explorer.getByRole("textbox", { name: `New name for images/${from}`, exact: true });
    await name.fill(to); await name.press("Enter");
    await expect(page.locator("#status")).toContainText(`Renamed images/${from} to images/${to}`);
  }
  await history(page, "undo");
  await expect(page.locator("#status")).toContainText("Undid renaming images/desk-one.svg");
  await history(page, "redo");
  await expect(page.locator("#status")).toContainText("Renamed images/desk-one.svg to images/desk-two.svg");
  await explorer.getByRole("button", { name: "desk-two.svg", exact: true }).focus();
  await page.keyboard.press("Delete");
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Deleted");
  await history(page, "undo"); await expect(page.locator("#status")).toContainText("Undid");
  await history(page, "redo"); await expect(page.locator("#status")).toContainText("Deleted");
  const records = await page.evaluate(async () => {
    const store = (await import("/src/drafts.ts")).draftStore();
    const scope = { account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" };
    return [store.get(scope, "images/studio-desk.svg"), store.get(scope, "images/desk-two.svg")];
  });
  expect(records[0]?.deleted).toBe(true);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
});

for (const action of ["rename", "delete"] as const) test(`an opaque binary draft supports Files ${action} Undo and Redo`, async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await page.evaluate(async () => {
    const store = (await import("/src/drafts.ts")).draftStore();
    store.save({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main", version: 1,
      path: "images/binary.png", baseSha: null, original: "", content: "", sourceSha: "a".repeat(40), opaque: true,
      upload: { size: 68, type: "image/png" }, updatedAt: Date.now() });
    await store.flush();
  });
  // Load the seeded opaque draft through the same startup tree as a returning browser.
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  const readDraft = (path: string) => page.evaluate(async path => (await import("/src/drafts.ts")).draftStore().get({ account: "native-demo-user", repoId: 501, repo: "native-demo-user/native-demo", branch: "main" }, path), path);
  const originalRecord = await readDraft("images/binary.png");
  expect(originalRecord?.opaque).toBe(true);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  const explorer = page.locator("#explorer");
  const folder = explorer.getByRole("button", { name: "images", exact: true });
  if (await folder.getAttribute("aria-expanded") !== "true") await folder.click();
  await explorer.locator('.file-row[data-path="images/binary.png"]').focus();
  if (action === "rename") {
    await page.keyboard.press("F2");
    const name = explorer.getByRole("textbox", { name: "New name for images/binary.png", exact: true });
    await name.fill("renamed.png"); await name.press("Enter");
    await expect(page.locator("#status")).toContainText("Renamed images/binary.png to images/renamed.png");
  } else {
    await page.keyboard.press("Delete");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator("#status")).toContainText("Deleted");
  }
  await history(page, "undo"); await expect(page.locator("#status")).toContainText("Undid");
  expect(await readDraft("images/binary.png")).toEqual(originalRecord);
  expect(await readDraft("images/renamed.png")).toBeUndefined();
  await history(page, "redo"); await expect(page.locator("#status")).toContainText(action === "rename" ? "Renamed" : "Deleted");
  expect(await readDraft("images/binary.png")).toBeUndefined();
  if (action === "rename") {
    const renamed = await readDraft("images/renamed.png");
    expect(renamed?.opaque).toBe(true);
    expect(renamed?.sourceSha).toBe(originalRecord?.sourceSha);
    expect(renamed?.upload).toEqual(originalRecord?.upload);
  }
  await expect(frame(page).locator(".hero h1")).toBeVisible();
});
