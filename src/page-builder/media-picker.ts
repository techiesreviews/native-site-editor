import { button, node } from "../ui/dom";
import { formatBytes, uploadImageType, WARN_IMAGE_BYTES } from "../uploads";
import { cleanMediaTags, type MediaMetadata, type MediaMetadataMap } from "./media-metadata";
import { mediaImageMarkup, mediaVariants, type MediaImage } from "./media-markup";
import { DEFAULT_MEDIA_OPTIMISE, mediaSavings, optimiseMedia, type MediaOptimiseOptions, type MediaOptimiseResult } from "./media-optimise";
import type { MediaUsage } from "./media-references";
import "./media-picker.css";

export interface MediaLibraryItem { path: string; size?: number; date?: number; draft?: boolean }
export interface MediaLibrary {
  key: string; items: MediaLibraryItem[]; metadata: MediaMetadataMap; usage: Record<string, MediaUsage>;
}
export interface MediaPickerHost {
  begin?(): void;
  load(): Promise<MediaLibrary>;
  blob(path: string): Promise<Blob>;
  metadata(changes: Record<string, Partial<MediaMetadata> | null>): Promise<void>;
  upload(file: File, result: MediaOptimiseResult, folder: string): Promise<string>;
  rename(path: string, name: string): Promise<void>;
  remove(paths: string[], unusedOnly?: boolean): Promise<void>;
  import?(requests: MediaImportRequest[]): Promise<string[]>;
  rewrite(from: string, to: string): Promise<void>;
  openPage(path: string): Promise<void>;
}
export interface MediaImportRequest {
  file: File; result: MediaOptimiseResult; folder: string;
  replaceFrom?: string; metadata?: MediaMetadata;
}
export interface MediaPickerOptions {
  onPick?: (image: MediaImage) => void | Promise<void>;
  /** MIME types, extensions or image/*, like a native file input's accept. */
  accept?: string;
  files?: File[];
}
let host: MediaPickerHost | undefined;
let closeActive: (() => void) | undefined;
export function configureMediaPicker(value: MediaPickerHost) { closeActive?.(); host = value; }
export function closeMediaPicker() { closeActive?.(); }

function accepts(path: string, accept?: string) {
  if (!accept) return true;
  const type = uploadImageType(path) ?? "";
  return accept.split(",").some((part) => {
    const value = part.trim().toLowerCase();
    return value.startsWith(".") ? path.toLowerCase().endsWith(value) : value.endsWith("/*") ? type.startsWith(value.slice(0, -1)) : type === value;
  });
}

/** Shared picker for image slots. All writes stay behind the workspace adapter. */
export async function openMediaPicker(options: MediaPickerOptions = {}): Promise<void> {
  closeActive?.();
  if (!host) throw new Error("Open a repository before choosing an image.");
  const adapter: MediaPickerHost = host;
  adapter.begin?.();
  const dialog = node("dialog", "media-library");
  dialog.setAttribute("aria-labelledby", "media-library-title");
  const header = node("header", "media-library__header");
  const heading = node("div");
  const title = node("h2", "", options.onPick ? "Choose image" : "Images");
  title.id = "media-library-title";
  heading.append(title, node("p", "media-library__muted", "Repository images · Changes stay as drafts until Save."));
  const uploadInput = node("input");
  uploadInput.type = "file"; uploadInput.name = "media-upload"; uploadInput.accept = "image/*,.heic,.heif"; uploadInput.multiple = true; uploadInput.hidden = true;
  uploadInput.className = "media-library__upload-input";
  uploadInput.setAttribute("aria-label", "Upload images");
  const uploadButton = button("Upload images…", () => uploadInput.click());
  const closeButton = button("Close", () => dialog.close());
  header.append(heading, uploadButton, closeButton, uploadInput);
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
    for (const item of library.items.filter((item) => selected.has(item.path))) {
      const blob = await adapter.blob(item.path);
      if (blob.size >= WARN_IMAGE_BYTES) files.push(new File([blob], item.path, { type: blob.type || uploadImageType(item.path) }));
    }
    if (!files.length) { tell("No selected images are above 2 MB."); return; }
    showOptimise(files, true);
  }));
  const deleteButton = button("Delete unused", () => confirmDelete([...selected].filter((path) => !library.usage[path]?.files.length), true));
  bulk.append(bulkCount, bulkTags, tagButton, optimiseButton, deleteButton, button("Clear", () => { selected.clear(); draw(); }));
  const grid = node("div", "media-library__grid"); grid.setAttribute("aria-label", "Image library");
  const sheet = node("aside", "media-library__sheet"); sheet.hidden = true;
  browse.append(summary, bulk, grid); body.append(browse, sheet);
  const message = node("p", "media-library__message"); message.setAttribute("role", "status");
  const footer = node("footer", "media-library__footer", "Drop images anywhere here · Enter opens details · Arrow keys browse · Esc closes");
  dialog.append(header, toolbar, chips, body, message, footer);
  document.body.append(dialog); dialog.showModal(); search.focus();
  let alive = true;
  let library: MediaLibrary;
  let tag = "";
  const selected = new Set<string>();
  const urls = new Set<string>();
  const assets = new Map<string, Promise<{ url: string; blob: Blob; width?: number; height?: number }>>();
  let detailVersion = 0;
  let optimisation: AbortController | undefined;
  let busy = false;
  const close = () => dialog.close(); closeActive = close;
  dialog.addEventListener("close", () => {
    alive = false; detailVersion++; optimisation?.abort(); urls.forEach((url) => URL.revokeObjectURL(url));
    if (closeActive === close) closeActive = undefined;
    dialog.remove();
  }, { once: true });
  function tell(text: string) { if (alive) message.textContent = text; }
  async function task(work: () => Promise<void>) {
    if (busy || !alive) return;
    busy = true; dialog.setAttribute("aria-busy", "true");
    try { await work(); } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) tell(error instanceof Error ? error.message : "The image change could not be made."); }
    finally { busy = false; dialog.removeAttribute("aria-busy"); }
  }
  function objectUrl(blob: Blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; }
  function asset(path: string) {
    let pending = assets.get(path);
    if (!pending) {
      pending = adapter!.blob(path).then(async (blob) => {
        if (!alive) throw new Error("Image library closed.");
        const url = objectUrl(blob);
        const image = new Image(); image.src = url;
        await image.decode().catch(() => undefined);
        return { url, blob, width: image.naturalWidth || undefined, height: image.naturalHeight || undefined };
      });
      assets.set(path, pending);
    }
    return pending;
  }
  async function refresh() {
    library = await adapter!.load();
    if (!alive) return;
    for (const path of [...selected]) if (!library.items.some((item) => item.path === path)) selected.delete(path);
    const folder = folders.value;
    folders.replaceChildren(new Option("All folders", ""), ...[...new Set(library.items.map((item) => parent(item.path)))].sort().map((path) => new Option(path || "Repository root", path || "/")));
    folders.value = folder;
    if (folders.selectedIndex < 0) folders.selectedIndex = 0;
    draw();
  }
  function draw() {
    if (!alive || !library) return;
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
      card.append(node("h3", "media-library__name", basename(item.path)), node("p", "media-library__folder", parent(item.path) || "Repository root"));
      const meta = node("p", "media-library__stats", item.size === undefined ? "Reading image…" : formatBytes(item.size));
      card.append(meta);
      const tags = node("div", "media-library__tags");
      for (const value of library.metadata[item.path]?.tags ?? []) tags.append(node("span", "media-library__tag", value));
      if (item.draft) tags.append(node("span", "media-library__tag", "Draft")); card.append(tags);
      const usage = library.usage[item.path];
      const used = button(`Used on ${usage?.pages.length ?? 0} pages`, () => void showDetail(item.path, true), "media-library__usage"); card.append(used);
      grid.append(card);
      // Observe thumbnails rather than downloading the whole repository on open.
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void asset(item.path).then((data) => {
          if (!alive || !card.isConnected) return;
          image.src = data.url;
          item.size = data.blob.size;
          meta.textContent = `${data.width ? `${data.width} × ${data.height} · ` : "Dimensions unavailable · "}${formatBytes(data.blob.size)}`;
          if (data.blob.size >= WARN_IMAGE_BYTES) { meta.classList.add("media-library__heavy"); meta.append(node("span", "", " · Heavy")); }
        }).catch(() => { if (alive && card.isConnected) meta.textContent = "Image unavailable"; });
      }, { root: browse, rootMargin: "200px" });
      observer.observe(card);
      dialog.addEventListener("close", () => observer.disconnect(), { once: true });
    }
  }
  async function showDetail(path: string, focusUsage = false) {
    optimisation?.abort();
    const version = ++detailVersion;
    sheet.hidden = false; sheet.replaceChildren(node("p", "media-library__muted", "Loading image…"));
    const data = await asset(path).catch((error) => { tell(String(error)); return undefined; });
    if (!alive || version !== detailVersion || !data) return;
    const meta = library.metadata[path] ?? { tags: [], alt: "" };
    sheet.replaceChildren();
    sheet.append(button("Back to grid", () => { detailVersion++; sheet.hidden = true; grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus(); }));
    const preview = node("img", "media-library__preview"); preview.src = data.url; preview.alt = meta.alt;
    sheet.append(preview, node("h3", "media-library__detail-name", basename(path)), node("p", "media-library__muted", `${data.width ? `${data.width} × ${data.height} · ` : ""}${formatBytes(data.blob.size)} · ${path}`));
    const alt = input("Default alt text", "text"); alt.value = meta.alt;
    const tags = input("Image tags", "text"); tags.value = meta.tags.join(", ");
    sheet.append(field("Default alt text", alt), node("p", "media-library__hint", "Offered on insertion. Empty alt text marks a decorative image. Existing page alt text stays independent."), field("Tags", tags), button("Save metadata", () => void task(async () => {
      await adapter.metadata({ [path]: { alt: alt.value, tags: tags.value.split(",") } }); await refresh(); tell("Tags and default alt text saved as a draft.");
    })));
    const usage = library.usage[path];
    const usageTitle = node("h3", "", `Used on ${usage?.pages.length ?? 0} pages`); usageTitle.tabIndex = -1;
    sheet.append(usageTitle);
    for (const page of usage?.pages ?? []) sheet.append(button(page, () => void task(async () => { await adapter.openPage(page); dialog.close(); }), "media-library__page"));
    if (!usage?.pages.length) sheet.append(node("p", "media-library__muted", "No page references found."));
    if (usage?.files.length) {
      const refs = node("details"); refs.append(node("summary", "", `References in ${usage.files.length} source files`));
      for (const file of usage.files) refs.append(node("p", "media-library__hint", file)); sheet.append(refs);
    }
    const name = input("New image filename", "text"); name.value = basename(path);
    sheet.append(field("Filename", name), button("Rename", () => void task(async () => {
      await adapter.rename(path, name.value); assets.clear(); await refresh(); sheet.hidden = true; tell("Image renamed and references updated as drafts.");
    })), button("Copy path", () => void task(async () => { await navigator.clipboard.writeText(`/${path}`); tell("Image path copied."); })), button("Optimise image…", () => showOptimise([new File([data.blob], path, { type: data.blob.type || uploadImageType(path) })], true)), button("Delete image…", () => confirmDelete([path])));
    if (options.onPick) {
      const insertionAlt = input("Alt text for insertion", "text"); insertionAlt.value = meta.alt || basename(path).replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const image: MediaImage = { path, width: data.width, height: data.height, alt: insertionAlt.value, variants: mediaVariants(path, library.items.map((item) => item.path)) };
      const code = node("pre", "media-library__code", mediaImageMarkup(image));
      insertionAlt.addEventListener("input", () => { image.alt = insertionAlt.value; code.textContent = mediaImageMarkup(image); });
      sheet.append(field("Alt text for this insertion", insertionAlt), code, button("Use image", () => void task(async () => {
        await options.onPick!(image); dialog.close();
      }), "button"));
    }
    if (focusUsage) usageTitle.focus(); else sheet.querySelector<HTMLElement>("button")?.focus();
  }
  function confirmDelete(paths: string[], unusedOnly = false) {
    optimisation?.abort();
    detailVersion++; sheet.hidden = false; sheet.replaceChildren();
    if (!paths.length) { sheet.append(node("p", "", "None of the selected images are unused. References in components and CSS also count.")); return; }
    const pages = new Set(paths.flatMap((path) => library.usage[path]?.pages ?? []));
    sheet.append(node("h3", "", `Delete ${paths.length} ${paths.length === 1 ? "image" : "images"}?`), node("p", "", pages.size ? `Used on ${pages.size} pages. Their references will break if you delete these images.` : "These images have no page usage. Check any component and CSS references below."));
    for (const path of paths) sheet.append(node("p", "media-library__hint", `${path}${library.usage[path]?.files.length ? ` · Referenced by ${library.usage[path].files.join(", ")}` : " · No source references"}`));
    sheet.append(node("p", "media-library__muted", "Deletion stays a draft until Save. Restore a repository image from the Files panel."), button("Cancel", () => { sheet.hidden = true; }), button("Delete images", () => void task(async () => { await adapter.remove(paths, unusedOnly); await refresh(); sheet.hidden = true; tell("Images deleted as drafts."); })));
  }
  function showOptimise(files: File[], existing = false) {
    optimisation?.abort();
    detailVersion++; sheet.hidden = false; sheet.replaceChildren();
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
        requests.push({ ...item, folder, metadata: existing ? library.metadata[item.file.name] : undefined, replaceFrom: existing && update.checked ? item.file.name : undefined });
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
    }));
    for (const control of [width, quality, format, responsive, original]) control.addEventListener("input", () => { prepareVersion++; optimisation?.abort(); prepared = []; add.disabled = true; results.replaceChildren(); });
    sheet.append(prepare, results, add, button("Cancel", () => { detailVersion++; optimisation?.abort(); sheet.hidden = true; }));
    width.focus();
  }
  search.addEventListener("input", draw); folders.addEventListener("change", draw); sort.addEventListener("change", draw);
  grid.addEventListener("keydown", (event) => {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>(".media-library__thumbnail")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const columns = Math.max(1, Math.round(grid.clientWidth / (buttons[at].closest("article")!.getBoundingClientRect().width + 16)));
    const jump = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key];
    if (jump !== undefined) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, at + jump))]?.focus(); }
  });
  uploadInput.addEventListener("change", () => { const files = [...(uploadInput.files ?? [])]; uploadInput.value = ""; if (files.length && library && !busy) showOptimise(files); });
  dialog.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } });
  dialog.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return; event.preventDefault();
    if (library && !busy) showOptimise([...event.dataTransfer.files]);
  });
  await task(async () => { summary.textContent = "Reading repository images and references…"; await refresh(); if (options.files?.length && alive) showOptimise(options.files); });
}

const parent = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const basename = (path: string) => path.split("/").pop()!;
function input(label: string, type: string) { const control = node("input"); control.type = type; control.name = label.toLowerCase().replace(/\s+/g, "-"); control.setAttribute("aria-label", label); return control; }
function select(label: string, choices: string[][]) { const control = node("select"); control.name = label.toLowerCase().replace(/\s+/g, "-"); control.setAttribute("aria-label", label); for (const [value, text] of choices) control.append(new Option(text, value)); return control; }
function field(label: string, control: HTMLElement) { const wrap = node("label", "media-library__field"); wrap.append(node("span", "", label), control); return wrap; }
function check(label: string, control: HTMLInputElement) { const wrap = node("label", "media-library__check"); wrap.append(control, node("span", "", label)); return wrap; }
