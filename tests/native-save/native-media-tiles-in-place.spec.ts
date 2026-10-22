import { expect, test } from "@playwright/test";
import type { LibraryGridHost, LibraryGridShell, LibraryGridState, LibraryTile } from "../../src/page-builder/media-library-grid";
import type { MediaLibrary, MediaLibraryItem, MediaOnlineVideo, MediaPickerHost } from "../../src/page-builder/media-picker";
import type { MediaUsageRecords } from "../../src/page-builder/media-usage";

// Default fixture group. Ticket 92: a redraw keeps each tile whose look is unchanged, rebuilds changed
// ones, removes gone ones and orders them as the list; the grid module is driven directly with a small fake shell.
test("a media refresh rebuilds only changed tiles, follows the new order and watches only new pictures", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const gridPath = "/src/page-builder/media-library-grid.ts";
    const { drawLibraryGrid } = await import(/* @vite-ignore */ gridPath) as typeof import("../../src/page-builder/media-library-grid");
    let watched = 0;
    const Native = window.IntersectionObserver;
    window.IntersectionObserver = class extends Native {
      constructor(...args: ConstructorParameters<typeof IntersectionObserver>) { super(...args); watched++; }
    };
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K) => document.createElement(tag);
    const dialog = el("div"), grid = el("div");
    dialog.style.cssText = "position:fixed;inset:0;overflow:auto;background:white;z-index:99999";
    dialog.append(grid); document.body.append(dialog);
    const shell = { search: el("input"), summary: el("p"), grid, browse: el("section"), dialog, bulk: el("div"), bulkCount: el("button"), takeOut: el("button"), removeFiles: el("button") } satisfies LibraryGridShell;
    const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'], { type: "image/svg+xml" }), url = URL.createObjectURL(blob);
    let stamp = "0", records: MediaUsageRecords | undefined;
    const host = {
      alive: () => true, details() {}, records: () => records, usage() {}, recover() {}, sync() {}, restoreFocus: true, choose() {}, online() {},
      bytes: async () => ({ url, blob, width: 4, height: 4 }), objectUrl: () => url, stamp: () => stamp,
    } satisfies LibraryGridHost;
    const selected = new Set<string>(), observers = new Set<IntersectionObserver>(), tiles = new Map<string, LibraryTile>();
    let layout: LibraryGridState["layout"] = "grid", modal = false, online = false, chosen: string | undefined;
    const drawLibrary = (items: MediaLibraryItem[], onlineVideos?: MediaOnlineVideo[]) => drawLibraryGrid(shell,
      { key: "tiles", collections: [], metadata: {}, usage: {}, items, onlineVideos } satisfies MediaLibrary,
      { kind: "all", collection: "", selected, observers, tiles, modal, layout, chosen, online } satisfies LibraryGridState, host);
    // Newest first: the list order is the draw order.
    const draw = (names: string[], versions: Record<string, string> = {}) =>
      drawLibrary(names.map((name, index) => ({ path: `media/${name}.svg`, size: 100, version: versions[name] ?? "1", date: 100 - index })));
    const cards = () => [...grid.querySelectorAll<HTMLElement>(".media-library__card")];
    const card = (name: string) => grid.querySelector<HTMLElement>(`[data-path="media/${name}.svg"]`)!;
    const paths = () => cards().map(card => card.dataset.path!.slice(6, -4));
    const kept = (before: HTMLElement[]) => cards().map(card => before.includes(card));

    draw(["a", "b", "c", "d"]);
    const first = cards(), firstWatched = watched;
    draw(["a", "b", "c", "d"], { c: "2" });
    const oneChanged = { kept: kept(first), watched: watched - firstWatched, observers: observers.size };
    const second = cards(); watched = 0;
    draw(["d", "c", "b", "a"], { c: "2" });
    const reordered = { paths: paths(), kept: kept(second), watched };
    // A file being added leads the grid; the redraw keeps it first.
    const pending = el("div"); pending.className = "media-library__pending"; grid.prepend(pending);
    const third = cards(); watched = 0;
    draw(["d", "e", "b", "a"], { c: "2" });
    const swapped = { paths: paths(), kept: kept(third), watched, observers: observers.size, pendingFirst: grid.firstElementChild === pending };
    pending.remove();
    // Selection repaints in place; a dropped cache entry rebuilds its tile.
    const fourth = cards();
    selected.add("media/b.svg"); draw(["d", "e", "b", "a"], { c: "2" });
    const selection = { kept: kept(fourth), checked: cards().map(card => card.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked) };
    stamp = "1"; draw(["d", "e", "b", "a"], { c: "2" });
    const stamped = kept(fourth).every(same => !same);
    // Newer usage repaints the badge on the same tile.
    const fifth = cards(), badge = () => card("b").querySelector<HTMLElement>(".media-library__usage")!;
    const unchecked = [badge().getAttribute("aria-label"), badge().dataset.usage];
    records = { reach: "text", pending: [], unreadable: [], families: [{ main: "media/b.svg", members: ["media/b.svg"], checked: true, pages: ["index.html"], otherUses: [] }] };
    draw(["d", "e", "b", "a"], { c: "2" });
    const usage = { kept: kept(fifth), before: unchecked, after: [badge().getAttribute("aria-label"), badge().dataset.usage] };
    selected.clear();
    // A moved tile keeps focus on its thumbnail or its round.
    draw(["a", "b", "c", "d"]);
    const thumb = card("b").querySelector<HTMLButtonElement>(".media-library__thumbnail")!; thumb.focus();
    draw(["b", "c", "d", "a"]);
    const thumbFocused = document.activeElement === thumb;
    const round = card("c").querySelector<HTMLInputElement>("input[type=checkbox]")!; round.focus();
    draw(["c", "b", "d", "a"]);
    const focus = { thumb: thumbFocused, round: document.activeElement === round, paths: paths() };
    round.blur();
    // The picker's choice repaints in place too; changing layout or mode draws every tile again.
    modal = true; draw(["d", "e"]);
    const picker = cards();
    chosen = "media/e.svg"; draw(["d", "e"]);
    const choice = { kept: kept(picker), pressed: cards().map(card => card.querySelector(".media-library__thumbnail")!.getAttribute("aria-pressed")), chosen: cards().map(card => card.classList.contains("is-chosen")) };
    layout = "list"; draw(["d", "e"]);
    const list = { kept: kept(picker), listClass: grid.classList.contains("media-library__grid--list"), sizes: grid.querySelectorAll(".media-library__size").length };
    // Nothing matching shows the way back, once; a match takes it away.
    shell.search.value = "zzz"; draw(["d", "e"]); draw(["d", "e"]);
    const empty = { cards: cards().length, empties: grid.querySelectorAll(".media-library__empty").length };
    shell.search.value = ""; draw(["d", "e"]);
    const back = { cards: cards().length, empties: grid.querySelectorAll(".media-library__empty").length, children: grid.children.length, tiles: tiles.size };
    // A size the loaded picture told (the file list had none) stays through a refresh.
    modal = false; chosen = undefined;
    const unsized = () => drawLibrary([{ path: "media/s.svg" }]);
    unsized();
    const sizeText = () => card("s").querySelector(".media-library__size")!.textContent;
    // fixed-wait: polls inside the page until the tile's picture has loaded.
    for (let tries = 0; tries < 100 && !sizeText(); tries++) await new Promise(resolve => setTimeout(resolve, 20));
    const loadedSize = sizeText(), sizedCard = card("s");
    unsized();
    const size = { loaded: Boolean(loadedSize), kept: card("s") === sizedCard, after: sizeText() === loadedSize };
    // YouTube and Vimeo tiles: kept while the same, rebuilt when their uses change.
    online = true; layout = "grid";
    const video = (uses: string[]): MediaOnlineVideo => ({ key: "online:youtube:abc", service: "youtube", id: "abc", title: "Clip", uses });
    drawLibrary([], [video([])]);
    const onlineCard = grid.querySelector(".is-online");
    drawLibrary([], [video([])]);
    const onlineKept = grid.querySelector(".is-online") === onlineCard;
    drawLibrary([], [video(["index.html"])]);
    const onlineTiles = { kept: onlineKept, rebuilt: grid.querySelector(".is-online") !== onlineCard && grid.querySelectorAll(".is-online").length === 1 };
    window.IntersectionObserver = Native; dialog.remove();
    return { oneChanged, reordered, swapped, selection, stamped, usage, focus, choice, list, empty, back, size, onlineTiles };
  });
  expect(result.oneChanged).toEqual({ kept: [true, true, false, true], watched: 1, observers: 4 });
  expect(result.reordered).toEqual({ paths: ["d", "c", "b", "a"], kept: [true, true, true, true], watched: 0 });
  expect(result.swapped).toEqual({ paths: ["d", "e", "b", "a"], kept: [true, false, true, true], watched: 1, observers: 4, pendingFirst: true });
  expect(result.selection).toEqual({ kept: [true, true, true, true], checked: [false, false, true, false] });
  expect(result.stamped).toBe(true);
  expect(result.usage).toEqual({ kept: [true, true, true, true], before: ["Not checked yet", "not-checked"], after: ["Used on 1 page", "used-on-pages"] });
  expect(result.focus).toEqual({ thumb: true, round: true, paths: ["c", "b", "d", "a"] });
  expect(result.choice).toEqual({ kept: [true, true], pressed: ["false", "true"], chosen: [false, true] });
  expect(result.list).toEqual({ kept: [false, false], listClass: true, sizes: 2 });
  expect(result.empty).toEqual({ cards: 0, empties: 1 });
  expect(result.back).toEqual({ cards: 2, empties: 0, children: 2, tiles: 2 });
  expect(result.size).toEqual({ loaded: true, kept: true, after: true });
  expect(result.onlineTiles).toEqual({ kept: true, rebuilt: true });
});

type TilesHarness = { refresh(): Promise<void>; files: Map<string, string>; blobs: string[]; dispose(): void };
const harness = (page: import("@playwright/test").Page) => ({
  refresh: () => page.evaluate(() => (window as typeof window & { tilesHarness: TilesHarness }).tilesHarness.refresh()),
  set: (path: string, colour: string | undefined) => page.evaluate(([path, colour]) => {
    const { files } = (window as typeof window & { tilesHarness: TilesHarness }).tilesHarness;
    if (colour) files.set(path!, `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${colour}"/></svg>`);
    else files.delete(path!);
  }, [path, colour]),
  blobs: () => page.evaluate(() => (window as typeof window & { tilesHarness: TilesHarness }).tilesHarness.blobs),
  dispose: () => page.evaluate(() => (window as typeof window & { tilesHarness: TilesHarness }).tilesHarness.dispose()),
});
/** A Media view (or the picker, `modal`) over files the test changes; no versions, as the repository adapter. */
async function mountHarness(page: import("@playwright/test").Page, baseURL: string | undefined, modal: boolean) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await page.evaluate(async modal => {
    const viewPath = "/src/page-builder/media-library-view.ts";
    const { createMediaLibraryView } = await import(/* @vite-ignore */ viewPath) as typeof import("../../src/page-builder/media-library-view");
    const files = new Map<string, string>([["media/x.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>']]);
    const blobs: string[] = [];
    const adapter = {
      load: async () => ({ key: "tiles", collections: [], metadata: {}, usage: {}, items: [...files.keys()].map(path => ({ path })) }),
      blob: async (path: string) => { blobs.push(path); return new Blob([files.get(path) ?? ""], { type: "image/svg+xml" }); },
      metadata: async () => {}, collections: async () => {}, rename: async () => {}, remove: async () => {}, openPage: async () => {},
      import: async () => [],
      // File details' Save: a new name moves the file.
      details: async (path: string, _changes: unknown, name?: string) => {
        if (!name) return;
        files.set(path.replace(/[^/]+$/, name), files.get(path)!); files.delete(path);
      },
    } satisfies MediaPickerHost;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:var(--surface);z-index:1000";
    document.body.append(host);
    const dialog = modal ? document.createElement("dialog") : undefined;
    dialog?.classList.add("media-library", "media-library--picker");
    const view = createMediaLibraryView(modal ? document.body : host, adapter, {}, dialog);
    await view.ready;
    Object.assign(window, { tilesHarness: { refresh: () => view.refresh(), files, blobs, dispose: () => { view.dispose(); host.remove(); } } satisfies TilesHarness });
  }, modal);
  return harness(page);
}

test("a removed file's name taken again shows its new picture", async ({ page, baseURL }) => {
  const media = await mountHarness(page, baseURL, false);
  const tile = page.locator('.media-library__card[data-path="media/x.svg"]');
  await expect(tile.locator("img[src]")).toHaveCount(1);
  const firstSrc = await tile.locator("img").getAttribute("src");
  await page.evaluate(() => { (window as typeof window & { firstTile?: Element | null }).firstTile = document.querySelector('.media-library__card[data-path="media/x.svg"]'); });
  await media.set("media/x.svg", undefined); await media.refresh();
  await expect(tile).toHaveCount(0);
  // Another file under the same name, with no version to tell them apart.
  await media.set("media/x.svg", "blue"); await media.refresh();
  await expect(tile.locator("img[src]")).toHaveCount(1);
  expect(await page.evaluate(() => (window as typeof window & { firstTile?: Element | null }).firstTile === document.querySelector('.media-library__card[data-path="media/x.svg"]'))).toBe(false);
  expect(await tile.locator("img").getAttribute("src")).not.toBe(firstSrc);
  expect((await media.blobs()).filter(path => path === "media/x.svg")).toHaveLength(2);
  await media.dispose();
});

test("a picker refresh keeps a held file's tile first, with focus on its Cancel", async ({ page, baseURL }) => {
  const media = await mountHarness(page, baseURL, true);
  const picker = page.locator("dialog.media-library--picker");
  await expect(picker.locator(".media-library__card")).toHaveCount(1);
  await picker.locator('input[name="media-upload"]').setInputFiles({ name: "held.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"/>') });
  const held = picker.locator(".media-library__pending").first();
  await expect(held).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  const cancel = held.locator(".media-library__pending-cancel");
  await cancel.focus();
  await media.set("media/y.svg", "green"); await media.refresh();
  await expect(picker.locator(".media-library__card")).toHaveCount(2);
  expect(await picker.locator(".media-library__grid").evaluate(grid => grid.firstElementChild?.classList.contains("media-library__pending"))).toBe(true);
  await expect(cancel).toBeFocused();
  await media.dispose();
});

test("a rename, which clears the picture cache, reloads a kept tile whose bytes changed", async ({ page, baseURL }) => {
  const media = await mountHarness(page, baseURL, false);
  await media.set("media/z.svg", "red"); await media.refresh();
  const tile = page.locator('.media-library__card[data-path="media/x.svg"]');
  await expect(page.locator(".media-library__card img[src]")).toHaveCount(2);
  const firstSrc = await tile.locator("img").getAttribute("src");
  // New bytes under the same name, with no version to tell them apart: only the cache clear shows them.
  await media.set("media/x.svg", "blue");
  await page.getByRole("button", { name: "Details for media/z.svg", exact: true }).click();
  await page.getByLabel("File name", { exact: true }).fill("w.svg");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.locator('.media-library__card[data-path="media/w.svg"]')).toHaveCount(1);
  // File details reopen on the renamed file; the tiles load their pictures once in view.
  await expect(page.getByLabel("File name", { exact: true })).toHaveValue("w.svg");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(tile.locator("img[src]")).toHaveCount(1);
  await expect.poll(() => tile.locator("img").getAttribute("src")).not.toBe(firstSrc);
  expect((await media.blobs()).filter(path => path === "media/x.svg")).toHaveLength(2);
  await media.dispose();
});

