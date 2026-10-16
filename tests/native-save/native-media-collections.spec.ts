import { test, expect, type Page } from "@playwright/test";
import { openEditor, openMedia } from "../support/scenarios";
import { storedDraft } from "./drafts";
import { collectionChoices, filterButton, filterTo } from "./media-filter";

// Default native-save fixture group: images/placeholder.svg and images/studio-desk.svg, no collections yet.
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tileNames = (page: Page) => pane(page).locator(".media-library__card").evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.path));
const records = async (page: Page) => JSON.parse((await storedDraft(page, ".editor/media.json"))?.content ?? "{}") as
  { collections?: string[]; files?: Record<string, { collections?: string[] }> };
const members = async (page: Page, name: string) => Object.entries((await records(page)).files ?? {})
  .filter(([, record]) => record.collections?.includes(name)).map(([path]) => path).sort();

async function open(page: Page, baseURL: string | undefined) {
  await openEditor(page, baseURL);
  await openMedia(page);
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
async function newCollectionFromManage(page: Page, name: string) {
  const library = pane(page);
  await filterTo(library, "Manage collections…");
  await expect(library.getByRole("heading", { name: "Manage collections", exact: true })).toBeFocused();
  await library.getByRole("button", { name: "New collection", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill(name);
  await library.getByRole("button", { name: "Create", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Manage collections", exact: true })).toBeVisible();
  await expect(library.locator(".media-library__collection-row", { hasText: name })).toContainText("0 files");
  await expect(library).not.toHaveAttribute("aria-busy", "true");
}
/** A collection's ⋯ in Manage collections, then Rename… or Delete… (slice 111). */
async function collectionAction(page: Page, name: string, action: "Rename…" | "Delete…") {
  await pane(page).getByRole("button", { name: `More for ${name}`, exact: true }).click();
  await page.getByRole("menu", { name: `More for ${name}`, exact: true }).getByRole("menuitem", { name: action, exact: true }).click();
}
const select = (page: Page, path: string) => pane(page).getByLabel(`Select ${path}`, { exact: true }).check();

test("create a collection, add two files, view it, take one out (it stays under All), Undo", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(filterButton(library)).toBeFocused();
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
  await filterTo(library, "Studio picks");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  await select(page, "images/placeholder.svg");
  await expect(bar.getByRole("button", { name: "Remove file", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Take out of Studio picks", exact: true }).click();
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await expect(page.locator(".editor-toast__text")).toHaveText("Took 1 file out of \"Studio picks\". It stays in Media under All.");
  await filterTo(library, "All collections");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  expect((await storedDraft(page, "images/placeholder.svg"))?.deleted).toBeUndefined();
  // Undo puts it back.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => members(page, "Studio picks")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  await openMedia(page);
  await filterTo(library, "Studio picks");
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
});

test("Manage collections renames and deletes the viewed collection: the view follows, a taken name is refused, deleting keeps its files", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Logos");
  await library.getByRole("button", { name: "New collection", exact: true }).click();
  await library.getByLabel("Collection name", { exact: true }).fill("Brand");
  await library.getByRole("button", { name: "Create", exact: true }).click();
  await expect(library.locator(".media-library__collection-row")).toHaveCount(2);
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await select(page, "images/studio-desk.svg");
  await library.getByRole("button", { name: "Add to collection", exact: true }).click();
  await page.getByRole("menu", { name: "Add to collection", exact: true }).getByRole("menuitem", { name: "Logos", exact: true }).click();
  await expect.poll(() => members(page, "Logos")).toEqual(["images/studio-desk.svg"]);
  await filterTo(library, "Logos");
  await expect(filterButton(library)).toHaveAccessibleName("Filter: Logos");
  // More holds only the tools now; the viewed collection is renamed in Manage collections.
  await library.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menu", { name: "More", exact: true }).getByRole("menuitem", { name: /collection/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await filterTo(library, "Manage collections…");
  // Rename to a taken name, in another case: it says so and nothing merges.
  await collectionAction(page, "Logos", "Rename…");
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
  await expect(library.getByRole("button", { name: "More for Brand logos", exact: true })).toBeFocused();
  await expect.poll(() => members(page, "Brand logos")).toEqual(["images/studio-desk.svg"]);
  // The view follows the rename.
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(filterButton(library)).toHaveAccessibleName("Filter: Brand logos");
  expect(await collectionChoices(library)).toEqual(["All collections", "Brand logos", "Brand"]);
  // Delete the viewed collection: only the group goes, and the view returns to All.
  await filterTo(library, "Manage collections…");
  await collectionAction(page, "Brand logos", "Delete…");
  await expect(library.locator(".media-library__sheet")).toContainText("Its 1 file stays in Media, under All and any other collections.");
  await library.getByRole("button", { name: "Delete collection", exact: true }).click();
  await expect(library.locator(".media-library__collection-row")).toHaveCount(1);
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(filterButton(library)).toHaveAccessibleName("Filter: All");
  expect(await collectionChoices(library)).toEqual(["All collections", "Brand"]);
  await expect.poll(() => tileNames(page)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  expect((await records(page)).collections).toEqual(["Brand"]);
  expect((await storedDraft(page, "images/studio-desk.svg"))?.deleted).toBeUndefined();
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
  // One ⋯ menu per row (audit slice 111): Rename, then Delete last in red.
  await library.getByRole("button", { name: "More for Team", exact: true }).click();
  const rowMenu = page.getByRole("menu", { name: "More for Team", exact: true });
  await expect(rowMenu.getByRole("menuitem")).toHaveText(["Rename…", "Delete…"]);
  await expect(rowMenu.getByRole("menuitem", { name: "Delete…" })).toHaveClass(/row-menu__danger/);
  await rowMenu.getByRole("menuitem", { name: "Rename…", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Rename \"Team\"", exact: true })).toBeVisible();
  await library.getByLabel("Collection name", { exact: true }).fill("People");
  await library.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(library.getByRole("button", { name: "More for People", exact: true })).toBeFocused();
  // Back on the Delete screen leaves the collection, focus on its ⋯.
  await library.getByRole("button", { name: "More for People", exact: true }).click();
  await page.getByRole("menu", { name: "More for People", exact: true }).getByRole("menuitem", { name: "Delete…", exact: true }).click();
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(library.getByRole("button", { name: "More for People", exact: true })).toBeFocused();
  await library.getByRole("button", { name: "More for People", exact: true }).click();
  await page.getByRole("menu", { name: "More for People", exact: true }).getByRole("menuitem", { name: "Delete…", exact: true }).click();
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
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await library.getByRole("button", { name: "Details for images/studio-desk.svg", exact: true }).click();
  const memberships = library.getByRole("group", { name: "Collections", exact: true });
  await expect(memberships.getByRole("checkbox", { name: "Desk", exact: true })).not.toBeChecked();
  await memberships.getByRole("checkbox", { name: "Desk", exact: true }).check();
  const fresh = library.getByLabel("New collection", { exact: true });
  await fresh.fill("desk");
  await expect(library.locator(".media-library__memberships .media-library__problem")).toContainText("already taken");
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(fresh).toBeFocused();
  expect(await members(page, "Desk")).toEqual([]);
  await fresh.fill("Workspace");
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(() => members(page, "Workspace")).toEqual(["images/studio-desk.svg"]);
  expect(await members(page, "Desk")).toEqual(["images/studio-desk.svg"]);
  await expect(memberships.getByRole("checkbox", { name: "Workspace", exact: true })).toBeChecked();
  await expect(fresh).toHaveValue("");
  await memberships.getByRole("checkbox", { name: "Desk", exact: true }).uncheck();
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(() => members(page, "Desk")).toEqual([]);
  expect((await records(page)).collections).toEqual(["Desk", "Workspace"]);
});

test("starting collections from named folders appear in Collections; dated and storage folders do not", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
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
  const library = pane(page);
  await expect.poll(() => collectionChoices(library)).toEqual(["All collections", "Logos", "Brand assets"]);
  await filterTo(library, "Logos");
  await expect.poll(() => tileNames(page)).toEqual(["images/logos/techies.png"]);
  await filterTo(library, "Manage collections…");
  // Manage collections may hide the One bar; Filter keeps the viewed collection.
  await expect(library.locator(".media-library__filter")).toHaveAttribute("aria-label", "Filter: Logos");
  await expect(library.locator(".media-library__collection-row")).toHaveText([/Logos\s*1 file/, /Brand assets\s*1 file/]);
  await page.evaluate(() => (window as any).startingProbe.dispose());
});

test("collections named like the details fields keep their own ticks across a refresh", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
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
        return { key: "names", items: [{ path: "images/a.svg", version: "A" }], collections: ["Description", "Decorative", "New collection"],
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
  const alt = library.locator('textarea[name="description"]'), decorative = library.locator('input[name="decorative"]');
  const member = (name: string) => library.locator(`[data-form-key="collection:${name}"]`);
  await alt.fill("Unfinished alt");
  await member("Description").check(); await member("Decorative").uncheck(); await member("New collection").check();
  await alt.focus();
  // Only usage changes, so File details rebuilds in the background and keeps the unfinished form.
  await page.evaluate(() => { document.querySelector<HTMLElement>("[data-detail-form]")!.dataset.old = ""; });
  await page.evaluate(() => (window as any).namesProbe.refresh());
  await expect(library.locator("[data-detail-form][data-old]")).toHaveCount(0);
  await expect(alt).toHaveValue("Unfinished alt"); await expect(alt).toBeFocused();
  await expect(decorative).not.toBeChecked();
  await expect(member("Description")).toBeChecked(); await expect(member("Decorative")).not.toBeChecked(); await expect(member("New collection")).toBeChecked();
  await expect(library.locator('input[name="new-collection"]')).toHaveValue("");
  await library.getByRole("button", { name: "Save details", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).namesProbe.saved)).toEqual([
    { "images/a.svg": { alt: "Unfinished alt", tags: ["Description", "New collection"], decorative: false, alwaysKeep: false } },
  ]);
  await page.evaluate(() => (window as any).namesProbe.dispose());
});

test("New collection from the selection bar holds both files in one Undo step; Remove file inside a collection removes the file", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
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
  await expect.poll(() => collectionChoices(library)).toEqual(["All collections"]);
  await page.evaluate(async () => { await (await import("/src/components/code-editor.ts")).runVisualHistory("redo", "index.html"); });
  await expect.poll(() => members(page, "Pair")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  // Inside the collection, Remove file is today's delete: the file itself goes (as a draft).
  await filterTo(library, "Pair");
  await select(page, "images/placeholder.svg");
  await library.getByRole("button", { name: "Remove file", exact: true }).click();
  await library.getByRole("button", { name: "Remove file", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "images/placeholder.svg"))?.deleted).toBe(true);
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await filterTo(library, "All collections");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await undo();
  await expect.poll(async () => (await storedDraft(page, "images/placeholder.svg"))?.deleted).toBeUndefined();
  await expect.poll(() => members(page, "Pair")).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
});

// Adding by drop (ticket 17): SVGs keep their bytes on today's Optimise path, so names stay predictable.
const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect width="12" height="12" fill="${fill}"/></svg>`;
async function dropOnMedia(page: Page, files: { name: string; text: string }[]) {
  await pane(page).evaluate(async (element, files) => {
    const transfer = new DataTransfer();
    for (const file of files) {
      if (file.name.endsWith(".png")) {
        const canvas = document.createElement("canvas"); canvas.width = 12; canvas.height = 12;
        const context = canvas.getContext("2d")!; context.fillStyle = "#25813f"; context.fillRect(0, 0, 12, 12);
        const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
        transfer.items.add(new File([blob], file.name, { type: "image/png" }));
      } else transfer.items.add(new File([file.text], file.name, { type: "image/svg+xml" }));
    }
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
  const library = pane(page);
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await filterTo(library, "Studio picks");
  await expect.poll(() => tileNames(page)).toEqual([]);
  await dropOnMedia(page, [{ name: "red-dot.svg", text: svg("red") }, { name: "blue-dot.svg", text: svg("blue") }]);
  await expect(tray(page)).toBeVisible();
  await expect(tray(page).getByRole("status")).toHaveText("Added 2 files");
  await expect.poll(() => tileNames(page)).toEqual(["media/images/blue-dot.svg", "media/images/red-dot.svg"]);
  await expect(library.locator(".media-library__pending")).toHaveCount(0);
  await expect.poll(() => members(page, "Studio picks")).toEqual(["media/images/blue-dot.svg", "media/images/red-dot.svg"]);
  expect((await storedDraft(page, "media/images/red-dot.svg"))?.deleted).toBeUndefined();
  // One Undo step takes both files and their membership away.
  await page.keyboard.press("Escape");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "media/images/red-dot.svg"))?.path).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "media/images/blue-dot.svg"))?.path).toBeUndefined();
  await expect.poll(() => members(page, "Studio picks")).toEqual([]);
});

test("cancelling one file mid-way keeps the other; the grid stays usable while files are prepared", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  const hold = await holdFirstPreparation(page);
  await dropOnMedia(page, [{ name: "slow.png", text: svg("red") }, { name: "quick.svg", text: svg("blue") }]);
  await hold.started();
  // Progress on the new tiles: the first is being prepared, the second waits.
  const slow = library.locator(".media-library__pending", { hasText: "slow.png" });
  await expect(slow).toContainText("Preparing…");
  await expect(library.locator(".media-library__pending", { hasText: "quick.svg" })).toContainText("Waiting");
  await expect(tray(page).getByRole("status")).toHaveText("Adding 2 files");
  await expect(tray(page).getByRole("progressbar", { name: "Files added" })).toBeVisible();
  // The grid stays usable: search narrows while the files are prepared.
  await library.getByLabel("Search media", { exact: true }).fill("studio");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await library.getByLabel("Search media", { exact: true }).fill("");
  await library.getByRole("button", { name: "Cancel adding slow.png", exact: true }).click();
  await expect(slow).toHaveCount(0);
  hold.free();
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => tileNames(page)).toEqual(["media/images/quick.svg", "images/placeholder.svg", "images/studio-desk.svg"]);
  for (const path of ["media/images/slow.webp", "media/images/slow.png"]) expect(await storedDraft(page, path)).toBeUndefined();
  // Dismiss closes the tray.
  await tray(page).getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(tray(page)).toBeHidden();
});

test("files added while a search hides them offer Show new files; + follows the same path and under All joins no collection", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page), search = library.getByLabel("Search media", { exact: true });
  const recordsBefore = await storedDraft(page, ".editor/media.json");
  await search.fill("studio");
  const chooser = page.waitForEvent("filechooser");
  await library.getByRole("button", { name: "Add files", exact: true }).click();
  await (await chooser).setFiles([{ name: "zebra.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg("black")) }]);
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => tileNames(page)).toEqual(["images/studio-desk.svg"]);
  await tray(page).getByRole("button", { name: "Show new files", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect.poll(() => tileNames(page)).toEqual(["media/images/zebra.svg", "images/placeholder.svg", "images/studio-desk.svg"]);
  await expect(tray(page).getByRole("button", { name: "Show new files", exact: true })).toBeHidden();
  expect((await storedDraft(page, "media/images/zebra.svg"))?.deleted).toBeUndefined();
  // Under All collections, nothing joins a collection: the records only gain the new file's date (slice 103).
  const after = await records(page) as { collections?: string[]; files?: Record<string, { collections?: string[]; added?: string }> };
  expect(after.collections ?? []).toEqual(recordsBefore ? JSON.parse(recordsBefore.content).collections ?? [] : []);
  expect(Object.keys(after.files ?? {})).toEqual(["media/images/zebra.svg"]);
  expect(Object.keys(after.files!["media/images/zebra.svg"])).toEqual(["added"]);
});

test("renaming the collection while its files are prepared: they join it under its new name", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Studio");
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await filterTo(library, "Studio");
  const hold = await holdFirstPreparation(page);
  await dropOnMedia(page, [{ name: "late.png", text: svg("green") }]);
  await hold.started();
  await filterTo(library, "Manage collections…");
  await collectionAction(page, "Studio", "Rename…");
  await library.getByLabel("Collection name", { exact: true }).fill("Picks");
  await library.getByRole("button", { name: "Rename", exact: true }).click();
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await expect(filterButton(library)).toHaveAccessibleName("Filter: Picks");
  hold.free();
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(() => members(page, "Picks")).toEqual(["media/images/late.png"]);
  await expect.poll(() => tileNames(page)).toEqual(["media/images/late.png"]);
});

test("Review… stops automatic adding and opens Optimise for the files not added yet, in the same collection", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await filterTo(library, "Studio picks");
  const hold = await holdFirstPreparation(page);
  await dropOnMedia(page, [{ name: "first.png", text: svg("red") }, { name: "second.svg", text: svg("blue") }]);
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
  await expect.poll(() => members(page, "Studio picks")).toEqual(["media/images/first.png", "media/images/second.svg"]);
  await expect.poll(() => tileNames(page)).toEqual(["media/images/first.png", "media/images/second.svg"]);
  expect(await storedDraft(page, "media/images/first-2.svg")).toBeUndefined();
});

test("a file that cannot be prepared stays in the tray with its reason and Review…; the others join the collection once", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = pane(page);
  await newCollectionFromManage(page, "Studio picks");
  await library.getByRole("button", { name: "Back", exact: true }).click();
  await filterTo(library, "Studio picks");
  await pane(page).evaluate((element, good) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([good], "good.svg", { type: "image/svg+xml" }));
    transfer.items.add(new File(["not a picture"], "broken.png", { type: "image/png" }));
    for (const type of ["dragenter", "dragover", "drop"])
      element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, svg("red"));
  await expect(tray(page).getByRole("status")).toHaveText("1 added · 1 couldn't be added");
  await expect(tray(page).getByRole("listitem")).toHaveText(/^broken\.png couldn't be added\. /);
  await expect.poll(() => members(page, "Studio picks")).toEqual(["media/images/good.svg"]);
  await expect.poll(() => tileNames(page)).toEqual(["media/images/good.svg"]);
  // Review… offers only the failed file to today's Optimise sheet.
  await tray(page).getByRole("button", { name: "Review…", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Optimise", exact: true })).toBeVisible();
  await expect(library.locator(".media-library__sheet")).toContainText("1 image");
  // The full reason the tray gave in short is here.
  await expect(library.locator(".media-library__sheet .media-library__problem")).toHaveText(/^broken\.png could not be prepared\. /);
  // The tray keeps the file that was added; the failed one moved to the sheet.
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect(tray(page).getByRole("listitem")).toHaveCount(0);
  expect(await storedDraft(page, "media/images/good-2.svg")).toBeUndefined();
});

test("a cancelled drop whose save was waiting never takes a later drop's files: each drop saves once", async ({ page, baseURL }) => {
  await openEditor(page, baseURL);
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
  await dropOnMedia(page, [{ name: "a1.png", text: svg("red") }]);
  await expect(pane(page).locator(".media-library__pending", { hasText: "a1.png" })).toContainText("Ready");
  await tray(page).getByRole("button", { name: "Cancel", exact: true }).click();
  // Drop B: one file ready, one still being prepared, when the lock frees.
  await dropOnMedia(page, [{ name: "b1.png", text: svg("blue") }, { name: "b2.png", text: svg("green") }]);
  await expect(pane(page).locator(".media-library__pending", { hasText: "b1.png" })).toContainText("Ready");
  await expect.poll(() => Boolean(releaseWorker)).toBe(true);
  await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.releaseLoad());
  await expect(pane(page).locator(".media-library__pending", { hasText: "b2.png" })).toContainText("Preparing…");
  expect(await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.imports)).toEqual([]);
  releaseWorker!();
  await expect(tray(page).getByRole("status")).toHaveText("Added 2 files");
  expect(await page.evaluate(() => (window as typeof window & { addingRace: Race }).addingRace.imports)).toEqual([["b1.png", "b2.png"]]);
});
