import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { basename, filterMediaLibrary, filterOnlineVideos, onlineServiceName, onlineVideoName, mediaLibraryRecovery, mediaLibraryTiles, mediaTileLook, mediaTileStills, nameEnds, type MediaKindChoice, type MediaLibraryFilter } from "./media-library-filter";
import type { MediaBytes } from "./media-byte-cache";
import { syncSelectionBar, type LibraryShell } from "./media-library-shell";
import type { MediaLibrary, MediaLibraryItem, MediaOnlineVideo } from "./media-picker";
import { formatBytes } from "../uploads";
import { paintUsageBadge } from "./media-library-usage";
import { mediaUsageBadge, mediaUsageFor } from "./media-usage-text";
import type { MediaUsageRecords } from "./media-usage";
import { markTransparency } from "./media-transparency";
import { mediaTileWhole, tilePictureUrl } from "./media-tile-picture";

/** What the grid keeps between draws; the view owns it. */
export interface LibraryGridState {
  kind: MediaKindChoice; selected: Set<string>; observers: Set<IntersectionObserver>;
  /** The drawn tiles by path (online videos by `online:` and key). */
  tiles: Map<string, LibraryTile>;
  /** The collection shown (Filter); empty for All collections. */
  collection: string;
  accept?: string; modal: boolean;
  /** Tiles, or the list (from Filter's View) with each file's size and usage. */
  layout: "grid" | "list";
  /** The picker's chosen file. */
  chosen?: string;
  /** YouTube and Vimeo videos are listed (Media, and Add → Media's picker). */
  online?: boolean;
}
export interface LibraryGridHost {
  alive: () => boolean;
  details: (path: string) => void;
  /** The site's usage check, and its badge's tap: the usage words and page names. */
  records: () => MediaUsageRecords | undefined;
  usage: (path: string) => void;
  bytes: (path: string) => Promise<MediaBytes>;
  /** Changes when the byte cache drops a file (replaced, cleared), so its tile loads the picture again. */
  stamp: (path: string) => string;
  /** An address for a tile copy, released with the view. */
  objectUrl: (blob: Blob) => string;
  /** Widens the filters when nothing matches. */
  recover: (change: Partial<MediaLibraryFilter>) => void;
  sync: () => void;
  /** False while a detail sheet waits to take focus. */
  restoreFocus: boolean;
  /** The picker: a tile chooses its file (Use places it) rather than opening details. */
  choose: (path: string) => void;
  /** An online video's details (its uses), by its key. */
  online: (key: string) => void;
}

/** A drawn tile, kept by its path (or video key) while its look is the same; `update` repaints
 * what changes in place (selection, the picker's choice, usage, size). */
export interface LibraryTile {
  card: HTMLElement; look: string; observer?: IntersectionObserver;
  update: (draw: TileDraw, item?: MediaLibraryItem) => void;
}
/** The parts of Media's frame the grid draws into. */
export type LibraryGridShell = Pick<LibraryShell, "search" | "summary" | "grid" | "browse" | "dialog" | "bulk" | "bulkCount" | "takeOut" | "removeFiles">;
/** One draw's choices, read by kept tiles' controls when tapped. */
interface TileDraw { shell: LibraryGridShell; state: LibraryGridState; h: LibraryGridHost; list: boolean; root: HTMLElement }

/** Draw the screen-reader count and one square tile (or list row) per Image family, or a way back when
 * nothing matches. A redraw keeps each tile whose look is unchanged (its element and loaded picture),
 * adds new ones, removes gone ones and orders them as the list. */
export function drawLibraryGrid(shell: LibraryGridShell, library: MediaLibrary, state: LibraryGridState, h: LibraryGridHost) {
  const { search, summary, grid, browse, dialog } = shell;
  const { selected, collection, tiles } = state;
  const active = document.activeElement;
  const card = active instanceof Element ? active.closest<HTMLElement>(".media-library__card") : null;
  const browseFocus = active instanceof HTMLButtonElement && card ? {
    path: card.dataset.path, label: active.getAttribute("aria-label"),
    usage: active.classList.contains("media-library__usage"),
  } : undefined;
  const items = mediaLibraryTiles(library.items, library.onlineVideos), stills = mediaTileStills(library.items.map(item => item.path), library.metadata);
  const filter: MediaLibraryFilter = { query: search.value, collection, kind: state.kind, accept: state.accept };
  const filtered = filterMediaLibrary({ ...library, items }, filter);
  const online = state.online ? filterOnlineVideos(library.onlineVideos, filter) : [], onlineCount = state.online ? library.onlineVideos?.length ?? 0 : 0;
  summary.textContent = `${filtered.length + online.length} of ${items.length + onlineCount} files${collection ? ` · ${collection}` : ""}`;
  syncSelectionBar(shell, selected.size, collection);
  const list = state.layout === "list";
  grid.classList.toggle("media-library__grid--list", list);
  const draw: TileDraw = { shell, state, h, list, root: state.modal ? browse : dialog };
  const versions = new Map(library.items.map(item => [item.path, item.version]));
  // What a tile shows apart from what `update` repaints; the picture's version and stamp change when its bytes do.
  const pictureLook = (picture: string | undefined) => picture === undefined ? [] : [picture, versions.get(picture) ?? "", h.stamp(picture)];
  const shown: HTMLElement[] = [], keys = new Set<string>();
  const place = (key: string, look: string, build: () => Omit<LibraryTile, "look">, item?: MediaLibraryItem) => {
    let tile = tiles.get(key);
    if (tile?.look === look) tile.update(draw, item);
    else {
      if (tile) dropTile(tile, state);
      tile = { ...build(), look }; tiles.set(key, tile);
    }
    keys.add(key); shown.push(tile.card);
  };
  for (const item of filtered) {
    // A video shows its still and length, audio a sound picture and length, a PDF its first page (ticket 12).
    const tileLook = mediaTileLook(item.path, stills.get(item.path), library.metadata[item.path]?.duration);
    const kept = Boolean(library.keep?.includes(item.path)), byAgent = Boolean(library.toCheck?.some(row => row.file === item.path));
    const look = JSON.stringify([state.modal, list, tileLook, kept, byAgent, ...pictureLook(tileLook.picture)]);
    place(item.path, look, () => fileTile(item, tileLook, kept, byAgent, draw), item);
  }
  for (const video of online) {
    const badge = mediaUsageBadge({ main: video.key, members: [video.key], checked: true, pages: video.uses, otherUses: [] });
    const look = JSON.stringify([state.modal, list, video.service, onlineVideoName(video), badge, ...pictureLook(video.still)]);
    place(`online:${video.key}`, look, () => onlineTile(video, badge, draw));
  }
  for (const [key, tile] of tiles) if (!keys.has(key)) { dropTile(tile, state); tiles.delete(key); }
  grid.querySelector(":scope > .media-library__empty")?.remove();
  // In the list's order, after the tiles of files being added; only tiles out of place move.
  const placed = new Set(shown), next = (from: Element | null) => {
    while (from && !placed.has(from as HTMLElement)) from = from.nextElementSibling;
    return from;
  };
  let cursor = next(grid.firstElementChild), activeMoved = false;
  for (const tile of shown) {
    if (tile === cursor) { cursor = next(cursor.nextElementSibling); continue; }
    if (active && tile.contains(active)) activeMoved = true;
    grid.insertBefore(tile, cursor);
  }
  if (!filtered.length && !online.length) {
    const empty = node("div", "media-library__empty");
    if (!library.items.length && !onlineCount) empty.textContent = state.modal
      ? "Your images belong here. Drop one here, or use + to add one."
      : "Your media belongs here. Drop files here, or use + to add them.";
    else {
      const recovery = mediaLibraryRecovery(filter);
      empty.append(node("p", "", "No matching media"));
      if (recovery) empty.append(button(recovery.label, () => h.recover(recovery.change)));
    }
    grid.append(empty);
  }
  h.sync();
  if (!h.restoreFocus || document.activeElement !== document.body) return;
  // A moved tile's control (thumbnail, round or usage) takes focus back; a rebuilt tile's matching button does.
  if (activeMoved && active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
  else if (browseFocus && !active?.isConnected) {
    const replacement = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__card button")]
      .find(control => control.closest<HTMLElement>(".media-library__card")?.dataset.path === browseFocus.path &&
        (browseFocus.usage ? control.classList.contains("media-library__usage") : control.getAttribute("aria-label") === browseFocus.label));
    if (replacement?.getClientRects().length) replacement.focus();
  }
}

/** A tile leaving the grid, or rebuilt: its card goes and its picture stops waiting to load. */
function dropTile(tile: LibraryTile, state: LibraryGridState) {
  tile.card.remove();
  if (tile.observer) { tile.observer.disconnect(); state.observers.delete(tile.observer); }
}

function fileTile(item: MediaLibraryItem, look: ReturnType<typeof mediaTileLook>, kept: boolean, byAgent: boolean, first: TileDraw): Omit<LibraryTile, "look"> {
  let now = first, current = item;
  const { state, list } = first, path = item.path;
  const card = node("article", "media-library__card"); card.dataset.path = path;
  card.dataset.type = look.icon;
  const thumb = button("", () => now.state.modal ? now.h.choose(path) : now.h.details(path), "media-library__thumbnail");
  thumb.setAttribute("aria-label", `${state.modal ? "Choose" : "Details for"} ${path}${look.length ? `, ${look.length}` : ""}`);
  // The tile crops the picture to a square; the stored file is untouched.
  const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
  // The name's two ends: where the phone list shortens a name, it keeps the end and extension.
  const fileName = basename(path), name = node("span", "media-library__name"), [head, tail] = nameEnds(fileName);
  name.append(node("span", "media-library__name-head", head), node("span", "media-library__name-tail", tail));
  if (list) name.title = fileName;
  thumb.append(image, name);
  // The picker chooses one file: its round only shows the choice; the pane selects many.
  const selectLabel = node(state.modal ? "span" : "label", "media-library__select");
  let checkbox: HTMLInputElement | undefined;
  if (state.modal) {
    selectLabel.classList.add("media-library__pick"); selectLabel.setAttribute("aria-hidden", "true"); selectLabel.append(node("span"));
  } else {
    const box = checkbox = input(`Select ${path}`, "checkbox");
    box.addEventListener("change", () => {
      const { selected, collection } = now.state;
      box.checked ? selected.add(path) : selected.delete(path);
      syncSelectionBar(now.shell, selected.size, collection);
    });
    selectLabel.append(box);
  }
  // The number counts distinct pages; hover and focus show its words, a tap the page names.
  const used = button("", () => now.h.usage(path), "media-library__usage");
  used.setAttribute("aria-haspopup", "dialog");
  // The list's size (and length) sits with the name, so phones can stack them; a size the picture told survives a refresh.
  const size = node("span", "media-library__size");
  let known: number | undefined;
  const sizeText = () => {
    const text = [current.size === undefined ? "" : formatBytes(current.size), look.length ?? ""].filter(Boolean).join(" · ");
    if (size.textContent !== text) size.textContent = text;
  };
  if (list) thumb.append(size);
  card.append(node("span", "media-library__shade"), thumb, selectLabel, used);
  if (look.fact && !list) {
    const fact = node("span", "media-library__fact", look.fact); fact.setAttribute("aria-hidden", "true");
    card.classList.add("has-fact"); card.append(fact);
  }
  if (kept) {
    const keep = node("span", "media-library__keep"); keep.title = "Always keep";
    keep.setAttribute("role", "img"); keep.setAttribute("aria-label", "Always keep");
    card.classList.add("is-kept"); card.append(keep);
  }
  // By agent (ticket 13): words an agent wrote for this file wait in To check.
  if (byAgent) {
    const agent = node("span", "media-library__agent"), words = "Written by an agent – check in To check";
    agent.title = words; agent.setAttribute("role", "img"); agent.setAttribute("aria-label", words);
    card.classList.add("is-by-agent"); card.append(agent);
  }
  const update = (draw: TileDraw, next = current) => {
    now = draw; current = next;
    if (current.size === undefined && known !== undefined) current.size = known;
    sizeText();
    if (checkbox) checkbox.checked = draw.state.selected.has(path);
    else { thumb.setAttribute("aria-pressed", String(path === draw.state.chosen)); card.classList.toggle("is-chosen", path === draw.state.chosen); }
    const usage = mediaUsageBadge(mediaUsageFor(draw.h.records(), path));
    if (used.getAttribute("aria-label") !== usage.label || used.dataset.usage !== usage.state) paintUsageBadge(used, draw.h.records(), path);
  };
  update(first);
  const observer = tilePicture({ card, thumb, image, preview: look.picture, type: look.type, state, h: first.h, root: first.root,
    loaded: data => { if (look.picture === path) { known = current.size = data.blob.size; sizeText(); } } });
  return { card, observer, update };
}

/** YouTube and Vimeo videos (slice 68): their copied still, name and a small service mark; the
 * number counts the pages that show them. The pane opens their details, the picker chooses them. */
function onlineTile(video: MediaOnlineVideo, badge: ReturnType<typeof mediaUsageBadge>, first: TileDraw): Omit<LibraryTile, "look"> {
  let now = first;
  const { state, list } = first, key = video.key;
  const card = node("article", "media-library__card is-online"); card.dataset.id = key; card.dataset.type = "video";
  const service = onlineServiceName(video.service), title = onlineVideoName(video);
  const thumb = button("", () => now.state.modal ? now.h.choose(key) : now.h.online(key), "media-library__thumbnail");
  thumb.setAttribute("aria-label", `${state.modal ? "Choose" : "Details for"} ${service} video ${title}`);
  const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
  const name = node("span", "media-library__name"); name.append(node("span", "media-library__name-head", title));
  if (list) { name.title = title; thumb.append(image, name, node("span", "media-library__size", service)); }
  else thumb.append(image, name);
  card.append(node("span", "media-library__shade"), thumb);
  if (state.modal) {
    const pick = node("span", "media-library__select media-library__pick");
    pick.setAttribute("aria-hidden", "true"); pick.append(node("span")); card.append(pick);
  }
  const used = button("", () => now.h.online(key), "media-library__usage");
  const count = node("span", "media-library__count", badge.count), words = node("span", "media-library__usage-label", badge.label);
  count.setAttribute("aria-hidden", "true"); words.setAttribute("aria-hidden", "true");
  used.append(count, words); used.setAttribute("aria-label", badge.label); used.dataset.usage = badge.state;
  card.append(used);
  if (!list) {
    const mark = node("span", "media-library__fact media-library__service", service); mark.setAttribute("aria-hidden", "true");
    card.classList.add("has-fact"); card.append(mark);
  }
  const update = (draw: TileDraw) => {
    now = draw;
    if (!draw.state.modal) return;
    const on = key === draw.state.chosen;
    thumb.setAttribute("aria-pressed", String(on)); card.classList.toggle("is-chosen", on);
  };
  update(first);
  const observer = tilePicture({ card, thumb, image, preview: video.still, type: "", state, h: first.h, root: first.root });
  return { card, observer, update };
}

/** A tile's picture, loaded when it nears the view (never the whole repository on open; a video's or
 * PDF's tile loads only its still). A tile with no picture to draw gets a clean surface with its type's
 * picture, not a broken picture. */
function tilePicture(input: {
  card: HTMLElement; thumb: HTMLElement; image: HTMLImageElement; preview: string | undefined; type: string;
  state: LibraryGridState; h: LibraryGridHost; root: HTMLElement; loaded?: (data: MediaBytes) => void;
}) {
  const { card, thumb, image, preview, h } = input;
  const surface = () => {
    if (card.classList.contains("is-file")) return;
    card.classList.add("is-file"); image.remove();
    const picture = node("span", "media-library__type-picture"); picture.setAttribute("aria-hidden", "true");
    thumb.prepend(picture, node("span", "media-library__format", input.type));
  };
  const noPreview = () => { if (h.alive() && card.isConnected) surface(); };
  image.addEventListener("error", noPreview);
  if (!preview) { surface(); return undefined; }
  markTransparency(image, preview);
  const observer = new IntersectionObserver((entries) => {
    if (!h.alive() || !card.isConnected || !entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    void h.bytes(preview).then(async (data) => {
      if (!h.alive() || !card.isConnected) return;
      input.loaded?.(data);
      // A heavy picture shows a small copy; a banner wider than 2:1 shows whole (slice 107).
      const url = await tilePictureUrl(data, h.objectUrl, h.alive);
      if (!h.alive() || !card.isConnected) return;
      image.toggleAttribute("data-whole", mediaTileWhole(data.width, data.height));
      image.src = url;
    }).catch(noPreview);
  }, { root: input.root, rootMargin: "200px" });
  input.state.observers.add(observer); observer.observe(card);
  return observer;
}
