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
