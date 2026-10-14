import { button, node } from "../ui/dom";
import { input } from "./media-library-fields";
import { basename, filterMediaLibrary, mediaLibraryTags, mediaLibraryTiles } from "./media-library-filter";
import type { MediaBytes } from "./media-byte-cache";
import type { LibraryShell } from "./media-library-shell";
import type { MediaLibrary } from "./media-picker";
import { icon } from "../icons";

/** What the grid keeps between draws; the view owns it. */
export interface LibraryGridState {
  tag: string; selected: Set<string>; observers: Set<IntersectionObserver>;
  accept?: string; modal: boolean;
}
export interface LibraryGridHost {
  alive: () => boolean;
  details: (path: string, focusUsage?: boolean) => void;
  bytes: (path: string) => Promise<MediaBytes>;
  setTag: (tag: string) => void;
  sync: () => void;
  /** False while a detail sheet waits to take focus. */
  restoreFocus: boolean;
}

/** Draw tag chips, the summary and one square tile per Image family; returns the tag in use. */
export function drawLibraryGrid(shell: LibraryShell, library: MediaLibrary, state: LibraryGridState, h: LibraryGridHost): string {
  const { chips, search, folders, sort, summary, bulk, bulkCount, grid, browse, dialog } = shell;
  const { selected, observers } = state;
  const active = document.activeElement;
  const card = active instanceof Element ? active.closest<HTMLElement>(".media-library__card") : null;
  const browseFocus = active instanceof HTMLButtonElement ? {
    path: card?.dataset.path, label: active.getAttribute("aria-label"),
    chip: active.classList.contains("media-library__chip") ? active.textContent : undefined,
    usage: active.classList.contains("media-library__usage"),
  } : undefined;
  observers.forEach((observer) => observer.disconnect()); observers.clear();
  chips.replaceChildren();
  const allTags = mediaLibraryTags(library.metadata);
  const tag = state.tag && !allTags.includes(state.tag) ? "" : state.tag;
  for (const value of ["", ...allTags]) {
    const chip = button(value || "All images", () => h.setTag(value), "media-library__chip");
    chip.setAttribute("aria-pressed", String(tag === value)); chips.append(chip);
  }
  const tiles = mediaLibraryTiles(library.items);
  const filtered = filterMediaLibrary({ ...library, items: tiles }, {
    query: search.value, folder: folders.value, tag, sort: sort.value, accept: state.accept,
  });
  summary.textContent = `${filtered.length} of ${tiles.length} images${folders.value ? ` · ${folders.selectedOptions[0].text}` : " · All folders"}`;
  bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`;
  grid.replaceChildren();
  if (!filtered.length) grid.append(node("p", "media-library__empty", library.items.length
    ? "No matching images. Clear search or choose another filter."
    : "Your images belong here. Upload an image or drop one into the library."));
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
    const usage = library.usage[item.path];
    const usageLabel = `Used on ${usage?.pages.length ?? 0} pages`;
    const used = button(String(usage?.pages.length ?? 0), () => h.details(item.path, true), "media-library__usage");
    used.setAttribute("aria-label", usageLabel); used.title = usageLabel;
    card.append(node("span", "media-library__shade"), thumb, selectLabel, used);
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
        item.size = data.blob.size; image.src = data.url;
      }).catch(noPreview);
    }, { root: state.modal ? browse : dialog, rootMargin: "200px" });
    observers.add(observer); observer.observe(card);
  }
  h.sync();
  if (browseFocus && h.restoreFocus && document.activeElement === document.body && !active?.isConnected) {
    const replacement = [...dialog.querySelectorAll<HTMLButtonElement>(".media-library__grid button,.media-library__chip")]
      .find(control => browseFocus.path
        ? control.closest<HTMLElement>(".media-library__card")?.dataset.path === browseFocus.path &&
          (browseFocus.usage ? control.classList.contains("media-library__usage") : control.getAttribute("aria-label") === browseFocus.label)
        : browseFocus.chip !== undefined && control.classList.contains("media-library__chip") && control.textContent === browseFocus.chip);
    if (replacement?.getClientRects().length) replacement.focus();
  }
  return tag;
}
