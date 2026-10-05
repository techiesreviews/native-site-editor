import { setIcon } from "../icons";
import { rowActions } from "../components/row-actions";
import { button, node } from "../ui/dom";
import { formatBytes, uploadImageType, WARN_IMAGE_BYTES } from "../uploads";
import { cleanMediaTags, type MediaMetadata, type MediaMetadataMap } from "./media-metadata";
import { mediaImageMarkup, mediaVariants, type MediaImage } from "./media-markup";
import { DEFAULT_MEDIA_OPTIMISE, mediaSavings, optimiseMedia, type MediaOptimiseOptions, type MediaOptimiseResult } from "./media-optimise";
import type { MediaUsage } from "./media-references";
import "./media-picker.css";
import type { MediaLibrary, MediaPickerHost, MediaPickerOptions, MediaImportRequest } from "./media-picker";

export interface MediaLibraryView {
  element: HTMLElement;
  ready: Promise<void>;
  readonly refreshedKey: string | undefined;
  refresh(): Promise<void>;
  dispose(): void;
}
let viewId = 0;

function accepts(path: string, accept?: string) {
  if (!accept) return true;
  const type = uploadImageType(path) ?? "";
  return accept.split(",").some((part) => {
    const value = part.trim().toLowerCase();
    return value.startsWith(".") ? path.toLowerCase().endsWith(value) : value.endsWith("/*") ? type.startsWith(value.slice(0, -1)) : type === value;
  });
}

export function createMediaLibraryView(container: HTMLElement, adapter: MediaPickerHost, options: MediaPickerOptions & { refreshKey?: () => string } = {}, modal?: HTMLDialogElement): MediaLibraryView {
  adapter.begin?.();
  const dialog = modal ?? node("section", "media-library media-library--pane");
  const close = () => { if (modal) modal.close(); };
  const header = node("header", "media-library__header");
  const heading = node("div");
  const title = node("h2", "", options.onPick ? "Choose image" : "Images");
  title.id = `media-library-title-${++viewId}`;
  dialog.setAttribute("aria-labelledby", title.id);
  if (!modal) dialog.setAttribute("role", "region");
  heading.append(title, node("p", "media-library__muted", modal ? "Repository images · Changes stay as drafts until Save." : "Changes stay as drafts until Save."));
  const uploadInput = node("input");
  uploadInput.type = "file"; uploadInput.name = "media-upload"; uploadInput.accept = "image/*,.heic,.heif"; uploadInput.multiple = true; uploadInput.hidden = true;
  uploadInput.className = "media-library__upload-input";
  uploadInput.setAttribute("aria-label", "Upload images");
  const uploadButton = button("Upload images…", () => uploadInput.click());
  const closeButton = cancellation("Close", close);
  header.append(heading, uploadButton);
  if (modal) header.append(closeButton);
  header.append(uploadInput);
  const toolbar = node("div", "media-library__toolbar");
  const search = node("input"); search.type = "search"; search.name = "media-search";
  search.placeholder = "Search name, tag or alt text…"; search.setAttribute("aria-label", "Search images");
  const folders = select("Folder", [["", "All folders"]]);
  const sort = select("Sort images", [["name", "Name"], ["date", "Newest drafts"], ["size", "Largest first"]]);
  toolbar.append(search, folders, sort);
  const chips = node("div", "media-library__chips"); chips.setAttribute("aria-label", "Filter by tag");
  const body = node("div", "media-library__body");
  const browse = node("section", "media-library__browse");
  const summary = node("p", "media-library__muted"); summary.setAttribute("role", "status");
  const bulk = node("div", "media-library__bulk"); bulk.hidden = true;
  const bulkCount = node("span");
  const bulkTags = input("Tags for selected images", "text"); bulkTags.placeholder = "Add tags, comma separated";
  const tagButton = button("Tag selected", () => void task(async () => {
    const changes: Record<string, Partial<MediaMetadata>> = {};
    for (const path of selected) changes[path] = { tags: cleanMediaTags([...(library.metadata[path]?.tags ?? []), ...bulkTags.value.split(",")]) };
    await adapter.metadata(changes); await refresh();
  }));
  const optimiseButton = button("Optimise heavy", () => void task(async () => {
    const files: File[] = [];
    const receipts = new Map<string, string | undefined>();
    for (const item of library.items.filter((item) => selected.has(item.path))) {
      const version = item.version;
      const blob = await adapter.blob(item.path);
      if (!alive) return;
      if (blob.size >= WARN_IMAGE_BYTES) { files.push(new File([blob], item.path, { type: blob.type || uploadImageType(item.path) })); receipts.set(item.path, version); }
    }
    if (!files.length) { tell("No selected images are above 2 MB."); return; }
    showOptimise(files, true, receipts);
  }));
  const deleteButton = button("Delete unused", () => confirmDelete([...selected].filter((path) => !library.usage[path]?.files.length), true));
  bulk.append(bulkCount, bulkTags, tagButton, optimiseButton, deleteButton, button("Clear", () => { selected.clear(); draw(); }));
  const grid = node("div", "media-library__grid"); grid.setAttribute("aria-label", "Image library");
  const sheet = node("aside", "media-library__sheet"); sheet.hidden = true;
  browse.append(summary, bulk, grid); body.append(browse, sheet);
  const message = node("p", "media-library__message"); message.setAttribute("role", "status");
  const footer = node("footer", "media-library__footer", `Drop images anywhere here · Enter opens details · Arrow keys browse${modal ? " · Esc closes" : ""}`);
  dialog.append(header, toolbar, chips, body, message, footer);
  container.append(dialog);
  if (modal) { modal.showModal(); search.focus(); }
  let alive = true;
  const listeners = new AbortController();
  let library: MediaLibrary;
  let tag = "";
  const selected = new Set<string>();
  const urls = new Set<string>();
  const assets = new Map<string, Promise<{ url: string; blob: Blob; width?: number; height?: number; version?: string }>>();
  let detailVersion = 0;
  let detailPath: string | undefined;
  let pendingDetailFocus: { path: string; active: Element | null } | undefined;
  let optimisation: AbortController | undefined;
  let busy = false;
  let pendingTasks = 0;
  let cancellableTask = false;
  let refreshVersion = 0;
  let loadingLibrary = false;
  let refreshedKey: string | undefined;
  const observers = new Set<IntersectionObserver>();
  function dispose() {
    if (!alive) return;
    alive = false; detailVersion++; optimisation?.abort(); listeners.abort();
    observers.forEach((observer) => observer.disconnect()); observers.clear();
    urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); assets.clear();
    modal?.removeEventListener("close", dispose);
    dialog.replaceChildren(); dialog.remove();
  }
  modal?.addEventListener("close", dispose, { once: true });
  function tell(text: string) { if (alive) message.textContent = text; }
  async function task(work: () => Promise<void>, lock = true, canCancel = false) {
    if (!alive) return;
    if (lock && loadingLibrary) { tell("Repository images are refreshing. Wait for them to finish before making a change."); return; }
    if (busy) { tell("An image change is in progress. Wait for it to finish before making another change."); return; }
    if (lock) { busy = true; cancellableTask = canCancel; }
    pendingTasks++; dialog.setAttribute("aria-busy", "true");
    setBusyControls();
    try { await work(); } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) tell(error instanceof Error ? error.message : "The image change could not be made."); }
    finally {
      if (lock) { busy = false; cancellableTask = false; }
      pendingTasks--;
      if (!pendingTasks) dialog.removeAttribute("aria-busy");
      setBusyControls();
    }
  }
  function cancellation(label: string, action: () => void) {
    const control = button(label, action); control.dataset.mediaCancel = label === "Close" ? "close" : "cancel"; return control;
  }
  function canUseCancellation(control: Element) {
    return control.getAttribute("data-media-cancel") === "close" || cancellableTask && control.hasAttribute("data-media-cancel");
  }
  function setBusyControls() {
    for (const control of dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select")) {
      if (busy && !canUseCancellation(control)) control.setAttribute("aria-disabled", "true"); else control.removeAttribute("aria-disabled");
      if (control instanceof HTMLInputElement && control.type !== "checkbox" && control.type !== "file") control.readOnly = busy;
    }
  }
  dialog.addEventListener("click", event => {
    if (!busy || !(event.target instanceof Element) || canUseCancellation(event.target.closest("button,input,select") ?? event.target) || !event.target.closest("button,input,select")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    tell("An image change is in progress. Wait for it to finish before making another change.");
  }, { capture: true, signal: listeners.signal });
  dialog.addEventListener("keydown", event => {
    if (!busy || event.target instanceof Element && canUseCancellation(event.target.closest("button,input,select") ?? event.target) || !["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && !(event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    tell("An image change is in progress. Wait for it to finish before making another change.");
  }, { capture: true, signal: listeners.signal });
  function objectUrl(blob: Blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; }
  function asset(path: string) {
    let pending = assets.get(path);
    if (!pending) {
      const version = library.items.find((item) => item.path === path)?.version;
      pending = adapter!.blob(path).then(async (blob) => {
        if (!alive) throw new Error("Image library closed.");
        const url = objectUrl(blob);
        const image = new Image(); image.src = url;
        await image.decode().catch(() => undefined);
        return { url, blob, width: image.naturalWidth || undefined, height: image.naturalHeight || undefined, version };
      });
      assets.set(path, pending);
    }
    return pending;
  }
  async function refresh() {
    if (!alive) return;
    const request = ++refreshVersion;
    const inputKey = options.refreshKey?.();
    // Refreshing repository sources must not erase an unfinished metadata form.
    const previous = library;
    const previousPath = detailPath;
    const detailIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify([
      value?.metadata[path] ?? { tags: [], alt: "" }, value?.usage[path],
      value?.items.find(item => item.path === path)?.version,
    ]);
    const metadataIdentity = (value: MediaLibrary | undefined, path: string) => JSON.stringify(value?.metadata[path] ?? { tags: [], alt: "" });
    loadingLibrary = true;
    if (!sheet.hidden && sheet.dataset.mode === "delete") {
      const active = document.activeElement;
      const returnPath = sheet.dataset.deletePath;
      const restoreBrowseFocus = active instanceof Element && sheet.contains(active);
      detailVersion++; sheet.hidden = true; delete sheet.dataset.mode;
      if (restoreBrowseFocus && (document.activeElement === active || document.activeElement === document.body)) grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(returnPath ?? "")}"] button`)?.focus();
      tell("Repository images are refreshing. Reopen Delete after the refresh to check current references.");
    }
    let next: MediaLibrary;
    try { next = await adapter.load(); }
    catch (error) { if (request === refreshVersion) pendingDetailFocus = undefined; throw error; }
    finally { if (request === refreshVersion) loadingLibrary = false; }
    if (!alive || request !== refreshVersion) return;
    for (const item of next.items) {
      if (library?.items.find((old) => old.path === item.path)?.version !== item.version) assets.delete(item.path);
    }
    library = next;
    refreshedKey = inputKey;
    for (const path of [...selected]) if (!library.items.some((item) => item.path === path)) selected.delete(path);
    const folder = folders.value;
    folders.replaceChildren(new Option("All folders", ""), ...[...new Set(library.items.map((item) => parent(item.path)))].sort().map((path) => new Option(path || "Repository root", path || "/")));
    folders.value = folder;
    if (folders.selectedIndex < 0) folders.selectedIndex = 0;
    draw();
    if (detailPath) {
      if (library.items.some((item) => item.path === detailPath)) {
        const path = detailPath;
        const rendered = sheet.querySelector<HTMLInputElement>('input[aria-label="Default alt text"]');
        if (path !== previousPath || !rendered || detailIdentity(previous, path) !== detailIdentity(library, path)) {
          const preserve = path === previousPath && rendered && metadataIdentity(previous, path) === metadataIdentity(library, path);
          const inputs = preserve ? [...sheet.querySelectorAll<HTMLInputElement>("input")].map(input => ({
            label: input.getAttribute("aria-label"), value: input.value,
            focused: input === document.activeElement, start: input.selectionStart, end: input.selectionEnd,
          })) : [];
          const active = document.activeElement;
          const focus = active instanceof HTMLElement && sheet.contains(active) ? {
            label: active.getAttribute("aria-label"), text: active instanceof HTMLButtonElement ? active.textContent : undefined,
            start: active instanceof HTMLInputElement ? active.selectionStart : null,
            end: active instanceof HTMLInputElement ? active.selectionEnd : null,
          } : undefined;
          await showDetail(path, false, true);
          if (alive && detailPath === path) {
            for (const saved of inputs) {
              const input = [...sheet.querySelectorAll<HTMLInputElement>("input")].find(input => input.getAttribute("aria-label") === saved.label);
              if (!input) continue;
              input.value = saved.value; input.dispatchEvent(new Event("input", { bubbles: true }));
            }
            // Metadata Undo changes values, but it must not strand keyboard focus.
            // A user who focused elsewhere during the read keeps that focus.
            if (focus && document.activeElement === document.body && !active?.isConnected) {
              const controls = [...sheet.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button")];
              const control = controls.find(control => focus.label ? control.getAttribute("aria-label") === focus.label : control instanceof HTMLButtonElement && control.textContent === focus.text) ?? controls[0];
              control?.focus();
              if (control instanceof HTMLInputElement && focus.start !== null && focus.end !== null) control.setSelectionRange(focus.start, focus.end);
            }
          }
        }
      }
      else { detailPath = undefined; sheet.hidden = true; sheet.replaceChildren(); }
    }
  }
  function draw() {
    if (!alive || !library) return;
    const active = document.activeElement;
    const card = active instanceof Element ? active.closest<HTMLElement>(".media-library__card") : null;
    const browseFocus = active instanceof HTMLButtonElement ? { path: card?.dataset.path, label: active.getAttribute("aria-label"), chip: active.classList.contains("media-library__chip") ? active.textContent : undefined, usage: active.classList.contains("media-library__usage") } : undefined;
    observers.forEach((observer) => observer.disconnect()); observers.clear();
    chips.replaceChildren();
    const allTags = [...new Set(Object.values(library.metadata).flatMap((entry) => entry.tags))].sort();
    if (tag && !allTags.includes(tag)) tag = "";
    for (const value of ["", ...allTags]) {
      const chip = button(value || "All images", () => { tag = value; draw(); }, "media-library__chip");
      chip.setAttribute("aria-pressed", String(tag === value)); chips.append(chip);
    }
    const query = search.value.trim().toLowerCase();
    const filtered = library.items.filter((item) => {
      const meta = library.metadata[item.path];
      return accepts(item.path, options.accept) && (!folders.value || parent(item.path) === (folders.value === "/" ? "" : folders.value)) &&
        (!tag || meta?.tags.includes(tag)) && `${item.path} ${meta?.alt ?? ""} ${meta?.tags.join(" ") ?? ""} ${library.usage[item.path]?.alts.join(" ") ?? ""}`.toLowerCase().includes(query);
    }).sort((a, b) => sort.value === "size" ? (b.size ?? 0) - (a.size ?? 0) || a.path.localeCompare(b.path) : sort.value === "date" ? (b.date ?? 0) - (a.date ?? 0) || a.path.localeCompare(b.path) : a.path.localeCompare(b.path));
    summary.textContent = `${filtered.length} of ${library.items.length} images${folders.value ? ` · ${folders.selectedOptions[0].text}` : " · All folders"}`;
    bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`;
    grid.replaceChildren();
    if (!filtered.length) grid.append(node("p", "media-library__empty", library.items.length ? "No matching images. Clear search or choose another filter." : "Your images belong here. Upload an image or drop one into the library."));
    for (const item of filtered) {
      const card = node("article", "media-library__card"); card.dataset.path = item.path;
      const thumb = button("", () => void showDetail(item.path), "media-library__thumbnail");
      thumb.setAttribute("aria-label", `Details for ${item.path}`);
      const image = node("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
      thumb.append(image);
      const format = node("span", "media-library__format", item.path.split(".").pop()?.toUpperCase() ?? "IMAGE"); thumb.append(format);
      const selectLabel = node("label", "media-library__select");
      const checkbox = input(`Select ${item.path}`, "checkbox"); checkbox.checked = selected.has(item.path);
      checkbox.addEventListener("change", () => { checkbox.checked ? selected.add(item.path) : selected.delete(item.path); bulk.hidden = !selected.size; bulkCount.textContent = `${selected.size} selected`; });
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
      const used = button("", () => void showDetail(item.path, true), "media-library__usage");
      setIcon(used, "dots-three");
      used.setAttribute("aria-label", usageLabel); used.title = usageLabel;
      rowActions(nameLine, [used]);
      grid.append(card);
      // Observe thumbnails rather than downloading the whole repository on open.
      const observer = new IntersectionObserver((entries) => {
        if (!alive || !card.isConnected || !entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void asset(item.path).then((data) => {
          if (!alive || !card.isConnected) return;
          image.src = data.url;
          item.size = data.blob.size;
          meta.textContent = `${data.width ? `${data.width} × ${data.height} · ` : "Dimensions unavailable · "}${formatBytes(data.blob.size)}`;
          if (data.blob.size >= WARN_IMAGE_BYTES) { meta.classList.add("media-library__heavy"); meta.append(node("span", "", " · Heavy")); }
        }).catch(() => { if (alive && card.isConnected) meta.textContent = "Image unavailable"; });
      }, { root: modal ? browse : dialog, rootMargin: "200px" });
      observers.add(observer); observer.observe(card);
    }
    setBusyControls();
    if (browseFocus && !pendingDetailFocus && document.activeElement === document.body && !active?.isConnected) {
      const replacement = [...dialog.querySelectorAll<HTMLButtonElement>(".media-library__grid button,.media-library__chip")].find(control => browseFocus.path ? control.closest<HTMLElement>(".media-library__card")?.dataset.path === browseFocus.path && (browseFocus.usage ? control.classList.contains("media-library__usage") : control.getAttribute("aria-label") === browseFocus.label) : browseFocus.chip !== undefined && control.classList.contains("media-library__chip") && control.textContent === browseFocus.chip);
      if (replacement?.getClientRects().length) replacement.focus();
    }
  }
  async function showDetail(path: string, focusUsage = false, background = false) {
    if (!alive) return;
    const initiatingFocus = document.activeElement;
    const initiatingInsideDetail = initiatingFocus instanceof Element && sheet.contains(initiatingFocus);
    if (!background) pendingDetailFocus = { path, active: initiatingFocus };
    const focusRequest = pendingDetailFocus;
    delete sheet.dataset.mode;
    optimisation?.abort();
    detailPath = path;
    const version = ++detailVersion;
    sheet.hidden = false; sheet.replaceChildren(node("p", "media-library__muted", "Loading image…"));
    if (!modal && !background) dialog.scrollTop = 0;
    if (loadingLibrary) return;
    const data = await asset(path).catch((error) => { tell(String(error)); return undefined; });
    if (!alive || version !== detailVersion || !data || !library.items.some((item) => item.path === path)) {
      if (pendingDetailFocus === focusRequest) pendingDetailFocus = undefined;
      if (alive && version === detailVersion && !data) {
        assets.delete(path); sheet.hidden = true; detailPath = undefined;
        if (document.activeElement === document.body || (!background || initiatingInsideDetail) && document.activeElement === initiatingFocus) grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus();
      }
      return;
    }
    if (loadingLibrary) return;
    const meta = library.metadata[path] ?? { tags: [], alt: "" };
    sheet.replaceChildren();
    sheet.append(button("Back to grid", () => { detailVersion++; detailPath = undefined; pendingDetailFocus = undefined; sheet.hidden = true; grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus(); if (!modal) dialog.scrollTop = 0; }));
    const preview = node("img", "media-library__preview"); preview.src = data.url; preview.alt = meta.alt;
    sheet.append(preview, node("h3", "media-library__detail-name", basename(path)), node("p", "media-library__muted", `${data.width ? `${data.width} × ${data.height} · ` : ""}${formatBytes(data.blob.size)} · ${path}`));
    const alt = input("Default alt text", "text"); alt.value = meta.alt;
    const tags = input("Image tags", "text"); tags.value = meta.tags.join(", ");
    sheet.append(node("h3", "media-library__metadata-title", "Image metadata"), field("Default alt text", alt), node("p", "media-library__hint", "Offered on insertion. Empty alt text marks a decorative image. Existing page alt text stays independent."), field("Tags", tags), button("Save metadata", () => void task(async () => {
      if (version !== detailVersion || detailPath !== path) return;
      await adapter.metadata({ [path]: { alt: alt.value, tags: tags.value.split(",") } }); await refresh(); tell("Tags and default alt text saved as a draft.");
    })));
    const usage = library.usage[path];
    const usageTitle = node("h3", "", `Used on ${usage?.pages.length ?? 0} pages`); usageTitle.tabIndex = -1;
    sheet.append(usageTitle);
    for (const page of usage?.pages ?? []) sheet.append(button(page, () => void task(async () => { await adapter.openPage(page); close(); }), "media-library__page"));
    if (!usage?.pages.length) sheet.append(node("p", "media-library__muted", "No page references found."));
    if (usage?.files.length) {
      const refs = node("details"); refs.append(node("summary", "", `References in ${usage.files.length} source files`));
      for (const file of usage.files) refs.append(node("p", "media-library__hint", file)); sheet.append(refs);
    }
    const name = input("New image filename", "text"); name.value = basename(path);
    sheet.append(field("Filename", name), button("Rename", () => void task(async () => {
      await adapter.rename(path, name.value); assets.clear(); await refresh(); sheet.hidden = true; tell("Image renamed and references updated as drafts.");
    })), button("Copy path", () => void task(async () => { await navigator.clipboard.writeText(`/${path}`); tell("Image path copied."); })), button("Optimise image…", () => showOptimise([new File([data.blob], path, { type: data.blob.type || uploadImageType(path) })], true, new Map([[path, data.version]]))), button("Delete image…", () => confirmDelete([path])));
    if (options.onPick) {
      const insertionAlt = input("Alt text for insertion", "text"); insertionAlt.value = options.initialAlt ?? (meta.alt || basename(path).replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
      const image: MediaImage = { path, width: data.width, height: data.height, alt: insertionAlt.value, variants: mediaVariants(path, library.items.map((item) => item.path)) };
      const code = node("pre", "media-library__code", mediaImageMarkup(image));
      insertionAlt.addEventListener("input", () => { image.alt = insertionAlt.value; code.textContent = mediaImageMarkup(image); });
      sheet.append(field("Alt text for this insertion", insertionAlt), code, button("Use image", () => void task(async () => {
        await options.onPick!(image); close();
      }), "button"));
    }
    setBusyControls();
    const requestedFocus = background ? pendingDetailFocus?.path === path ? pendingDetailFocus.active : undefined : initiatingFocus;
    if (requestedFocus !== undefined && (document.activeElement === requestedFocus || document.activeElement === document.body && (!requestedFocus?.isConnected || !requestedFocus.getClientRects().length))) {
      if (focusUsage) usageTitle.focus(); else sheet.querySelector<HTMLElement>("button")?.focus();
    }
    if (pendingDetailFocus?.path === path) pendingDetailFocus = undefined;
  }
  function confirmDelete(paths: string[], unusedOnly = false) {
    if (!alive) return;
    if (loadingLibrary) { tell("Repository images are refreshing. Wait for them to finish before deleting images."); return; }
    pendingDetailFocus = undefined;
    optimisation?.abort();
    detailVersion++; detailPath = undefined; sheet.hidden = false; sheet.replaceChildren();
    if (!paths.length) { sheet.append(node("p", "", "None of the selected images are unused. References in components and CSS also count.")); return; }
    sheet.dataset.mode = "delete"; sheet.dataset.deletePath = paths[0];
    const confirmationVersion = detailVersion;
    const pages = new Set(paths.flatMap((path) => library.usage[path]?.pages ?? []));
    sheet.append(node("h3", "", `Delete ${paths.length} ${paths.length === 1 ? "image" : "images"}?`), node("p", "", pages.size ? `Used on ${pages.size} pages. Their references will break if you delete these images.` : "These images have no page usage. Check any component and CSS references below."));
    for (const path of paths) sheet.append(node("p", "media-library__hint", `${path}${library.usage[path]?.files.length ? ` · Referenced by ${library.usage[path].files.join(", ")}` : " · No source references"}`));
    sheet.append(node("p", "media-library__muted", "Deletion stays a draft until Save. Restore a repository image from the Files panel."), cancellation("Cancel", () => { detailVersion++; sheet.hidden = true; delete sheet.dataset.mode; }), button("Delete images", () => void task(async () => { if (confirmationVersion !== detailVersion || sheet.dataset.mode !== "delete") { tell("This delete confirmation has expired. Open a new confirmation to review current image references."); return; }
      const thumbnails = [...grid.querySelectorAll<HTMLElement>(".media-library__thumbnail")];
      const deletedIndex = thumbnails.findIndex(control => paths.includes(control.closest<HTMLElement>(".media-library__card")!.dataset.path!));
      const initiatingFocus = document.activeElement;
      const restoreBrowseFocus = initiatingFocus instanceof Element && sheet.contains(initiatingFocus);
      await adapter.remove(paths, unusedOnly); sheet.hidden = true; delete sheet.dataset.mode; await refresh();
      if (restoreBrowseFocus && (document.activeElement === initiatingFocus || document.activeElement === document.body)) {
        const remaining = [...grid.querySelectorAll<HTMLElement>(".media-library__thumbnail")];
        const target = remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)] ?? grid;
        if (target === grid) grid.tabIndex = -1;
        target.focus();
      }
      tell("Images deleted as drafts."); })));
  }
  function showOptimise(files: File[], existing = false, receipts = new Map<string, string | undefined>()) {
    if (!alive) return;
    pendingDetailFocus = undefined;
    optimisation?.abort();
    detailVersion++; detailPath = undefined; sheet.hidden = false; sheet.replaceChildren();
    delete sheet.dataset.mode;
    const key = `native-site-editor:media-optimise:${library.key}`;
    let defaults = { ...DEFAULT_MEDIA_OPTIMISE };
    try { defaults = { ...defaults, ...JSON.parse(localStorage.getItem(key) ?? "{}") }; } catch { /* Defaults work without storage. */ }
    sheet.append(node("h3", "", "Optimise"), node("p", "media-library__muted", `${files.length} ${files.length === 1 ? "image" : "images"} · ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))} before`));
    const width = input("Maximum width", "number"); width.min = "1"; width.max = "10000"; width.value = String(defaults.maxWidth);
    const quality = input("Image quality", "number"); quality.min = "1"; quality.max = "100"; quality.value = String(defaults.quality);
    const format = select("Image format", [["webp", "WebP"], ["png", "PNG"], ["jpeg", "JPEG"]]); format.value = defaults.format;
    const responsive = input("Responsive sizes", "checkbox"); responsive.checked = defaults.responsive;
    const original = input("Keep original", "checkbox"); original.checked = defaults.keepOriginal;
    const update = input("Update existing references", "checkbox"); update.checked = true;
    const destination = input("Upload folder", "text"); destination.value = folders.value && folders.value !== "/" ? folders.value : "images";
    sheet.append(field("Max width (px)", width), field("Format", format), field("Quality", quality), check("Responsive sizes · 480 / 960 / 1600 px", responsive), check("Keep original bytes and metadata", original), node("p", "media-library__hint", "Re-encoding strips EXIF and GPS metadata for privacy. WebP keeps transparency; a smaller transparent PNG is kept instead. SVG/GIF stay untouched."));
    if (existing) sheet.append(check("Update references to the new files", update), node("p", "media-library__hint", "Optimised copies are new files. Originals stay available. Existing alt text and classes stay intact."));
    else sheet.append(field("Destination folder", destination));
    const results = node("div", "media-library__results");
    let prepared: { file: File; result: MediaOptimiseResult }[] = [];
    let prepareVersion = 0;
    const add = button(existing ? "Add optimised copies" : "Add to library", () => void task(async () => {
      const requests: MediaImportRequest[] = [];
      for (const item of prepared) {
        const folder = existing ? parent(item.file.name) : destination.value.trim().replace(/^\/+|\/+$/g, "");
        if (folder.split("/").some((part) => part === "." || part === "..") || folder.includes("\\")) throw new Error("Choose a repository folder without . or .. segments.");
        requests.push({ ...item, folder, metadata: existing ? library.metadata[item.file.name] : undefined, replaceFrom: existing && update.checked ? item.file.name : undefined, expectedAssetVersion: receipts.get(item.file.name) });
      }
      if (!adapter.import) throw new Error("Atomic image imports are unavailable. Refresh the editor and try again.");
      await adapter.import(requests);
      assets.clear(); await refresh(); sheet.hidden = true; tell("Images added as drafts. Choose an image to use it on the page.");
    }), "button"); add.disabled = true;
    const prepare = button("Preview optimisation", () => void task(async () => {
      if (!width.checkValidity() || !quality.checkValidity()) throw new Error("Enter a width from 1 to 10000 and quality from 1 to 100.");
      const settings: MediaOptimiseOptions = { maxWidth: Number(width.value), quality: Number(quality.value), format: format.value as MediaOptimiseOptions["format"], responsive: responsive.checked, keepOriginal: original.checked };
      try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Encoding still works without storage. */ }
      prepared = []; add.disabled = true; results.replaceChildren(node("p", "", "Optimising in your browser…"));
      optimisation?.abort();
      const controller = new AbortController(); optimisation = controller;
      const request = ++prepareVersion, panel = detailVersion;
      for (const file of files) {
        let result: MediaOptimiseResult;
        if (settings.keepOriginal) {
          // Even formats the browser cannot decode can be retained explicitly.
          result = { outputs: [{ blob: file, extension: file.name.split(".").pop()?.toLowerCase() ?? "bin" }], before: file.size, after: file.size, note: "Original bytes and metadata are kept. Unsupported formats may not display on the web." };
        } else result = await optimiseMedia(file, settings, controller.signal);
        if (!alive || panel !== detailVersion || request !== prepareVersion) return;
        prepared.push({ file, result });
      }
      results.replaceChildren();
      for (const { file, result } of prepared) {
        const preview = node("img", "media-library__preview"); preview.alt = ""; preview.src = objectUrl(result.outputs[0].blob);
        const savings = mediaSavings(result.before, result.after);
        results.append(preview, node("p", "", `${basename(file.name)} · ${formatBytes(result.before)} → ${formatBytes(result.after)}, ${savings >= 0 ? "−" : "+"}${Math.abs(savings)}%`), node("p", "media-library__hint", `${result.outputs.length - 1} responsive variants · ${formatBytes(result.outputs.reduce((sum, output) => sum + output.blob.size, 0))} total${result.note ? ` · ${result.note}` : " · Metadata stripped"}`));
      }
      add.disabled = false;
    }, true, true));
    for (const control of [width, quality, format, responsive, original]) control.addEventListener("input", () => { prepareVersion++; optimisation?.abort(); prepared = []; add.disabled = true; results.replaceChildren(); });
    sheet.append(prepare, results, add, cancellation("Cancel", () => { detailVersion++; optimisation?.abort(); sheet.hidden = true; }));
    width.focus();
  }
  search.addEventListener("input", draw, { signal: listeners.signal });
  folders.addEventListener("change", draw, { signal: listeners.signal });
  sort.addEventListener("change", draw, { signal: listeners.signal });
  grid.addEventListener("keydown", (event) => {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__thumbnail")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const columns = Math.max(1, Math.round(grid.clientWidth / (buttons[at].closest("article")!.getBoundingClientRect().width + 16)));
    const jump = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (jump !== undefined) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, at + jump))]?.focus(); }
  }, { signal: listeners.signal });
  uploadInput.addEventListener("change", () => { const files = [...(uploadInput.files ?? [])]; uploadInput.value = ""; if (files.length && busy) tell("An image change is in progress. Wait for it to finish before uploading images."); else if (files.length && library) showOptimise(files); else if (files.length) tell("Repository images are loading. Wait for them to finish before uploading images."); }, { signal: listeners.signal });
  dialog.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }, { signal: listeners.signal });
  dialog.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return; event.preventDefault();
    if (busy) tell("An image change is in progress. Wait for it to finish before uploading images."); else if (library) showOptimise([...event.dataTransfer.files]); else tell("Repository images are loading. Wait for them to finish before uploading images.");
  }, { signal: listeners.signal });
  const ready = task(async () => { summary.textContent = "Reading repository images and references…"; await refresh(); if (options.files?.length && alive) showOptimise(options.files); }, false);
  return { element: dialog, ready, get refreshedKey() { return refreshedKey; }, refresh: () => task(refresh, false), dispose };
}

const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const basename = (path: string) => path.split("/").pop()!;
function input(label: string, type: string) { const control = node("input"); control.type = type; control.name = label.toLowerCase().replace(/\s+/g, "-"); control.setAttribute("aria-label", label); return control; }
function select(label: string, choices: string[][]) { const control = node("select"); control.name = label.toLowerCase().replace(/\s+/g, "-"); control.setAttribute("aria-label", label); for (const [value, text] of choices) control.append(new Option(text, value)); return control; }
function field(label: string, control: HTMLElement) { const wrap = node("label", "media-library__field"); wrap.append(node("span", "", label), control); return wrap; }
function check(label: string, control: HTMLInputElement) { const wrap = node("label", "media-library__check"); wrap.append(control, node("span", "", label)); return wrap; }
