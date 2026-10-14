import { button, node } from "../ui/dom";
import { formatBytes, WARN_IMAGE_BYTES } from "../uploads";
import { input } from "./media-library-fields";
import { basename, parent, filterMediaLibrary, mediaLibraryTags } from "./media-library-filter";
import type { MediaBytes } from "./media-byte-cache";
import type { LibraryShell } from "./media-library-shell";
import type { MediaLibrary } from "./media-picker";
import { setIcon } from "../icons";
import { rowActions } from "../components/row-actions";

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

/** Draw tag chips, the summary and the cards; returns the tag in use. */
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
  const filtered = filterMediaLibrary(library, {
    query: search.value, folder: folders.value, tag, sort: sort.value, accept: state.accept,
  });
  summary.textContent = `${filtered.length} of ${library.items.length} images${folders.value ? ` · ${folders.selectedOptions[0].text}` : " · All folders"}`;
  bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`;
  grid.replaceChildren();
  if (!filtered.length) grid.append(node("p", "media-library__empty", library.items.length
    ? "No matching images. Clear search or choose another filter."
    : "Your images belong here. Upload an image or drop one into the library."));
  for (const item of filtered) {
    const card = node("article", "media-library__card"); card.dataset.path = item.path;
    const thumb = button("", () => h.details(item.path), "media-library__thumbnail");
    thumb.setAttribute("aria-label", `Details for ${item.path}`);
    const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
    thumb.append(image);
    const format = node("span", "media-library__format", item.path.split(".").pop()?.toUpperCase() ?? "IMAGE"); thumb.append(format);
    const selectLabel = node("label", "media-library__select");
    const checkbox = input(`Select ${item.path}`, "checkbox"); checkbox.checked = selected.has(item.path);
    checkbox.addEventListener("change", () => {
      checkbox.checked ? selected.add(item.path) : selected.delete(item.path);
      bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`;
    });
    selectLabel.append(checkbox); card.append(thumb, selectLabel);
    const nameLine = node("div", "media-library__name-line");
    nameLine.append(node("h3", "media-library__name", basename(item.path)));
    card.append(nameLine, node("p", "media-library__folder", parent(item.path) || "Repository root"));
    const meta = node("p", "media-library__stats", item.size === undefined ? "Reading image…" : formatBytes(item.size));
    card.append(meta);
    const tags = node("div", "media-library__tags");
    for (const value of library.metadata[item.path]?.tags ?? []) tags.append(node("span", "media-library__tag", value));
    if (item.draft) tags.append(node("span", "media-library__tag", "Draft")); card.append(tags);
    const usage = library.usage[item.path];
    const usageLabel = `Used on ${usage?.pages.length ?? 0} pages`;
    card.append(node("p", "media-library__usage-count", usageLabel));
    const used = button("", () => h.details(item.path, true), "media-library__usage");
    setIcon(used, "dots-three");
    used.setAttribute("aria-label", usageLabel); used.title = usageLabel;
    rowActions(nameLine, [used]);
    grid.append(card);
    // Observe thumbnails rather than downloading the whole repository on open.
    const observer = new IntersectionObserver((entries) => {
      if (!h.alive() || !card.isConnected || !entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void h.bytes(item.path).then((data) => {
        if (!h.alive() || !card.isConnected) return;
        image.src = data.url;
        item.size = data.blob.size;
        meta.textContent = `${data.width ? `${data.width} × ${data.height} · ` : "Dimensions unavailable · "}${formatBytes(data.blob.size)}`;
        if (data.blob.size >= WARN_IMAGE_BYTES) { meta.classList.add("media-library__heavy"); meta.append(node("span", "", " · Heavy")); }
      }).catch(() => { if (h.alive() && card.isConnected) meta.textContent = "Image unavailable"; });
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
