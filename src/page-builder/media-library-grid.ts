import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { basename, filterMediaLibrary, filterOnlineVideos, onlineServiceName, onlineVideoName, mediaLibraryRecovery, mediaLibraryTiles, mediaTileLook, mediaTileStills, nameEnds, type MediaKindChoice, type MediaLibraryFilter } from "./media-library-filter";
import type { MediaBytes } from "./media-byte-cache";
import { syncSelectionBar, type LibraryShell } from "./media-library-shell";
import type { MediaLibrary } from "./media-picker";
import { formatBytes } from "../uploads";
import { paintUsageBadge } from "./media-library-usage";
import { mediaUsageBadge } from "./media-usage-text";
import type { MediaUsageRecords } from "./media-usage";

/** What the grid keeps between draws; the view owns it. */
export interface LibraryGridState {
  kind: MediaKindChoice; selected: Set<string>; observers: Set<IntersectionObserver>;
  accept?: string; modal: boolean;
  /** Tiles, or the list (from More) with each file's size and usage. */
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

/** Draw the screen-reader count and one square tile (or list row) per Image family, or a way back when nothing matches. */
export function drawLibraryGrid(shell: LibraryShell, library: MediaLibrary, state: LibraryGridState, h: LibraryGridHost) {
  const { search, collections, summary, grid, browse, dialog } = shell;
  const { selected, observers } = state;
  const active = document.activeElement;
  const card = active instanceof Element ? active.closest<HTMLElement>(".media-library__card") : null;
  const browseFocus = active instanceof HTMLButtonElement && card ? {
    path: card.dataset.path, label: active.getAttribute("aria-label"),
    usage: active.classList.contains("media-library__usage"),
  } : undefined;
  observers.forEach((observer) => observer.disconnect()); observers.clear();
  const tiles = mediaLibraryTiles(library.items), stills = mediaTileStills(library.items.map(item => item.path), library.metadata);
  const filter: MediaLibraryFilter = { query: search.value, collection: collections.value, kind: state.kind, accept: state.accept };
  const filtered = filterMediaLibrary({ ...library, items: tiles }, filter);
  const online = state.online ? filterOnlineVideos(library.onlineVideos, filter) : [], onlineCount = state.online ? library.onlineVideos?.length ?? 0 : 0;
  summary.textContent = `${filtered.length + online.length} of ${tiles.length + onlineCount} files${collections.value ? ` · ${collections.value}` : ""}`;
  syncSelectionBar(shell, selected.size, collections.value);
  grid.replaceChildren();
  const list = state.layout === "list";
  grid.classList.toggle("media-library__grid--list", list);
  if (!filtered.length && !online.length) {
    const empty = node("div", "media-library__empty");
    if (!library.items.length && !onlineCount) empty.textContent = state.modal
      ? "Your images belong here. Drop one here, or choose Add new file in More."
      : "Your media belongs here. Drop files here, or choose Add new file in More.";
    else {
      const recovery = mediaLibraryRecovery(filter);
      empty.append(node("p", "", "No matching media"));
      if (recovery) empty.append(button(recovery.label, () => h.recover(recovery.change)));
    }
    grid.append(empty);
  }
  for (const item of filtered) {
    const card = node("article", "media-library__card"); card.dataset.path = item.path;
    // A video shows its still and length, audio a sound picture and length, a PDF its first page (ticket 12).
    const look = mediaTileLook(item.path, stills.get(item.path), library.metadata[item.path]?.duration);
    card.dataset.type = look.icon;
    const thumb = button("", () => state.modal ? h.choose(item.path) : h.details(item.path), "media-library__thumbnail");
    thumb.setAttribute("aria-label", `${state.modal ? "Choose" : "Details for"} ${item.path}${look.length ? `, ${look.length}` : ""}`);
    // The tile crops the picture to a square; the stored file is untouched.
    const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
    // The name's two ends: where the phone list shortens a name, it keeps the end and extension.
    const fileName = basename(item.path), name = node("span", "media-library__name"), [head, tail] = nameEnds(fileName);
    name.append(node("span", "media-library__name-head", head), node("span", "media-library__name-tail", tail));
    if (list) name.title = fileName;
    thumb.append(image, name);
    // The picker chooses one file: its round only shows the choice; the pane selects many.
    const selectLabel = node(state.modal ? "span" : "label", "media-library__select");
    if (state.modal) {
      thumb.setAttribute("aria-pressed", String(item.path === state.chosen)); card.classList.toggle("is-chosen", item.path === state.chosen);
      selectLabel.classList.add("media-library__pick"); selectLabel.setAttribute("aria-hidden", "true"); selectLabel.append(node("span"));
    } else {
      const checkbox = input(`Select ${item.path}`, "checkbox"); checkbox.checked = selected.has(item.path);
      checkbox.addEventListener("change", () => {
        checkbox.checked ? selected.add(item.path) : selected.delete(item.path);
        syncSelectionBar(shell, selected.size, collections.value);
      });
      selectLabel.append(checkbox);
    }
    // The number counts distinct pages; hover and focus show its words, a tap the page names.
    const used = button("", () => h.usage(item.path), "media-library__usage");
    used.setAttribute("aria-haspopup", "dialog"); paintUsageBadge(used, h.records(), item.path);
    // The list's size (and length) sits with the name, so phones can stack them.
    const size = node("span", "media-library__size");
    const sizeText = () => { size.textContent = [item.size === undefined ? "" : formatBytes(item.size), look.length ?? ""].filter(Boolean).join(" · "); };
    sizeText();
    if (list) thumb.append(size);
    card.append(node("span", "media-library__shade"), thumb, selectLabel, used);
    if (look.fact && !list) {
      const fact = node("span", "media-library__fact", look.fact); fact.setAttribute("aria-hidden", "true");
      card.classList.add("has-fact"); card.append(fact);
    }
    if (library.keep?.includes(item.path)) {
      const keep = node("span", "media-library__keep"); keep.title = "Always keep";
      keep.setAttribute("role", "img"); keep.setAttribute("aria-label", "Always keep");
      card.classList.add("is-kept"); card.append(keep);
    }
    // By agent (ticket 13): words an agent wrote for this file wait in To check.
    if (library.toCheck?.some(row => row.file === item.path)) {
      const agent = node("span", "media-library__agent"); agent.title = "By agent: see To check in More";
      agent.setAttribute("role", "img"); agent.setAttribute("aria-label", "By agent");
      card.classList.add("is-by-agent"); card.append(agent);
    }
    grid.append(card);
    tilePicture({ card, thumb, image, preview: look.picture, type: look.type, state, h, root: state.modal ? browse : dialog,
      loaded: data => { if (look.picture === item.path) { item.size = data.blob.size; sizeText(); } } });
  }
  // YouTube and Vimeo videos (slice 68): their copied still, name and a small service mark; the
  // number counts the pages that show them. The pane opens their details, the picker chooses them.
  for (const video of online) {
    const card = node("article", "media-library__card is-online"); card.dataset.id = video.key; card.dataset.type = "video";
    const service = onlineServiceName(video.service), title = onlineVideoName(video);
    const thumb = button("", () => state.modal ? h.choose(video.key) : h.online(video.key), "media-library__thumbnail");
    thumb.setAttribute("aria-label", `${state.modal ? "Choose" : "Details for"} ${service} video ${title}`);
    const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
    const name = node("span", "media-library__name"); name.append(node("span", "media-library__name-head", title));
    if (list) { name.title = title; thumb.append(image, name, node("span", "media-library__size", service)); }
    else thumb.append(image, name);
    card.append(node("span", "media-library__shade"), thumb);
    if (state.modal) {
      const on = video.key === state.chosen, pick = node("span", "media-library__select media-library__pick");
      thumb.setAttribute("aria-pressed", String(on)); card.classList.toggle("is-chosen", on);
      pick.setAttribute("aria-hidden", "true"); pick.append(node("span")); card.append(pick);
    }
    const used = button("", () => h.online(video.key), "media-library__usage"), badge = mediaUsageBadge({ main: video.key, members: [video.key], checked: true, pages: video.uses, otherUses: [] });
    const count = node("span", "media-library__count", badge.count), words = node("span", "media-library__usage-label", badge.label);
    count.setAttribute("aria-hidden", "true"); words.setAttribute("aria-hidden", "true");
    used.append(count, words); used.setAttribute("aria-label", badge.label); used.dataset.usage = badge.state;
    card.append(used);
    if (!list) {
      const mark = node("span", "media-library__fact media-library__service", service); mark.setAttribute("aria-hidden", "true");
      card.classList.add("has-fact"); card.append(mark);
    }
    grid.append(card);
    tilePicture({ card, thumb, image, preview: video.still, type: "", state, h, root: state.modal ? browse : dialog });
  }
  h.sync();
  if (browseFocus && h.restoreFocus && document.activeElement === document.body && !active?.isConnected) {
    const replacement = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__card button")]
      .find(control => control.closest<HTMLElement>(".media-library__card")?.dataset.path === browseFocus.path &&
        (browseFocus.usage ? control.classList.contains("media-library__usage") : control.getAttribute("aria-label") === browseFocus.label));
    if (replacement?.getClientRects().length) replacement.focus();
  }
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
  if (!preview) { surface(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (!h.alive() || !card.isConnected || !entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    void h.bytes(preview).then((data) => {
      if (!h.alive() || !card.isConnected) return;
      input.loaded?.(data);
      image.src = data.url;
    }).catch(noPreview);
  }, { root: input.root, rootMargin: "200px" });
  input.state.observers.add(observer); observer.observe(card);
}
