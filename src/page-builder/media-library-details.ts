import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { uploadImageType } from "../uploads";
import { input, field, check } from "./media-library-fields";
import { detailCollections, mediaCollectionNameMessage } from "./media-collection-choices";
import { basename, mediaKind } from "./media-library-filter";
import { canReplaceEverywhere, mediaDetailChanges, mediaDetailFacts, mediaMadeFrom, mediaFamilyRows, mediaNameCheck, mediaRenamedPath, type MediaNameCheck } from "./media-file-details";
import { isRenamableMedia, MediaNameTakenError } from "./media-names";
import { keepPageFocus, usageSections } from "./media-library-usage";
import { mediaUsageBadge, mediaUsageFor } from "./media-usage-text";
import type { LibrarySheet, LibrarySheetContext } from "./media-library-sheet";
import type { MediaBytes } from "./media-byte-cache";
import type { MediaMetadata } from "./media-metadata";

/** The view around File details, and the screens File details can open. */
export interface DetailHost extends LibrarySheetContext {
  dialog: HTMLElement;
  grid: HTMLElement;
  /** The picker modal; the Media pane has none. */
  modal: boolean;
  close: () => void;
  optimise: (files: File[], existing: boolean, receipts: Map<string, string | undefined>) => void;
  remove: (paths: string[]) => void;
}

/** Leave File details for the grid, focusing the file's tile. */
function backToGrid(sheet: LibrarySheet, h: DetailHost, path: string) {
  sheet.version++; sheet.path = undefined; sheet.focus = undefined; sheet.repaint = undefined;
  sheet.element.hidden = true; delete sheet.element.dataset.mode;
  h.grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus();
  if (!h.modal) h.dialog.scrollTop = 0;
}

/** Open File details of `path` (media-manager ticket 06, tiles.html): its own screen with Back,
 * a large preview beside grouped information on wide screens, stacked on phones.
 * A `background` open (a refresh) keeps focus where it is. */
export async function showMediaDetail(sheet: LibrarySheet, h: DetailHost, path: string, background = false) {
  const { element } = sheet, { dialog, grid, cache, tell } = h;
  if (!h.alive()) return;
  const initiatingFocus = document.activeElement;
  const initiatingInsideDetail = initiatingFocus instanceof Element && element.contains(initiatingFocus);
  if (!background) sheet.focus = { path, active: initiatingFocus };
  const focusRequest = sheet.focus;
  element.dataset.mode = "details";
  sheet.work?.abort(); sheet.repaint = undefined; sheet.redraw = undefined;
  sheet.path = path;
  const version = ++sheet.version;
  element.hidden = false; element.replaceChildren(node("p", "media-library__muted", "Loading file…"));
  if (!h.modal && !background) dialog.scrollTop = 0;
  if (h.loading()) return;
  const data = await cache.get(path).catch((error) => { tell(String(error)); return undefined; });
  if (!h.alive() || version !== sheet.version || !data || !h.library().items.some((item) => item.path === path)) {
    if (sheet.focus === focusRequest) sheet.focus = undefined;
    if (h.alive() && version === sheet.version && !data) {
      cache.drop(path); element.hidden = true; delete element.dataset.mode; sheet.path = undefined;
      if (document.activeElement === document.body ||
        (!background || initiatingInsideDetail) && document.activeElement === initiatingFocus)
        grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] button`)?.focus();
    }
    return;
  }
  if (h.loading()) return;
  const library = h.library();
  const meta = library.metadata[path] ?? { tags: [], alt: "" };
  const current = () => version === sheet.version && sheet.path === path;
  const head = node("header", "media-detail__head");
  const back = button("", () => backToGrid(sheet, h, path), "media-detail__back");
  back.setAttribute("aria-label", "Back"); back.append(icon("arrow-left", 20));
  head.append(back, node("h3", "", "File details"));
  const layout = node("div", "media-detail");
  // In the picker, Back returns to the grid with the file still chosen; Use places it.
  const info = node("div", "media-detail__info"), form = node("form", "media-detail__form"); form.dataset.detailForm = "";
  info.append(form);
  // Replace everywhere (slice 54): in the Media pane, for a picture's main; its screens load when asked for.
  const replace = !h.modal && h.adapter.replace && canReplaceEverywhere(path, library.items.map(item => item.path), library.metadata)
    ? () => void h.task(async () => {
      const { replaceEverywhere } = await import("./media-library-replace");
      if (current()) await replaceEverywhere(sheet, { ...h, details: to => showMediaDetail(sheet, h, to) }, path);
    }) : undefined;
  layout.append(renderPreview(h, path, data, meta, replace), info);
  element.replaceChildren(head, layout);
  renderInformation(form, sheet, h, path, data, meta, current);
  h.sync();
  const requestedFocus = background ? sheet.focus?.path === path ? sheet.focus.active : undefined : initiatingFocus;
  if (requestedFocus !== undefined && (document.activeElement === requestedFocus ||
    document.activeElement === document.body && (!requestedFocus?.isConnected || !requestedFocus.getClientRects().length))) {
    back.focus();
  }
  if (sheet.focus?.path === path) sheet.focus = undefined;
}

/** The complete picture (a clean surface with its type when there is none to draw), and the
 * file's actions under it. */
function renderPreview(
  { optimise, remove, task, tell }: Pick<DetailHost, "optimise" | "remove" | "task" | "tell">,
  path: string, data: MediaBytes, meta: MediaMetadata, replace?: () => void,
) {
  const view = node("div", "media-detail__view"), preview = node("figure", "media-detail__preview");
  const surface = () => {
    preview.classList.add("is-file");
    preview.replaceChildren(icon("file", 40), node("span", "media-library__format", path.split(".").pop()?.toUpperCase() ?? "FILE"));
  };
  if (mediaKind(path) === "image") {
    const image = node("img"); image.src = data.url; image.alt = meta.alt;
    image.addEventListener("error", surface, { once: true });
    preview.append(image);
  } else surface();
  const actions = node("div", "media-detail__actions");
  if (uploadImageType(path)) actions.append(button("Optimise image…", () => optimise(
    [new File([data.blob], path, { type: data.blob.type || uploadImageType(path) })], true, new Map([[path, data.version]]),
  )));
  if (replace) actions.append(button("Replace everywhere…", replace));
  actions.append(button("Copy path", () => void task(async () => {
    await navigator.clipboard.writeText(`/${path}`); tell("Path copied.");
  })), button("Remove file…", () => remove([path])));
  view.append(preview, actions);
  return view;
}

/** Expand/collapse section with its summary words; it stays open across background refreshes. */
function disclosure(part: string, title: string, summary: HTMLElement, body: HTMLElement[]) {
  const section = node("details", "media-detail__disclosure"); section.dataset.part = part;
  const head = node("summary"); head.append(node("strong", "", title), summary);
  section.append(head, ...body);
  return section;
}

let fieldIds = 0;

/** Name, facts, usage, the Image family, collections, description, Always keep, then Save and Cancel. */
function renderInformation(
  form: HTMLFormElement, sheet: LibrarySheet, h: DetailHost,
  path: string, data: MediaBytes, meta: MediaMetadata, current: () => boolean,
) {
  const { adapter, task, refresh, tell, cache } = h, library = h.library(), image = mediaKind(path) === "image";
  const item = library.items.find(entry => entry.path === path);
  const name = input("File name", "text"); name.value = basename(path); name.autocomplete = "off";
  name.autocapitalize = "none"; name.spellcheck = false;
  // Renaming renames the whole family and every mention (slice 52); kinds Media does not rename stay as they are.
  if (!isRenamableMedia(path)) name.disabled = true;
  const naming = renameField(name, path, library.items.map(entry => entry.path));
  const facts = node("dl", "media-detail__facts");
  for (const fact of [...mediaDetailFacts({ path, size: item?.size ?? data.blob.size, width: data.width, height: data.height }), ...mediaMadeFrom(meta)]) {
    const row = node("div"); row.append(node("dt", "", fact.label), node("dd", "", fact.value)); facts.append(row);
  }
  form.append(field("File name", name), naming.element, facts);
  // The Always keep mark (slice 49): on for this file, or for a copy or original in its family.
  if (library.keep?.includes(path)) form.append(node("p", "media-library__keep-note", "Always keep: Clean up never suggests this file."));
  // Usage from the site's usage check; newer results repaint it in place.
  const usageBody = node("div", "media-detail__uses"), usageWords = node("span");
  const usage = disclosure("usage", "Usage", usageWords, [usageBody]);
  const paintUsage = () => keepPageFocus(usageBody, () => {
    const records = adapter.usage?.records();
    usageWords.textContent = mediaUsageBadge(mediaUsageFor(records, path)).label;
    usageBody.replaceChildren(...usageSections(records, path,
      page => void task(async () => { await adapter.openPage(page); h.close(); }), page => adapter.usage?.pageLabel?.(page)));
  }, () => usage.querySelector("summary")!);
  paintUsage(); sheet.repaint = paintUsage;
  form.append(usage);
  const family = mediaFamilyRows(path, library.items);
  if (family?.length) {
    const rows = family.map(row => {
      const line = node("div", "media-detail__row");
      const label = node("span", "", `${basename(row.path)} · ${row.label}`);
      if (row.original) {
        // The kept original (ticket 07): fetched only when asked for, then saved under its own name.
        const name = basename(row.path);
        const open = button(name, () => void task(async () => {
          const blob = await adapter.blob(row.path);
          if (!h.alive()) return;
          const link = node("a"); link.href = cache.objectUrl(blob); link.download = name; link.click();
        }), "text-button media-detail__original");
        open.setAttribute("aria-label", `Download original ${name}`);
        label.replaceChildren(open, document.createTextNode(` · ${row.label}`));
      }
      line.append(label, node("span", "", row.size ?? ""));
      return line;
    });
    form.append(disclosure("family", "Copies and original", node("span", "", String(family.length)), rows));
  }
  // Collections work like tags (ticket 15, slice 16): tick the ones the file is in, or name a new one.
  const group = node("fieldset", "media-library__memberships media-detail__group");
  group.append(node("legend", "", "Collections"));
  const ticks = library.collections.map(collection => {
    const box = input(collection, "checkbox"); box.checked = meta.tags.includes(collection); box.name = "media-collection-member";
    box.value = collection; box.dataset.formKey = `collection:${collection}`;
    group.append(check(collection, box)); return box;
  });
  if (!library.collections.length) group.append(node("p", "media-library__muted", "No collections yet."));
  const fresh = input("New collection", "text"); fresh.placeholder = "Name a new collection"; fresh.autocomplete = "off";
  const problem = node("p", "media-library__problem"); problem.id = `media-detail-collection-${++fieldIds}`;
  problem.setAttribute("aria-live", "polite"); fresh.setAttribute("aria-describedby", problem.id);
  fresh.addEventListener("input", () => {
    problem.textContent = fresh.value.trim() ? mediaCollectionNameMessage(library.collections, fresh.value) ?? "" : "";
  });
  group.append(field("New collection", fresh), problem);
  form.append(group);
  const description = node("textarea"); description.name = "description"; description.setAttribute("aria-label", "Description");
  description.value = meta.alt; description.rows = 3;
  const decorative = input("Decorative", "checkbox"); decorative.checked = Boolean(meta.decorative);
  if (image) {
    // Decorative has no description; the words come back if it is unticked before saving. They are
    // held on the field, so a background refresh carries them (media-library-refresh.ts).
    const sync = () => { description.disabled = decorative.checked; };
    decorative.addEventListener("change", () => {
      if (decorative.checked) { if (description.value) description.dataset.kept = description.value; description.value = ""; }
      else if (!description.value) description.value = description.dataset.kept ?? "";
      sync();
    });
    description.addEventListener("input", () => { if (description.value) { decorative.checked = false; sync(); } });
    sync();
    const words = field("Description", description);
    if (!meta.alt && !meta.decorative) words.append(node("span", "media-library__hint", "Not described yet"));
    // By agent (ticket 13) until OK in To check, or Lex's own words saved here.
    if (meta.byAgent) words.append(node("span", "media-library__by-agent", "By agent: press OK in To check, or change the words here."));
    form.append(words, node("p", "media-library__hint", "Places using this description are updated. Places with their own words are kept."),
      check("Decorative", decorative));
  }
  const keep = input("Always keep", "checkbox"); keep.checked = Boolean(meta.alwaysKeep);
  // "Keep the old address working" is ticked for Always keep files (ticket 15) until Lex chooses.
  const memberKept = Boolean(library.keep?.includes(path)) && !meta.alwaysKeep;
  naming.follow(() => keep.checked || memberKept);
  keep.addEventListener("change", () => naming.follow(() => keep.checked || memberKept));
  form.append(check("Always keep", keep), node("p", "media-library__hint", "Never suggested for clean-up. For files used outside the site."));
  const footer = node("footer", "media-detail__foot");
  const save = button("Save details", () => undefined, "button primary"); save.type = "submit";
  const cancel = button("Cancel", () => backToGrid(sheet, h, path)); cancel.type = "button";
  footer.append(cancel, save);
  form.append(footer);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const checked = naming.paint();
    if (checked.state === "problem" || checked.state === "taken") { name.focus(); return; }
    const rename = checked.state === "free" ? { name: name.value.trim() } : undefined, forward = naming.forward();
    const chosen = detailCollections(library.collections, library.collections.filter((_, index) => ticks[index].checked), fresh.value);
    if ("problem" in chosen) { problem.textContent = chosen.problem; fresh.focus(); return; }
    void task(async () => {
      if (!current()) return;
      const changes = { ...mediaDetailChanges(path, {
        name: name.value, description: description.value, decorative: decorative.checked, alwaysKeep: keep.checked,
      }), tags: chosen.tags };
      // One step: a refused rename saves nothing. A host without it saves fields only.
      try {
        if (adapter.details) await adapter.details(path, changes, rename?.name, rename ? { keepOldAddress: forward } : undefined);
        else if (rename) throw new Error("Renaming is not available here.");
        else await adapter.metadata({ [path]: changes });
      } catch (error) {
        // A name taken by a file the list does not show: the field says so, with the next free one.
        if (!(error instanceof MediaNameTakenError) || !current()) throw error;
        naming.taken(error.taken, error.suggestion); name.focus(); return;
      }
      if (!rename) { await refresh(); tell("Details saved as a draft."); return; }
      cache.clear(); await refresh();
      const to = mediaRenamedPath(path, rename.name);
      if (h.alive() && h.library().items.some(entry => entry.path === to)) await showMediaDetail(sheet, h, to);
      tell(`Details saved and the file renamed, with its uses updated, as drafts.${forward ? " Its old address forwards to the new one." : ""}`);
    });
  });
}

/** Under the File name field (ticket 15 "Renaming a media file"): before saving it says a taken
 * name is taken and offers the next numbered one, shows the tidied name, and offers "Keep the old
 * address working", which follows Always keep until Lex ticks or unticks it. */
function renameField(name: HTMLInputElement, path: string, paths: string[]) {
  const element = node("div", "media-detail__naming");
  const note = node("p", "media-library__problem"); note.id = `media-detail-name-${++fieldIds}`;
  note.setAttribute("aria-live", "polite"); name.setAttribute("aria-describedby", note.id);
  const suggest = button("", () => { name.value = suggest.dataset.name!; paint(); name.focus(); }, "text-button media-detail__suggest");
  suggest.hidden = true;
  const tidied = node("p", "media-library__hint");
  const forward = input("Keep the old address working", "checkbox");
  const choice = node("div", "media-detail__forward");
  choice.append(check("Keep the old address working", forward),
    node("p", "media-library__hint", "Links from other sites to the old name forward to the new one, on hosts that read the site's _redirects file."));
  let touched = false;
  forward.addEventListener("change", () => { touched = true; });
  const taken = (file: string, suggestion: string) => {
    note.textContent = `${basename(file)} is taken.`; name.setAttribute("aria-invalid", "true");
    suggest.dataset.name = basename(suggestion); suggest.textContent = `Use ${basename(suggestion)}`; suggest.hidden = false;
    tidied.textContent = ""; choice.hidden = true;
  };
  const paint = (): MediaNameCheck => {
    const result = mediaNameCheck(path, name.value, paths);
    note.textContent = result.state === "problem" ? result.message : ""; suggest.hidden = true;
    name.setAttribute("aria-invalid", String(result.state === "problem"));
    tidied.textContent = result.state === "free" && basename(result.to) !== name.value.trim() ? `Saved as ${basename(result.to)}` : "";
    choice.hidden = result.state !== "free";
    if (result.state === "taken") taken(result.taken, result.suggestion);
    return result;
  };
  name.addEventListener("input", paint);
  element.append(note, suggest, tidied, choice);
  paint();
  return {
    element, paint, taken, forward: () => forward.checked,
    follow(kept: () => boolean) { if (!touched) forward.checked = kept(); },
  };
}
