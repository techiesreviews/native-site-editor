import { expect, test } from "@playwright/test";
import type { LibraryGridHost, LibraryGridShell, LibraryGridState, LibraryTile } from "../../src/page-builder/media-library-grid";
import type { MediaLibrary, MediaLibraryItem, MediaOnlineVideo } from "../../src/page-builder/media-picker";

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
    let stamp = "0";
    const host = {
      alive: () => true, details() {}, records: () => undefined, usage() {}, recover() {}, sync() {}, restoreFocus: true, choose() {}, online() {},
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
    return { oneChanged, reordered, swapped, selection, stamped, focus, choice, list, empty, back, size, onlineTiles };
  });
  expect(result.oneChanged).toEqual({ kept: [true, true, false, true], watched: 1, observers: 4 });
  expect(result.reordered).toEqual({ paths: ["d", "c", "b", "a"], kept: [true, true, true, true], watched: 0 });
  expect(result.swapped).toEqual({ paths: ["d", "e", "b", "a"], kept: [true, false, true, true], watched: 1, observers: 4, pendingFirst: true });
  expect(result.selection).toEqual({ kept: [true, true, true, true], checked: [false, false, true, false] });
  expect(result.stamped).toBe(true);
  expect(result.focus).toEqual({ thumb: true, round: true, paths: ["c", "b", "d", "a"] });
  expect(result.choice).toEqual({ kept: [true, true], pressed: ["false", "true"], chosen: [false, true] });
  expect(result.list).toEqual({ kept: [false, false], listClass: true, sizes: 2 });
  expect(result.empty).toEqual({ cards: 0, empties: 1 });
  expect(result.back).toEqual({ cards: 2, empties: 0, children: 2, tiles: 2 });
  expect(result.size).toEqual({ loaded: true, kept: true, after: true });
  expect(result.onlineTiles).toEqual({ kept: true, rebuilt: true });
});
