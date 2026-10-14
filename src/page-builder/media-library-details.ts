import { button, node } from "../ui/dom";
import { formatBytes, uploadImageType } from "../uploads";
import { input, field, check } from "./media-library-fields";
import { detailCollections, mediaCollectionNameMessage } from "./media-collection-choices";
import { basename } from "./media-library-filter";
import type { LibrarySheet, LibrarySheetContext } from "./media-library-sheet";
import type { MediaBytes } from "./media-byte-cache";
import type { MediaMetadata } from "./media-metadata";
import type { MediaPickerOptions } from "./media-picker";
import type { MediaUsage } from "./media-references";
import { mediaImageMarkup, mediaVariants, type MediaImage } from "./media-markup";

/** The view around the detail sheet, and the screens a detail sheet can open. */
export interface DetailHost extends LibrarySheetContext {
  dialog: HTMLElement;
  grid: HTMLElement;
  /** The picker modal; the Images pane has none. */
  modal: boolean;
  pick: Pick<MediaPickerOptions, "onPick" | "initialAlt">;
  close: () => void;
  optimise: (files: File[], existing: boolean, receipts: Map<string, string | undefined>) => void;
  remove: (paths: string[]) => void;
}

/** Open the details of `path`; a `background` open (a refresh) keeps focus where it is. */
export async function showMediaDetail(sheet: LibrarySheet, h: DetailHost, path: string, background = false) {
  const { element } = sheet, { dialog, grid, cache, tell } = h;
  if (!h.alive()) return;
  const initiatingFocus = document.activeElement;
  const initiatingInsideDetail = initiatingFocus instanceof Element && element.contains(initiatingFocus);
  if (!background) sheet.focus = { path, active: initiatingFocus };
  const focusRequest = sheet.focus;
  delete element.dataset.mode;
  sheet.work?.abort(); sheet.redraw = undefined;
  sheet.path = path;
  const version = ++sheet.version;
  element.hidden = false; element.replaceChildren(node("p", "media-library__muted", "Loading image…"));
  if (!h.modal && !background) dialog.scrollTop = 0;
  if (h.loading()) return;
  const data = await cache.get(path).catch((error) => { tell(String(error)); return undefined; });
  if (!h.alive() || version !== sheet.version || !data || !h.library().items.some((item) => item.path === path)) {
    if (sheet.focus === focusRequest) sheet.focus = undefined;
    if (h.alive() && version === sheet.version && !data) {
      cache.drop(path); element.hidden = true; sheet.path = undefined;
      if (document.activeElement === document.body ||
        (!background || initiatingInsideDetail) && document.activeElement === initiatingFocus)
        grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus();
    }
    return;
  }
  if (h.loading()) return;
  const library = h.library();
  const meta = library.metadata[path] ?? { tags: [], alt: "" };
  element.replaceChildren();
  element.append(button("Back to grid", () => {
    sheet.version++; sheet.path = undefined; sheet.focus = undefined; element.hidden = true;
    grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus();
    if (!h.modal) dialog.scrollTop = 0;
  }));
  renderMetadataForm(element, h, path, data, meta, library.collections, () => version === sheet.version && sheet.path === path);
  if (library.keep?.includes(path)) {
    element.querySelector(".media-library__detail-name + p")?.after(node("p", "media-library__keep-note", "Always keep: Clean up never suggests this file."));
  }
  renderUsageList(element, h, library.usage[path]);
  renderFileActions(element, h, path, data);
  if (h.pick.onPick) renderPickerInsertion(element, h, h.pick.onPick, path, data, meta, library.items.map((item) => item.path));
  h.sync();
  const requestedFocus = background ? sheet.focus?.path === path ? sheet.focus.active : undefined : initiatingFocus;
  if (requestedFocus !== undefined && (document.activeElement === requestedFocus ||
    document.activeElement === document.body && (!requestedFocus?.isConnected || !requestedFocus.getClientRects().length))) {
    element.querySelector<HTMLElement>("button")?.focus();
  }
  if (sheet.focus?.path === path) sheet.focus = undefined;
}

let fieldIds = 0;

/** Default alt text, Decorative and the file's collections; `current` says whether this sheet is still open. */
function renderMetadataForm(
  sheet: HTMLElement, { task, adapter, refresh, tell }: Pick<DetailHost, "task" | "adapter" | "refresh" | "tell">,
  path: string, data: MediaBytes, meta: MediaMetadata, collections: string[], current: () => boolean,
) {
  const preview = node("img", "media-library__preview"); preview.src = data.url; preview.alt = meta.alt;
  sheet.append(preview, node("h3", "media-library__detail-name", basename(path)),
    node("p", "media-library__muted", `${data.width ? `${data.width} × ${data.height} · ` : ""}${formatBytes(data.blob.size)} · ${path}`));
  const alt = input("Default alt text", "text"); alt.value = meta.alt;
  const decorative = input("Decorative", "checkbox"); decorative.checked = Boolean(meta.decorative);
  decorative.addEventListener("change", () => { if (decorative.checked) alt.value = ""; });
  alt.addEventListener("input", () => { if (alt.value) decorative.checked = false; });
  if (!meta.alt && !meta.decorative) sheet.append(node("p", "media-library__hint", "Not described yet"));
  // Collections work like tags (ticket 15): tick the ones the file is in, or name a new one.
  const group = node("fieldset", "media-library__memberships");
  group.append(node("legend", "", "Collections"));
  const ticks = collections.map(name => {
    const box = input(name, "checkbox"); box.checked = meta.tags.includes(name); box.name = "media-collection-member";
    box.value = name; box.dataset.formKey = `collection:${name}`;
    group.append(check(name, box)); return box;
  });
  if (!collections.length) group.append(node("p", "media-library__muted", "No collections yet."));
  const fresh = input("New collection", "text"); fresh.placeholder = "Name a new collection"; fresh.autocomplete = "off";
  const problem = node("p", "media-library__problem"); problem.id = `media-detail-collection-${++fieldIds}`;
  problem.setAttribute("aria-live", "polite"); fresh.setAttribute("aria-describedby", problem.id);
  fresh.addEventListener("input", () => {
    problem.textContent = fresh.value.trim() ? mediaCollectionNameMessage(collections, fresh.value) ?? "" : "";
  });
  group.append(field("New collection", fresh), problem);
  sheet.append(node("h3", "media-library__metadata-title", "Image metadata"), field("Default alt text", alt),
    node("p", "media-library__hint", "Places using this description are updated. Places with their own words are kept."),
    field("Decorative", decorative), group, button("Save metadata", () => void task(async () => {
      if (!current()) return;
      const chosen = detailCollections(collections, collections.filter((_, index) => ticks[index].checked), fresh.value);
      if ("problem" in chosen) { problem.textContent = chosen.problem; fresh.focus(); return; }
      await adapter.metadata({ [path]: { alt: alt.value, tags: chosen.tags, decorative: decorative.checked } });
      await refresh(); tell("Description and collections saved as a draft.");
    })));
}

/** The pages that use the image, and the source files that mention it. */
function renderUsageList(
  sheet: HTMLElement, { task, adapter, close }: Pick<DetailHost, "task" | "adapter" | "close">,
  usage: MediaUsage | undefined,
) {
  sheet.append(node("h3", "", `Used on ${usage?.pages.length ?? 0} pages`));
  for (const page of usage?.pages ?? []) sheet.append(button(page, () => void task(async () => { await adapter.openPage(page); close(); }), "media-library__page"));
  if (!usage?.pages.length) sheet.append(node("p", "media-library__muted", "No page references found."));
  if (usage?.files.length) {
    const refs = node("details"); refs.append(node("summary", "", `References in ${usage.files.length} source files`));
    for (const file of usage.files) refs.append(node("p", "media-library__hint", file)); sheet.append(refs);
  }
}

/** Rename, Copy path, Optimise and Delete for one image. */
function renderFileActions(
  sheet: HTMLElement,
  { task, adapter, cache, refresh, tell, optimise, remove }: Pick<DetailHost, "task" | "adapter" | "cache" | "refresh" | "tell" | "optimise" | "remove">,
  path: string, data: MediaBytes,
) {
  const name = input("New image filename", "text"); name.value = basename(path);
  sheet.append(field("Filename", name), button("Rename", () => void task(async () => {
    await adapter.rename(path, name.value); cache.clear(); await refresh(); sheet.hidden = true; tell("Image renamed and references updated as drafts.");
  })), button("Copy path", () => void task(async () => {
    await navigator.clipboard.writeText(`/${path}`); tell("Image path copied.");
  })), button("Optimise image…", () => optimise(
    [new File([data.blob], path, { type: data.blob.type || uploadImageType(path) })], true, new Map([[path, data.version]]),
  )), button("Delete image…", () => remove([path])));
}

/** The picker's alt for this insertion, the markup it writes, and Use image. */
function renderPickerInsertion(
  sheet: HTMLElement, { pick, task, close }: Pick<DetailHost, "pick" | "task" | "close">,
  onPick: NonNullable<MediaPickerOptions["onPick"]>, path: string, data: MediaBytes, meta: MediaMetadata, paths: string[],
) {
  const insertionAlt = input("Alt text for insertion", "text");
  insertionAlt.value = pick.initialAlt ??
    (meta.decorative ? "" : meta.alt || basename(path).replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  const image: MediaImage = { path, width: data.width, height: data.height, alt: insertionAlt.value, variants: mediaVariants(path, paths) };
  const code = node("pre", "media-library__code", mediaImageMarkup(image));
  insertionAlt.addEventListener("input", () => { image.alt = insertionAlt.value; code.textContent = mediaImageMarkup(image); });
  sheet.append(field("Alt text for this insertion", insertionAlt), code, button("Use image", () => void task(async () => {
    await onPick(image); close();
  }), "button"));
}
