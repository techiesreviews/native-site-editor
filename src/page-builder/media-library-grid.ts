import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { basename, filterMediaLibrary, mediaLibraryRecovery, mediaLibraryTiles, type MediaKindChoice, type MediaLibraryFilter } from "./media-library-filter";
import type { MediaBytes } from "./media-byte-cache";
import type { LibraryShell } from "./media-library-shell";
import type { MediaLibrary } from "./media-picker";
import { icon } from "../icons";
import { formatBytes } from "../uploads";
import { paintUsageBadge } from "./media-library-usage";
import type { MediaUsageRecords } from "./media-usage";

/** What the grid keeps between draws; the view owns it. */
export interface LibraryGridState {
  kind: MediaKindChoice; selected: Set<string>; observers: Set<IntersectionObserver>;
  accept?: string; modal: boolean;
  /** Tiles, or the list (from More) with each file's size and usage. */
  layout: "grid" | "list";
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
}

/** Draw the screen-reader count and one square tile (or list row) per Image family, or a way back when nothing matches. */
export function drawLibraryGrid(shell: LibraryShell, library: MediaLibrary, state: LibraryGridState, h: LibraryGridHost) {
  const { search, collections, summary, bulk, bulkCount, grid, browse, dialog } = shell;
  const { selected, observers } = state;
  const active = document.activeElement;
  const card = active instanceof Element ? active.closest<HTMLElement>(".media-library__card") : null;
  const browseFocus = active instanceof HTMLButtonElement && card ? {
    path: card.dataset.path, label: active.getAttribute("aria-label"),
    usage: active.classList.contains("media-library__usage"),
  } : undefined;
  observers.forEach((observer) => observer.disconnect()); observers.clear();
  const tiles = mediaLibraryTiles(library.items);
  const filter: MediaLibraryFilter = { query: search.value, collection: collections.value, kind: state.kind, accept: state.accept };
  const filtered = filterMediaLibrary({ ...library, items: tiles }, filter);
  summary.textContent = `${filtered.length} of ${tiles.length} files${collections.value ? ` · ${collections.value}` : ""}`;
  bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`;
  grid.replaceChildren();
  const list = state.layout === "list";
  grid.classList.toggle("media-library__grid--list", list);
  if (!filtered.length) {
    const empty = node("div", "media-library__empty");
    if (!library.items.length) empty.textContent = state.modal
      ? "Your images belong here. Upload an image or drop one into the library."
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
    const thumb = button("", () => h.details(item.path), "media-library__thumbnail");
    thumb.setAttribute("aria-label", `Details for ${item.path}`);
    // The tile crops the picture to a square; the stored file is untouched.
    const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
    thumb.append(image, node("span", "media-library__name", basename(item.path)));
    const selectLabel = node("label", "media-library__select");
    const checkbox = input(`Select ${item.path}`, "checkbox"); checkbox.checked = selected.has(item.path);
    checkbox.addEventListener("change", () => {
      checkbox.checked ? selected.add(item.path) : selected.delete(item.path);
      bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`;
    });
    selectLabel.append(checkbox);
    // The number counts distinct pages; hover and focus show its words, a tap the page names.
    const used = button("", () => h.usage(item.path), "media-library__usage");
    used.setAttribute("aria-haspopup", "dialog"); paintUsageBadge(used, h.records(), item.path);
    const size = node("span", "media-library__size", item.size === undefined ? "" : formatBytes(item.size));
    card.append(node("span", "media-library__shade"), thumb, selectLabel, ...list ? [size] : [], used);
    grid.append(card);
    // A file the browser cannot draw gets a clean surface with its type, not a broken picture.
    const noPreview = () => {
      if (!h.alive() || !card.isConnected || card.classList.contains("is-file")) return;
      card.classList.add("is-file"); image.remove();
      thumb.prepend(icon("file", 28), node("span", "media-library__format", item.path.split(".").pop()?.toUpperCase() ?? "FILE"));
    };
    image.addEventListener("error", noPreview);
    // Observe thumbnails rather than downloading the whole repository on open.
    const observer = new IntersectionObserver((entries) => {
      if (!h.alive() || !card.isConnected || !entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void h.bytes(item.path).then((data) => {
        if (!h.alive() || !card.isConnected) return;
        item.size = data.blob.size; size.textContent = formatBytes(item.size); image.src = data.url;
      }).catch(noPreview);
    }, { root: state.modal ? browse : dialog, rootMargin: "200px" });
    observers.add(observer); observer.observe(card);
  }
  h.sync();
  if (browseFocus && h.restoreFocus && document.activeElement === document.body && !active?.isConnected) {
    const replacement = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__card button")]
      .find(control => control.closest<HTMLElement>(".media-library__card")?.dataset.path === browseFocus.path &&
        (browseFocus.usage ? control.classList.contains("media-library__usage") : control.getAttribute("aria-label") === browseFocus.label));
    if (replacement?.getClientRects().length) replacement.focus();
  }
}
