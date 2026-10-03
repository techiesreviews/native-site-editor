import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

async function mount(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.evaluate(async () => {
    const { mountMediaLibrary } = await import("/src/page-builder/media-picker.ts");
    const host = document.createElement("div"); host.id = "media-pane-harness";
    host.style.cssText = "position:fixed;right:0;top:60px;width:440px;height:calc(100vh - 60px);z-index:100;background:var(--surface)";
    document.body.append(host);
    const view = mountMediaLibrary(host); await view.ready;
    Object.assign(window, { mediaPaneHarness: { view, host, remount: async () => {
      view.dispose(); const next = mountMediaLibrary(host); await next.ready;
      (window as unknown as { mediaPaneHarness: { view: typeof next } }).mediaPaneHarness.view = next;
    } } });
  });
}
const pane = (page: Page) => page.getByRole("region", { name: "Images", exact: true });

test("persistent pane searches, filters, shows details and retains drafts through hiding and remount", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  const panel = pane(page);
  await expect(page.locator("dialog.media-library")).toHaveCount(0);
  await panel.getByLabel("Search images", { exact: true }).fill("studio-desk");
  await expect(panel.locator(".media-library__card")).toHaveCount(1);
  await panel.getByLabel("Folder", { exact: true }).selectOption("images");
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await expect(panel.getByRole("heading", { name: /Used on \d+ pages/ })).toBeVisible();
  await panel.getByLabel("Default alt text", { exact: true }).fill("Persistent studio");
  await panel.getByLabel("Image tags", { exact: true }).fill("pane-tag");
  await panel.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Persistent studio");
  await page.evaluate(() => { document.querySelector<HTMLElement>("#media-pane-harness")!.hidden = true; });
  await expect(panel).not.toBeVisible();
  await page.evaluate(() => { document.querySelector<HTMLElement>("#media-pane-harness")!.hidden = false; });
  await expect(panel.getByLabel("Default alt text", { exact: true })).toHaveValue("Persistent studio");
  await page.evaluate(async () => { await (window as unknown as { mediaPaneHarness: { remount(): Promise<void> } }).mediaPaneHarness.remount(); });
  await panel.getByRole("button", { name: "pane-tag", exact: true }).click();
  await expect(panel.locator(".media-library__card")).toHaveCount(1);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await expect(panel.getByLabel("Default alt text", { exact: true })).toHaveValue("Persistent studio");
});

test("pane rename uses real atomic drafts and Undo restores references", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  const source = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") as string);
  const before = await source(); const panel = pane(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByLabel("New image filename", { exact: true }).fill("pane-desk.svg");
  await panel.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Details for images/pane-desk.svg", exact: true })).toBeVisible();
  await expect.poll(source).toEqual(before.replaceAll("studio-desk.svg", "pane-desk.svg"));
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(source).toEqual(before);
  await page.evaluate(async () => { await (window as unknown as { mediaPaneHarness: { view: { refresh(): Promise<void> } } }).mediaPaneHarness.view.refresh(); });
  await expect(panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
  await expect.poll(() => storedDraft(page, "images/pane-desk.svg")).toBeUndefined();
});

test("adapter replacement invalidates old pane and disposal blocks late loads", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  const result = await page.evaluate(async () => {
    const { configureMediaPicker, mountMediaLibrary } = await import("/src/page-builder/media-picker.ts");
    const host = document.querySelector<HTMLElement>("#media-pane-harness")!;
    let release!: (value: import("../../src/page-builder/media-picker").MediaLibrary) => void;
    let mutations = 0;
    const adapter: import("../../src/page-builder/media-picker").MediaPickerHost = {
      load: () => new Promise(resolve => { release = resolve; }), blob: async () => new Blob(),
      metadata: async () => { mutations++; }, upload: async () => "", rename: async () => { mutations++; },
      remove: async () => { mutations++; }, rewrite: async () => {}, openPage: async () => {},
    };
    configureMediaPicker(adapter);
    const oldRemoved = host.childElementCount === 0;
    const view = mountMediaLibrary(host); view.dispose();
    release({ key: "late", items: [], metadata: {}, usage: {} }); await view.ready;
    await view.refresh();
    return { oldRemoved, children: host.childElementCount, mutations };
  });
  expect(result).toEqual({ oldRemoved: true, children: 0, mutations: 0 });
});

test("disposing a pane aborts pending optimisation and revokes its preview URLs", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => {
    const revoked: string[] = []; const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { revoked.push(url); original(url); };
    Object.assign(window, { mediaPaneRevoked: revoked });
  });
  let release: (() => void) | undefined;
  await page.route("**/src/page-builder/image-optimise.worker.ts*", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.continue().catch(() => undefined);
  });
  const panel = pane(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  await panel.getByRole("button", { name: "Optimise image…", exact: true }).click();
  await panel.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.evaluate(() => { (window as unknown as { mediaPaneHarness: { view: { dispose(): void } } }).mediaPaneHarness.view.dispose(); });
  release!();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { mediaPaneRevoked: string[] }).mediaPaneRevoked.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("refresh after real metadata Undo restores detail fields and cannot save undone values", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  const panel = pane(page);
  await panel.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  const alt = panel.getByLabel("Default alt text", { exact: true });
  const tags = panel.getByLabel("Image tags", { exact: true });
  const originalAlt = await alt.inputValue();
  const originalTags = await tags.inputValue();
  await alt.fill("Undone pane alt"); await tags.fill("undone-pane-tag");
  await panel.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content).toContain("Undone pane alt");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("Undone pane alt");
  await page.evaluate(async () => { await (window as unknown as { mediaPaneHarness: { view: { refresh(): Promise<void> } } }).mediaPaneHarness.view.refresh(); });
  await expect(alt).toHaveValue(originalAlt); await expect(tags).toHaveValue(originalTags);
  await panel.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect(panel.getByRole("status").last()).toContainText("saved as a draft");
  expect((await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("Undone pane alt");
  expect((await storedDraft(page, ".editor/media.json"))?.content ?? "").not.toContain("undone-pane-tag");
});

for (const removed of [false, true]) {
  test(`refresh guards pending detail requests when image is ${removed ? "removed" : "retained"}`, async ({ page, baseURL }) => {
    await mount(page, baseURL);
    const result = await page.evaluate(async (removed) => {
      const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
      const host = document.createElement("div"); document.body.append(host);
      const path = "images/delayed.svg";
      let releaseBlob!: (blob: Blob) => void;
      let releaseLoad!: () => void;
      let loads = 0; let mutations = 0;
      const library = (fresh: boolean): import("../../src/page-builder/media-picker").MediaLibrary => ({
        key: "detail-race", items: fresh && removed ? [] : [{ path, version: "same" }],
        metadata: { [path]: { alt: fresh ? "Restored alt" : "Stale alt", tags: [fresh ? "restored" : "stale"] } }, usage: {},
      });
      const adapter: import("../../src/page-builder/media-picker").MediaPickerHost = {
        load: async () => { if (++loads === 1) return library(false); await new Promise<void>(resolve => { releaseLoad = resolve; }); return library(true); },
        blob: () => new Promise(resolve => { releaseBlob = resolve; }),
        metadata: async () => { mutations++; }, upload: async () => "", rename: async () => {},
        remove: async () => {}, rewrite: async () => {}, openPage: async () => {},
      };
      const view = createMediaLibraryView(host, adapter); await view.ready;
      host.querySelector<HTMLButtonElement>(".media-library__thumbnail")!.click();
      const refreshing = view.refresh();
      releaseBlob(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], { type: "image/svg+xml" }));
      await new Promise(resolve => setTimeout(resolve, 50));
      const saveDuringLoad = host.querySelector('[aria-label="Default alt text"]') !== null;
      releaseLoad(); await refreshing;
      const sheet = host.querySelector<HTMLElement>(".media-library__sheet")!;
      const alt = host.querySelector<HTMLInputElement>('[aria-label="Default alt text"]')?.value;
      const tags = host.querySelector<HTMLInputElement>('[aria-label="Image tags"]')?.value;
      const hidden = sheet.hidden;
      view.dispose(); host.remove();
      return { saveDuringLoad, alt, tags, hidden, mutations };
    }, removed);
    expect(result).toEqual({ saveDuringLoad: false, alt: removed ? undefined : "Restored alt", tags: removed ? undefined : "restored", hidden: removed, mutations: 0 });
  });
}

test("refresh preserves the visible form but rejects Save while metadata reload waits", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  const result = await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div"); document.body.append(host);
    const path = "images/detail.svg";
    let release!: () => void;
    let loads = 0; let mutations = 0;
    const adapter: import("../../src/page-builder/media-picker").MediaPickerHost = {
      load: async () => {
        if (++loads > 1) await new Promise<void>(resolve => { release = resolve; });
        return { key: "form-race", items: [{ path }], metadata: { [path]: { alt: loads === 1 ? "Old alt" : "Restored alt", tags: [] } }, usage: {} };
      },
      blob: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], { type: "image/svg+xml" }),
      metadata: async () => { mutations++; }, upload: async () => "", rename: async () => {},
      remove: async () => {}, rewrite: async () => {}, openPage: async () => {},
    };
    const view = createMediaLibraryView(host, adapter); await view.ready;
    const rendered = new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        if (host.querySelector('[aria-label="Default alt text"]')) { observer.disconnect(); resolve(); }
      });
      observer.observe(host, { childList: true, subtree: true });
    });
    host.querySelector<HTMLButtonElement>(".media-library__thumbnail")!.click(); await rendered;
    const oldSave = [...host.querySelectorAll("button")].find(button => button.textContent === "Save metadata")!;
    const refreshing = view.refresh();
    const hasStaleForm = host.querySelector('[aria-label="Default alt text"]') !== null;
    oldSave.click();
    host.querySelector<HTMLButtonElement>(".media-library__thumbnail")!.click();
    await Promise.resolve();
    const hasFormAfterReopen = host.querySelector('[aria-label="Default alt text"]') !== null;
    release(); await refreshing;
    oldSave.click(); await Promise.resolve();
    const alt = host.querySelector<HTMLInputElement>('[aria-label="Default alt text"]')!.value;
    view.dispose(); host.remove();
    return { hasStaleForm, hasFormAfterReopen, mutations, alt };
  });
  expect(result).toEqual({ hasStaleForm: true, hasFormAfterReopen: false, mutations: 0, alt: "Restored alt" });
});

for (const focusTarget of ["search", "outside", "detail"] as const) {
  test(`failed background image reload preserves ${focusTarget} focus`, async ({ page, baseURL }) => {
    await mount(page, baseURL);
    await page.evaluate(async () => {
      (window as any).mediaPaneHarness.view.dispose();
      const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
      const host = document.querySelector<HTMLElement>("#media-pane-harness")!;
      host.style.width = "800px";
      let loads = 0;
      const view = createMediaLibraryView(host, {
        async load() { return { key: "background-failure", items: [{ path: "images/a.svg", version: String(++loads) }], metadata: {}, usage: {} }; },
        async blob() {
          if (loads > 1) return new Promise<Blob>((_resolve, reject) => { (window as any).rejectBackgroundBlob = () => reject(new Error("Background image failed")); });
          return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" });
        },
        async metadata() {}, async upload() { return ""; }, async rename() {}, async remove() {}, async rewrite() {}, async openPage() {},
      });
      Object.assign(window, { backgroundFailure: view }); await view.ready;
    });
    const panel = pane(page);
    await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
    await expect(panel.getByLabel("Default alt text", { exact: true })).toBeVisible();
    const target = focusTarget === "search" ? panel.getByLabel("Search images", { exact: true }) : focusTarget === "detail" ? panel.getByLabel("Default alt text", { exact: true }) : page.locator("#explorer-toggle");
    await target.focus();
    await expect(target).toBeFocused();
    await page.evaluate(() => { (window as any).backgroundRefresh = (window as any).backgroundFailure.refresh(); });
    await expect.poll(() => page.evaluate(() => Boolean((window as any).rejectBackgroundBlob))).toBe(true);
    await page.evaluate(async () => { (window as any).rejectBackgroundBlob(); await (window as any).backgroundRefresh; });
    await expect(panel.locator(".media-library__sheet")).toBeHidden();
    if (focusTarget === "detail") await expect(panel.getByRole("button", { name: "Details for images/a.svg", exact: true })).toBeFocused();
    else await expect(target).toBeFocused();
    await page.evaluate(() => (window as any).backgroundFailure.dispose());
  });
}

for (const lastImage of [false, true]) {
  test(`pending deletion rejects refresh and focuses ${lastImage ? "empty grid" : "next thumbnail"} after success`, async ({ page, baseURL }) => {
    await mount(page, baseURL);
    await page.evaluate(async (lastImage) => {
      (window as any).mediaPaneHarness.view.dispose();
      const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
      const host = document.querySelector<HTMLElement>("#media-pane-harness")!;
      let deleted = false, loads = 0;
      const view = createMediaLibraryView(host, {
        async load() { loads++; return { key: "delete-race", items: (deleted ? [] : [{ path: "images/a.svg" }]).concat(lastImage ? [] : [{ path: "images/b.svg" }]), metadata: {}, usage: {} }; },
        async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
        async metadata() {}, async upload() { return ""; }, async rename() {},
        async remove() { await new Promise<void>(resolve => { (window as any).releaseImageDelete = resolve; }); deleted = true; },
        async rewrite() {}, async openPage() {},
      });
      Object.assign(window, { deleteRace: { view, loads: () => loads } }); await view.ready;
    }, lastImage);
    const panel = pane(page);
    await panel.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
    await panel.getByRole("button", { name: "Delete image…", exact: true }).click();
    const confirm = panel.getByRole("button", { name: "Delete images", exact: true });
    await confirm.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => Boolean((window as any).releaseImageDelete))).toBe(true);
    await page.evaluate(async () => { await (window as any).deleteRace.view.refresh(); });
    await expect(confirm).toBeVisible();
    await expect(panel.getByRole("status").last()).not.toContainText("Reopen Delete");
    expect(await page.evaluate(() => (window as any).deleteRace.loads())).toBe(1);
    await page.evaluate(() => (window as any).releaseImageDelete());
    await expect(panel.getByRole("status").last()).toContainText("Images deleted as drafts.");
    await expect(lastImage ? panel.locator(".media-library__grid") : panel.getByRole("button", { name: "Details for images/b.svg", exact: true })).toBeFocused();
    await expect(panel.getByRole("status").last()).not.toContainText("Reopen Delete");
    await page.evaluate(() => (window as any).deleteRace.view.dispose());
  });
}

test("a failed direct image load can be retried without refreshing the library", async ({ page, baseURL }) => {
  await mount(page, baseURL);
  await page.evaluate(async () => {
    (window as any).mediaPaneHarness.view.dispose();
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.querySelector<HTMLElement>("#media-pane-harness")!;
    let fail = true;
    const view = createMediaLibraryView(host, {
      async load() { return { key: "direct-retry", items: [{ path: "images/a.svg" }], metadata: {}, usage: {} }; },
      async blob() {
        if (fail) throw new Error("Direct image failed");
        return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" });
      },
      async metadata() {}, async upload() { return ""; }, async rename() {}, async remove() {}, async rewrite() {}, async openPage() {},
    });
    Object.assign(window, { directRetry: { view, succeed: () => { fail = false; } } }); await view.ready;
  });
  const panel = pane(page), thumbnail = panel.getByRole("button", { name: "Details for images/a.svg", exact: true });
  await thumbnail.focus(); await page.keyboard.press("Enter");
  await expect(panel.getByRole("status").last()).toContainText("Direct image failed");
  await expect(panel.locator(".media-library__sheet")).toBeHidden();
  await expect(thumbnail).toBeFocused();
  await page.evaluate(() => (window as any).directRetry.succeed());
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Back to grid", exact: true })).toBeFocused();
  await expect(panel.getByLabel("Default alt text", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).directRetry.view.dispose());
});
