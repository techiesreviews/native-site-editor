import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Default native-save fixture group: images/placeholder.svg and images/studio-desk.svg, no collections yet.
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tileNames = (page: Page) => pane(page).locator(".media-library__card").evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.path));
const records = async (page: Page) => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}") as
  { collections?: string[]; files?: Record<string, { collections?: string[] }> };
const members = async (page: Page, name: string) => Object.entries((await records(page)).files ?? {})
  .filter(([, record]) => record.collections?.includes(name)).map(([path]) => path).sort();

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
async function newCollectionFromManage(page: Page, name: string) {
  const library = pane(page);
  await library.getByLabel("Collections", { exact: true }).selectOption({ label: "Manage collections…" });
  await expect(library.getByRole("heading", { name: "Manage collections", exact: true })).toBeFocused();
  await library.getByRole("button", { name: "New collection", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill(name);
  await library.getByRole("button", { name: "Create", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Manage collections", exact: true })).toBeVisible();
  await expect(library.locator(".media-library__collection-row", { hasText: name })).toContainText("0 files");
  await expect(library).not.toHaveAttribute("aria-busy", "true");
}
const select = (page: Page, path: string) => pane(page).getByLabel(`Select ${path}`, { exact: true }).check();

test("create a collection, add two files, view it, take one out (it stays under All), Undo", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await expect(collections).toBeFocused();
  // The selection bar: Add to collection lists the collections, then New collection.
  await select(page, "images/placeholder.svg"); await select(page, "images/studio-desk.svg");
  const bar = library.getByRole("group", { name: "Selected files", exact: true });
  await expect(bar).toContainText("2 selected");
  await expect(bar.getByRole("button", { name: /^Take out/ })).toBeHidden();
  await bar.getByRole("button", { name: "Add to collection", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Add to collection", exact: true });
  await expect(menu.getByRole("menuitem")).toHaveText(["Studio picks", "New collection…"]);
  await menu.getByRole("menuitem", { name: "Studio picks", exact: true }).click();
  await expect.poll(() => members(page, "Studio picks")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  await expect(bar).toBeHidden();
  // View it; inside a collection, Take out and Remove file are separate actions.
  await collections.selectOption("Studio picks");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  await select(page, "images/placeholder.svg");
  await expect(bar.getByRole("button", { name: "Remove file", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Take out of Studio picks", exact: true }).click();
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await expect(library.locator(".media-library__message")).toHaveText("Took 1 file out of \"Studio picks\". It stays in Media under All.");
  await collections.selectOption("");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  expect((await storedDraft(page, "images/placeholder.svg"))?.deleted).toBeUndefined();
  // Undo puts it back.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => members(page, "Studio picks")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Media", exact: true }).click();
  await collections.selectOption("Studio picks");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
});

test("More renames and deletes the viewed collection: a taken name is refused, deleting keeps its files", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  await newCollectionFromManage(page, "Logos");
  await library.getByRole("button", { name: "New collection", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill("Brand");
  await library.getByRole("button", { name: "Create", exact: true }).click();
  await expect(library.locator(".media-library__collection-row")).toHaveCount(2);
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await select(page, "images/studio-desk.svg");
  await library.getByRole("button", { name: "Add to collection", exact: true }).click();
  await page.getByRole("menu", { name: "Add to collection", exact: true }).getByRole("menuitem", { name: "Logos", exact: true }).click();
  await expect.poll(() => members(page, "Logos")).toEqual(["images/studio-desk.svg"]);
  await collections.selectOption("Logos");
  const more = library.getByRole("button", { name: "More", exact: true }), menu = page.getByRole("menu", { name: "More", exact: true });
  // Rename to a taken name, in another case: it says so and nothing merges.
  await more.click(); await menu.getByRole("menuitem", { name: "Rename collection", exact: true }).click();
  const name = library.getByLabel("Collection name", { exact: true });
  await expect(name).toHaveValue("Logos"); await expect(name).toBeFocused();
  await name.fill("brand");
  await expect(library.locator(".media-library__problem")).toHaveText("\"brand\" is already taken by another collection. Choose another name.");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await library.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(name).toBeFocused();
  expect((await records(page)).collections).toEqual(["Logos", "Brand"]);
  await name.fill("Brand logos"); await expect(library.locator(".media-library__problem")).toBeHidden();
  await name.press("Enter");
  await expect(collections).toHaveValue("Brand logos");
  await expect(more).toBeFocused();
  await expect.poll(() => members(page, "Brand logos")).toEqual(["images/studio-desk.svg"]);
  await expect(collections.locator("option")).toHaveText(["All collections", "Brand logos", "Brand", "Manage collections…"]);
  // Delete the viewed collection: only the group goes.
  await more.click(); await menu.getByRole("menuitem", { name: "Delete collection", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Delete the collection \"Brand logos\"?", exact: true })).toBeFocused();
  await expect(library.locator(".media-library__sheet")).toContainText("Its 1 file stays in Media, under All and any other collections.");
  await library.getByRole("button", { name: "Delete collection", exact: true }).click();
  await expect(collections).toHaveValue("");
  await expect(collections.locator("option")).toHaveText(["All collections", "Brand", "Manage collections…"]);
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  expect((await records(page)).collections).toEqual(["Brand"]);
  expect((await storedDraft(page, "images/studio-desk.svg"))?.deleted).toBeUndefined();
  // More offers Rename and Delete only while viewing a collection.
  await more.click();
  await expect(menu.getByRole("menuitem", { name: "Rename collection", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("Manage collections lists every collection with Rename and Delete, and refuses a taken name", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Team");
  await library.getByRole("button", { name: "New collection", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill(" team ");
  await expect(library.locator(".media-library__problem")).toContainText("already taken");
  await library.getByRole("button", { name: "Create", exact: true }).click();
  await expect(library.getByLabel("Collection name", { exact: true })).toBeVisible();
  await library.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(library.locator(".media-library__collection-row")).toHaveCount(1);
  await library.getByRole("button", { name: "Rename Team", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill("People");
  await library.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(library.getByRole("button", { name: "Rename People", exact: true })).toBeFocused();
  await library.getByRole("button", { name: "Delete People", exact: true }).click();
  await expect(library.locator(".media-library__sheet")).toContainText("It has no files.");
  await library.getByRole("button", { name: "Delete collection", exact: true }).click();
  await expect(library.locator(".media-library__sheet")).toContainText("No collections yet.");
  expect((await records(page)).collections).toEqual([]);
  // Undo from outside redraws the open list.
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"); });
  await expect(library.locator(".media-library__collection-row")).toHaveText([/People/]);
});

test("details show and edit a file's collections; a new name there must be free", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Desk");
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await library.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  const memberships = library.getByRole("group", { name: "Collections", exact: true });
  await expect(memberships.getByRole("checkbox", { name: "Desk", exact: true })).not.toBeChecked();
  await memberships.getByRole("checkbox", { name: "Desk", exact: true }).check();
  const fresh = library.getByLabel("New collection", { exact: true });
  await fresh.fill("desk");
  await expect(library.locator(".media-library__problem")).toContainText("already taken");
  await library.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect(fresh).toBeFocused();
  expect(await members(page, "Desk")).toEqual([]);
  await fresh.fill("Workspace");
  await library.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(() => members(page, "Workspace")).toEqual(["images/studio-desk.svg"]);
  expect(await members(page, "Desk")).toEqual(["images/studio-desk.svg"]);
  await expect(memberships.getByRole("checkbox", { name: "Workspace", exact: true })).toBeChecked();
  await expect(fresh).toHaveValue("");
  await memberships.getByRole("checkbox", { name: "Desk", exact: true }).uncheck();
  await library.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(() => members(page, "Desk")).toEqual([]);
  expect((await records(page)).collections).toEqual(["Desk", "Workspace"]);
});

test("starting collections from named folders appear in Collections; dated and storage folders do not", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const { readSiteMediaRecords } = await import("/src/page-builder/media-collections.ts");
    const { mediaMetadataView } = await import("/src/page-builder/media-metadata.ts");
    // A techies-reviews-like tree with no .editor/media.json yet.
    const paths = ["images/logos/techies.png", "images/logos/techies-480w.png", "images/brand-assets/mark.svg",
      "wp-content/uploads/2023/09/review.svg", "images/hero.svg", "media/originals/hero.svg"];
    const records = readSiteMediaRecords(undefined, paths);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() { return { key: "starting", items: paths.map(path => ({ path, version: "A" })), collections: records.collections, metadata: mediaMetadataView(records), usage: {} }; },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {}, async import() { return []; },
    });
    Object.assign(window, { startingProbe: { dispose: () => { view.dispose(); host.remove(); } } });
    await view.ready;
  });
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  await expect(collections.locator("option")).toHaveText(["All collections", "Logos", "Brand assets", "Manage collections…"]);
  await collections.selectOption("Logos");
  await expect.poll(() => tileNames(page)).toEqual(["images/logos/techies.png"]);
  await collections.selectOption({ label: "Manage collections…" });
  await expect(collections).toHaveValue("Logos");
  await expect(library.locator(".media-library__collection-row")).toHaveText([/Logos\s*1 file/, /Brand assets\s*1 file/]);
  await page.evaluate(() => (window as any).startingProbe.dispose());
});

test("collections named like the details fields keep their own ticks across a refresh", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    let loads = 0; const saved: unknown[] = [];
    const view = createMediaLibraryView(host, {
      async load() {
        loads++;
        return { key: "names", items: [{ path: "images/a.svg", version: "A" }], collections: ["Default alt text", "Decorative", "New collection"],
          metadata: { "images/a.svg": { alt: "Stored alt", tags: ["Decorative"] } },
          // Only usage changes, so the unfinished form is kept.
          usage: loads > 1 ? { "images/a.svg": { pages: ["index.html"], files: ["index.html"], alts: [] } } : {} };
      },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata(changes) { saved.push(changes); }, async collections() {}, async rename() {}, async remove() {}, async openPage() {}, async import() { return []; },
    });
    Object.assign(window, { namesProbe: { saved, refresh: () => view.refresh(), dispose: () => { view.dispose(); host.remove(); } } });
    await view.ready;
  });
  const library = pane(page);
  await library.getByRole("button", { name: "Details for images/a.svg", exact: true }).click();
  const alt = library.locator('input[name="default-alt-text"]'), decorative = library.locator('input[name="decorative"]');
  const member = (name: string) => library.locator(`[data-form-key="collection:${name}"]`);
  await alt.fill("Unfinished alt");
  await member("Default alt text").check(); await member("Decorative").uncheck(); await member("New collection").check();
  await alt.focus();
  await page.evaluate(() => (window as any).namesProbe.refresh());
  await expect(library.getByRole("heading", { name: "Used on 1 pages", exact: true })).toBeVisible();
  await expect(alt).toHaveValue("Unfinished alt"); await expect(alt).toBeFocused();
  await expect(decorative).not.toBeChecked();
  await expect(member("Default alt text")).toBeChecked(); await expect(member("Decorative")).not.toBeChecked(); await expect(member("New collection")).toBeChecked();
  await expect(library.locator('input[name="new-collection"]')).toHaveValue("");
  await library.getByRole("button", { name: "Save metadata", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).namesProbe.saved)).toEqual([
    { "images/a.svg": { alt: "Unfinished alt", tags: ["Default alt text", "New collection"], decorative: false } },
  ]);
  await page.evaluate(() => (window as any).namesProbe.dispose());
});

test("New collection from the selection bar holds both files in one Undo step; Remove file inside a collection removes the file", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  const undo = () => page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"); });
  await select(page, "images/placeholder.svg"); await select(page, "images/studio-desk.svg");
  await library.getByRole("button", { name: "Add to collection", exact: true }).click();
  await page.getByRole("menu", { name: "Add to collection", exact: true }).getByRole("menuitem", { name: "New collection…", exact: true }).click();
  await expect(library.locator(".media-library__sheet")).toContainText("The 2 files you selected go into it.");
  await library.getByLabel("Collection name", { exact: true }).fill("Pair");
  await library.getByRole("button", { name: "Create", exact: true }).click();
  await expect.poll(() => members(page, "Pair")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  await expect(library.getByRole("group", { name: "Selected files", exact: true })).toBeHidden();
  await undo();
  await expect.poll(async () => (await records(page)).collections ?? []).toEqual([]);
  await expect(collections.locator("option")).toHaveText(["All collections", "Manage collections…"]);
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("redo", "index.html"); });
  await expect.poll(() => members(page, "Pair")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  // Inside the collection, Remove file is today's delete: the file itself goes (as a draft).
  await collections.selectOption("Pair");
  await select(page, "images/placeholder.svg");
  await library.getByRole("button", { name: "Remove file", exact: true }).click();
  await library.getByRole("button", { name: "Delete images", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "images/placeholder.svg"))?.deleted).toBe(true);
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await collections.selectOption("");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await undo();
  await expect.poll(async () => (await storedDraft(page, "images/placeholder.svg"))?.deleted).toBeUndefined();
  await expect.poll(() => members(page, "Pair")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
});

// Adding by drop (ticket 17): SVGs keep their bytes on today's Optimise path, so names stay predictable.
const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="${fill}"/></svg>`;
async function dropOnMedia(page: Page, files: { name: string; text: string }[]) {
  await pane(page).evaluate((element, files) => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([file.text], file.name, { type: "image/svg+xml" }));
    for (const type of ["dragenter", "dragover", "drop"])
      element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files);
}
/** Holds the first image preparation until released; later ones run at once. */
async function holdFirstPreparation(page: Page) {
  let release: (() => void) | undefined, held = false;
  await page.route("**/src/page-builder/image-optimise.worker.ts*", async route => {
    if (!held) { held = true; await new Promise<void>(resolve => { release = resolve; }); }
    await route.continue().catch(() => undefined);
  });
  return { started: () => expect.poll(() => Boolean(release)).toBe(true), free: () => release!() };
}
const tray = (page: Page) => pane(page).getByRole("region", { name: "Files being added", exact: true });

test("dropping two images while viewing a collection adds both to it in one Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await collections.selectOption("Studio picks");
  await expect.poll(() => tileNames(page)).toEqual([]);
  await dropOnMedia(page, [{ name: "red-dot.svg", text: svg("red") }, { name: "blue-dot.svg", text: svg("blue") }]);
  await expect(tray(page)).toBeVisible();
  await expect(tray(page).getByRole("status")).toHaveText("Added 2 files");
  await expect.poll(() => tileNames(page)).toEqual(["images/blue-dot.svg", "images/red-dot.svg"]);
  await expect(library.locator(".media-library__pending")).toHaveCount(0);
  await expect.poll(() => members(page, "Studio picks")).toEqual(["images/blue-dot.svg", "images/red-dot.svg"]);
  expect((await storedDraft(page, "images/red-dot.svg"))?.deleted).toBeUndefined();
  // One Undo step takes both files and their membership away.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "images/red-dot.svg"))?.path).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "images/blue-dot.svg"))?.path).toBeUndefined();
  await expect.poll(() => members(page, "Studio picks")).toEqual([]);
});

test("cancelling one file mid-way keeps the other; the grid stays usable while files are prepared", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  const hold = await holdFirstPreparation(page);
  await dropOnMedia(page, [{ name: "slow.svg", text: svg("red") }, { name: "quick.svg", text: svg("blue") }]);
  await hold.started();
  // Progress on the new tiles: the first is being prepared, the second waits.
  const slow = library.locator(".media-library__pending", { hasText: "slow.svg" });
  await expect(slow).toContainText("Preparing…");
  await expect(library.locator(".media-library__pending", { hasText: "quick.svg" })).toContainText("Waiting");
  await expect(tray(page).getByRole("status")).toHaveText("Adding 2 files");
  await expect(tray(page).getByRole("progressbar", { name: "Files added" })).toBeVisible();
  // The grid stays usable: search narrows while the files are prepared.
  await library.getByLabel("Search media", { exact: true }).fill("studio");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await library.getByLabel("Search media", { exact: true }).fill("");
  await library.getByRole("button", { name: "Cancel adding slow.svg", exact: true }).click();
  await expect(slow).toHaveCount(0);
  hold.free();
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/quick.svg", "images/studio-desk.svg"]);
  expect(await storedDraft(page, "images/slow.svg")).toBeUndefined();
  // Dismiss closes the tray.
  await tray(page).getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(tray(page)).toBeHidden();
});

test("files added while a search hides them offer Show new files; Add new file follows the same path and under All stores no records", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), search = library.getByLabel("Search media", { exact: true });
  const recordsBefore = await storedDraft(page, ".editor/media.json");
  await search.fill("studio");
  await library.getByRole("button", { name: "More", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: "Add new file", exact: true }).click();
  await (await chooser).setFiles([{ name: "zebra.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg("black")) }]);
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await tray(page).getByRole("button", { name: "Show new files", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg", "images/zebra.svg"]);
  await expect(tray(page).getByRole("button", { name: "Show new files", exact: true })).toBeHidden();
  expect((await storedDraft(page, "images/zebra.svg"))?.deleted).toBeUndefined();
  // Under All collections, nothing joins a collection: the records are as before.
  expect(await storedDraft(page, ".editor/media.json")).toEqual(recordsBefore);
});

test("renaming the collection while its files are prepared: they join it under its new name", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), collections = library.getByLabel("Collections", { exact: true });
  await newCollectionFromManage(page, "Studio");
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await collections.selectOption("Studio");
  const hold = await holdFirstPreparation(page);
  await dropOnMedia(page, [{ name: "late.svg", text: svg("green") }]);
  await hold.started();
  await library.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: "Rename collection", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill("Picks");
  await library.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(collections).toHaveValue("Picks");
  hold.free();
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => members(page, "Picks")).toEqual(["images/late.svg"]);
  await expect.poll(() => tileNames(page)).toEqual(["images/late.svg"]);
});

test("Review… stops automatic adding and opens Optimise for the files not added yet, in the same collection", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await library.getByLabel("Collections", { exact: true }).selectOption("Studio picks");
  const hold = await holdFirstPreparation(page);
  await dropOnMedia(page, [{ name: "first.svg", text: svg("red") }, { name: "second.svg", text: svg("blue") }]);
  await hold.started();
  await tray(page).getByRole("button", { name: "Review…", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Optimise", exact: true })).toBeVisible();
  await expect(library.locator(".media-library__sheet")).toContainText("2 images");
  await expect(library.locator(".media-library__pending")).toHaveCount(0);
  await expect(tray(page)).toBeHidden();
  hold.free();
  // Nothing is added behind the sheet's back; its own Add to library adds them once.
  await library.getByRole("button", { name: "Preview optimisation", exact: true }).click();
  await library.getByRole("button", { name: "Add to library", exact: true }).click();
  await expect.poll(() => members(page, "Studio picks")).toEqual(["images/first.svg", "images/second.svg"]);
  await expect.poll(() => tileNames(page)).toEqual(["images/first.svg", "images/second.svg"]);
  expect(await storedDraft(page, "images/first-2.svg")).toBeUndefined();
});

test("a file that cannot be prepared stays in the tray with its reason and Review…; the others join the collection once", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back to grid", exact: true }).click();
  await library.getByLabel("Collections", { exact: true }).selectOption("Studio picks");
  await pane(page).evaluate((element, good) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([good], "good.svg", { type: "image/svg+xml" }));
    transfer.items.add(new File(["not a picture"], "broken.png", { type: "image/png" }));
    for (const type of ["dragenter", "dragover", "drop"])
      element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, svg("red"));
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file · 1 could not be added");
  await expect(tray(page).getByRole("listitem")).toHaveText(/^broken\.png: .+/);
  await expect.poll(() => members(page, "Studio picks")).toEqual(["images/good.svg"]);
  await expect.poll(() => tileNames(page)).toEqual(["images/good.svg"]);
  // Review… offers only the failed file to today's Optimise sheet.
  await tray(page).getByRole("button", { name: "Review…", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Optimise", exact: true })).toBeVisible();
  await expect(library.locator(".media-library__sheet")).toContainText("1 image");
  // The tray keeps the file that was added; the failed one moved to the sheet.
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect(tray(page).getByRole("listitem")).toHaveCount(0);
  expect(await storedDraft(page, "images/good-2.svg")).toBeUndefined();
});

test("a cancelled drop whose save was waiting never takes a later drop's files: each drop saves once", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  // The third preparation (the later drop's second file) waits until released.
  let releaseWorker: (() => void) | undefined, workers = 0;
  await page.route("**/src/page-builder/image-optimise.worker.ts*", async route => {
    if (++workers === 3) await new Promise<void>(resolve => { releaseWorker = resolve; });
    await route.continue().catch(() => undefined);
  });
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const host = document.createElement("div"); host.style.cssText = "position:fixed;inset:20px;z-index:1000;background:var(--surface)";
    document.body.append(host);
    const imports: string[][] = [];
    let hold: Promise<void> | undefined, release = () => {};
    const library = { key: "adding-race", collections: [], items: [{ path: "images/a.svg", version: "1" }], metadata: {}, usage: {} };
    const view = createMediaLibraryView(host, {
      load: async () => { await hold; return library; },
      blob: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], { type: "image/svg+xml" }),
      metadata: async () => {}, collections: async () => {}, rename: async () => {}, remove: async () => {}, openPage: async () => {},
      import: async requests => { imports.push(requests.map(request => request.file.name)); return requests.map(request => `images/${request.file.name}`); },
    });
    await view.ready;
    Object.assign(window, { addingRace: {
      imports, holdLoad() { hold = new Promise(resolve => { release = resolve; }); void view.refresh(); },
      releaseLoad() { hold = undefined; release(); },
    } });
  });
  type Race = { imports: string[][]; holdLoad(): void; releaseLoad(): void };
  // A library refresh holds the lock, so drop A's ready file waits to be saved.
  await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.holdLoad());
  await dropOnMedia(page, [{ name: "a1.svg", text: svg("red") }]);
  await expect(pane(page).locator(".media-library__pending", { hasText: "a1.svg" })).toContainText("Ready");
  await tray(page).getByRole("button", { name: "Cancel", exact: true }).click();
  // Drop B: one file ready, one still being prepared, when the lock frees.
  await dropOnMedia(page, [{ name: "b1.svg", text: svg("blue") }, { name: "b2.svg", text: svg("green") }]);
  await expect(pane(page).locator(".media-library__pending", { hasText: "b1.svg" })).toContainText("Ready");
  await expect.poll(() => Boolean(releaseWorker)).toBe(true);
  await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.releaseLoad());
  await expect(pane(page).locator(".media-library__pending", { hasText: "b2.svg" })).toContainText("Preparing…");
  expect(await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.imports)).toEqual([]);
  releaseWorker!();
  await expect(tray(page).getByRole("status")).toHaveText("Added 2 files");
  expect(await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.imports)).toEqual([["b1.svg", "b2.svg"]]);
});
