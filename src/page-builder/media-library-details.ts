import { GITHUB_PAGES_REDIRECT_NOTE } from "../../shared/github-pages";
import { siteAddress } from "../../shared/site-path-prefix";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { formatBytes, uploadImageType } from "../uploads";
import { input, check } from "./media-library-fields";
import { detailCollections, mediaCollectionNameMessage } from "./media-collection-choices";
import { basename, formatMediaLength, mediaKind, mediaTileLook, mediaTileStills } from "./media-library-filter";
import { canReplaceEverywhere, formatMediaAdded, mediaDetailChanges, mediaDetailFormState, mediaFileMenu, mediaDetailFacts, mediaMadeFrom, mediaFamilyRows, mediaNameCheck, mediaRenamedPath, type MediaNameCheck } from "./media-file-details";
import { isRenamableMedia, MediaNameTakenError } from "./media-names";
import { keepPageFocus, usageSections } from "./media-library-usage";
import { mediaUsageBadge, mediaUsageFor } from "./media-usage-text";
import { mediaDetailParts } from "./media-library-video";
import type { LibrarySheet, LibrarySheetContext } from "./media-library-sheet";
import type { MenuItem } from "../components/row-menu";
import type { MediaBytes } from "./media-byte-cache";
import type { MediaMetadata } from "./media-metadata";
import { markTransparency } from "./media-transparency";

/** The view around File details, and the screens File details can open. */
export interface DetailHost extends LibrarySheetContext {
  dialog: HTMLElement;
  grid: HTMLElement;
  /** The picker modal; the Media pane has none. */
  modal: boolean;
  close: () => void;
  optimise: (files: File[], existing: boolean, receipts: Map<string, string | undefined>) => void;
  remove: (paths: string[]) => void;
  /** Open the ⋯ menu's `items` under `opener` (Media's own menu, so it works in the popover and the picker). */
  menu: (opener: HTMLButtonElement, items: MenuItem[]) => void;
}

/** A file's ⋯ button (slice 108): its quieter actions, with Remove… last in red. */
export function moreButton(h: Pick<DetailHost, "menu">, items: () => MenuItem[]) {
  const more: HTMLButtonElement = button("", () => h.menu(more, items()), "button secondary media-detail__more");
  more.setAttribute("aria-label", "More for this file"); more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
  more.append(icon("dots-three", 20));
  return more;
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
  const still = mediaTileStills(library.items.map(item => item.path), library.metadata).get(path);
  const view = renderPreview(h, path, data, meta, still);
  layout.append(view, info);
  element.replaceChildren(head, layout);
  const player = view.querySelector<HTMLVideoElement | HTMLAudioElement>("video, audio") ?? undefined;
  const kind = mediaKind(path);
  const parts = (kind === "video" || kind === "audio") && !h.modal ? mediaDetailParts(h, path, meta, player, still, current) : [];
  const facts = renderInformation(form, sheet, h, path, data, meta, current, fileActions(h, path, data, replace), parts);
  if (player) {
    const length = () => {
      if (!current() || !Number.isFinite(player.duration) || player.duration <= 0) return;
      const value = formatMediaLength(player.duration);
      meta.duration = player.duration;
      facts(player instanceof HTMLVideoElement ? { width: player.videoWidth, height: player.videoHeight } : {});
      const card = h.grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      const fact = card?.querySelector(".media-library__fact"), size = card?.querySelector(".media-library__size");
      if (fact) fact.textContent = value;
      if (size) size.textContent = `${formatBytes(data.blob.size)} · ${value}`;
      card?.querySelector(".media-library__thumbnail")?.setAttribute("aria-label", `${h.modal ? "Choose" : "Details for"} ${path}, ${value}`);
    };
    player.addEventListener("loadedmetadata", length);
    player.addEventListener("durationchange", length);
    length();
  }
  h.sync();
  const requestedFocus = background ? sheet.focus?.path === path ? sheet.focus.active : undefined : initiatingFocus;
  if (requestedFocus !== undefined && (document.activeElement === requestedFocus ||
    document.activeElement === document.body && (!requestedFocus?.isConnected || !requestedFocus.getClientRects().length))) {
    back.focus();
  }
  if (sheet.focus?.path === path) sheet.focus = undefined;
}

/** The complete picture on the stage (a clean surface with its type's picture when there is none to
 * draw), a playable video or audio file, or a PDF's first page (slice 123: the actions moved to the inspector). */
function renderPreview(h: DetailHost, path: string, data: MediaBytes, meta: MediaMetadata, still: string | undefined) {
  const { cache } = h;
  const view = node("div", "media-detail__view"), preview = node("figure", "media-detail__preview");
  const look = mediaTileLook(path, still, meta.duration), kind = mediaKind(path);
  preview.dataset.type = look.icon;
  const typePicture = () => { const picture = node("span", "media-library__type-picture"); picture.setAttribute("aria-hidden", "true"); return picture; };
  const surface = () => {
    preview.classList.add("is-file");
    preview.replaceChildren(typePicture(), node("span", "media-library__format", look.type));
  };
  const stillUrl = (use: (url: string) => void, failed?: () => void) => {
    if (still) void cache.get(still).then(bytes => use(bytes.url), () => failed?.());
  };
  if (kind === "image") {
    const image = node("img"); image.alt = meta.alt;
    // Its own shape before it loads, so the preview never jumps (slice 108).
    if (data.width && data.height) { image.width = data.width; image.height = data.height; }
    markTransparency(image, path); image.src = data.url;
    image.addEventListener("error", surface, { once: true });
    preview.append(image);
  } else if (kind === "video") {
    // Plays here with sound, from its still picture; nothing plays until pressed.
    const video = node("video"); video.controls = true; video.playsInline = true; video.preload = "metadata"; video.src = data.url;
    video.setAttribute("aria-label", basename(path));
    video.addEventListener("error", surface, { once: true });
    stillUrl(url => { video.poster = url; });
    preview.append(video);
  } else if (kind === "audio") {
    surface();
    const audio = node("audio"); audio.controls = true; audio.preload = "metadata"; audio.src = data.url;
    audio.setAttribute("aria-label", basename(path));
    preview.append(audio);
  } else if (look.picture) {
    const image = node("img"); image.alt = "";
    image.addEventListener("error", surface, { once: true });
    stillUrl(url => { image.src = url; }, surface);
    preview.append(image);
  } else surface();
  view.append(preview);
  return view;
}

/** The file's actions in one row (slices 108, 123; Magnific, Apple Photos): Replace everywhere… and
 * Optimise…, then ⋯ with Copy path, Download and, last in red, Remove…. */
function fileActions(h: DetailHost, path: string, data: MediaBytes, replace?: () => void) {
  const { optimise, remove, task, done } = h;
  const actions = node("div", "media-detail__actions");
  if (replace) actions.append(button("Replace everywhere…", replace));
  if (uploadImageType(path)) actions.append(button("Optimise…", () => optimise(
    [new File([data.blob], path, { type: data.blob.type || uploadImageType(path) })], true, new Map([[path, data.version]]),
  )));
  actions.append(moreButton(h, () => mediaFileMenu({
    copy: () => void task(async () => {
      await navigator.clipboard.writeText(siteAddress(path, h.library().prefix ?? "")); done("Path copied.");
    }),
    download: () => { const link = node("a"); link.href = data.url; link.download = basename(path); link.click(); },
    remove: () => remove([path]),
  })));
  return actions;
}

/** A section of the inspector: a small heading with an optional muted value at its end. */
export function detailSection(title: string, value?: HTMLElement | string, ...content: (HTMLElement | string)[]) {
  const section = node("div", "media-detail__section"), head = node("div", "media-detail__section-head");
  head.append(node("h4", "", title), ...value ? [typeof value === "string" ? node("span", "", value) : value] : []);
  section.append(head, ...content);
  return section;
}

/** Expand/collapse section with its summary words; it stays open across background refreshes. */
function disclosure(part: string, title: string, summary: HTMLElement, body: HTMLElement[]) {
  const section = node("details", "media-detail__disclosure"); section.dataset.part = part;
  const head = node("summary"); head.append(node("strong", "", title), summary);
  section.append(head, ...body);
  return section;
}

/** A setting as a row with a switch at its end (slice 123, Frame.io); still a tick box underneath. */
export function switchRow(label: string, box: HTMLInputElement, hint?: string) {
  box.classList.add("media-switch");
  const row = check(label, box, hint); row.classList.add("media-detail__switch");
  return row;
}

let fieldIds = 0;

/** The inspector (slice 123): the name as the heading, the facts, the actions, then Description (with
 * Decorative), Usage, Copies and original, a video's or audio file's parts, Collections as pills and
 * Settings; a Save bar appears once something differs from what is saved.
 * Returns the facts line's painter, for the dimensions and length a player reads later. */
function renderInformation(
  form: HTMLFormElement, sheet: LibrarySheet, h: DetailHost,
  path: string, data: MediaBytes, meta: MediaMetadata, current: () => boolean, actions: HTMLElement, parts: HTMLElement[],
) {
  const { adapter, task, refresh, done, cache } = h, library = h.library(), image = mediaKind(path) === "image";
  const item = library.items.find(entry => entry.path === path);
  const name = input("File name", "text"); name.value = basename(path); name.autocomplete = "off"; name.classList.add("media-detail__title");
  name.autocapitalize = "none"; name.spellcheck = false;
  // Renaming renames the whole family and every mention (slice 52); kinds Media does not rename stay as they are.
  if (!isRenamableMedia(path)) name.disabled = true;
  const naming = renameField(name, path, library.items.map(entry => entry.path), library.githubPages);
  // One muted line of facts (slice 108, Shopify "JPG • 3024 × 4032 • 1.61 MB"), then when it was added.
  const facts = node("p", "media-detail__facts"), notes: HTMLElement[] = [];
  const paintFacts = (shown: { width?: number; height?: number } = {}) => {
    facts.replaceChildren();
    mediaDetailFacts({ path, size: item?.size ?? data.blob.size, width: data.width ?? shown.width, height: data.height ?? shown.height, duration: meta.duration })
      .forEach((fact, index) => {
        const part = node("span", "", fact.value); part.dataset.fact = fact.key;
        facts.append(...index ? [" · ", part] : [part]);
      });
  };
  paintFacts();
  if (item?.date !== undefined) notes.push(node("p", "media-detail__note", formatMediaAdded(item.date)));
  const madeFrom = mediaMadeFrom(meta);
  if (madeFrom) notes.push(node("p", "media-detail__note", madeFrom));
  // The name is the heading (slice 123, Air): its rename notes, the facts and notes under it.
  const summary = node("div", "media-detail__summary");
  summary.append(name, naming.element, facts, ...notes);
  // The Always keep mark (slice 49): on for this file, or for a copy or original in its family.
  if (library.keep?.includes(path)) summary.append(node("p", "media-library__keep-note", "Always keep: Clean up never suggests this file."));
  form.append(summary, actions);
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
    // One short help line (WordPress); Decorative sits with the words it empties.
    const words = detailSection("Description", !meta.alt && !meta.decorative ? node("span", "media-library__hint", "Not described yet") : undefined,
      description, node("p", "media-library__hint", "Read aloud to people who can't see the picture."));
    // By agent (ticket 13) until Looks right in To check, or Lex's own words saved here.
    if (meta.byAgent) words.append(node("span", "media-library__by-agent", "By agent: press Looks right in To check, or change the words here."));
    words.append(switchRow("Decorative", decorative, "No description: screen readers skip it."));
    form.append(words);
  }
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
    // Two lines each (slice 108): the name, then what it is; the size beside the name.
    const rows = family.map(row => {
      const line = node("div", "media-detail__row"), label = node("span", "media-detail__row-name", basename(row.path));
      if (row.original) {
        // The kept original (ticket 07): fetched only when asked for, then saved under its own name.
        const name = basename(row.path);
        const open = button(name, () => void task(async () => {
          const blob = await adapter.blob(row.path);
          if (!h.alive()) return;
          const link = node("a"); link.href = cache.objectUrl(blob); link.download = name; link.click();
        }), "text-button media-detail__original");
        open.setAttribute("aria-label", `Download original ${name}`);
        label.replaceChildren(open);
      }
      line.append(label, node("span", "media-detail__row-size", row.size ?? ""), node("span", "media-detail__row-kind", row.label));
      return line;
    });
    form.append(disclosure("family", image ? "Copies and original" : "Files with it", node("span", "", String(family.length)), rows));
  }
  // A video's Still picture and a video's or audio file's Subtitles (slice 66), as sections.
  form.append(...parts);
  // Collections work like tags (ticket 15, slice 16), drawn as pills (slice 123, Air and Midday):
  // tick the ones the file is in, or name a new one at the row's end.
  const group = node("fieldset", "media-library__memberships media-detail__section");
  group.append(node("legend", "", "Collections"));
  const chips = node("div", "media-detail__chips");
  const ticks = library.collections.map(collection => {
    const box = input(collection, "checkbox"); box.checked = meta.tags.includes(collection); box.name = "media-collection-member";
    box.value = collection; box.dataset.formKey = `collection:${collection}`;
    const chip = node("label", "media-detail__chip"); chip.append(box, node("span", "", collection));
    chips.append(chip); return box;
  });
  const fresh = input("New collection", "text"); fresh.placeholder = "+ New collection"; fresh.autocomplete = "off";
  fresh.classList.add("media-detail__new");
  const problem = node("p", "media-library__problem"); problem.id = `media-detail-collection-${++fieldIds}`;
  problem.setAttribute("aria-live", "polite"); fresh.setAttribute("aria-describedby", problem.id);
  fresh.addEventListener("input", () => {
    problem.textContent = fresh.value.trim() ? mediaCollectionNameMessage(library.collections, fresh.value) ?? "" : "";
  });
  chips.append(fresh);
  group.append(chips, problem);
  form.append(group);
  const keep = input("Always keep", "checkbox"); keep.checked = Boolean(meta.alwaysKeep);
  // "Keep the old address working" is ticked for Always keep files (ticket 15) until Lex chooses.
  const memberKept = Boolean(library.keep?.includes(path)) && !meta.alwaysKeep;
  naming.follow(() => keep.checked || memberKept);
  keep.addEventListener("change", () => naming.follow(() => keep.checked || memberKept));
  form.append(detailSection("Settings", undefined, switchRow("Always keep", keep, "Never suggested for clean-up. For files used outside the site.")));
  // Save bar ★ (slice 123, Shopify): there only while something differs from what is saved;
  // Discard draws the saved details again. Saving is still one step and one Undo.
  const footer = node("footer", "media-detail__foot");
  const save = button("Save details", () => undefined, "button primary"); save.type = "submit";
  const discard = button("Discard", () => void showMediaDetail(sheet, h, path));
  footer.append(node("p", "", "Unsaved changes"), discard, save);
  form.append(footer);
  const state = () => mediaDetailFormState([...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
    .map(control => ({ checkbox: control.type === "checkbox", checked: control instanceof HTMLInputElement && control.checked, value: control.value })));
  const saved = state(), changed = () => state() !== saved;
  const paintFoot = () => { footer.hidden = !changed(); };
  form.addEventListener("input", paintFoot); form.addEventListener("change", paintFoot);
  paintFoot();
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!changed()) return;
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
      if (!rename) { await refresh(); done("Details saved as a draft."); return; }
      cache.clear(); await refresh();
      const to = mediaRenamedPath(path, rename.name);
      if (h.alive() && h.library().items.some(entry => entry.path === to)) await showMediaDetail(sheet, h, to);
      done(`Details saved and the file renamed, with its uses updated, as drafts.${forward ? " Its old address forwards to the new one." : ""}`);
    });
  });
  return paintFacts;
}

/** Under the File name field (ticket 15 "Renaming a media file"): before saving it says a taken
 * name is taken and offers the next numbered one, shows the tidied name, and offers "Keep the old
 * address working", which follows Always keep until Lex ticks or unticks it. */
function renameField(name: HTMLInputElement, path: string, paths: string[], githubPages = false) {
  const element = node("div", "media-detail__naming");
  const note = node("p", "media-library__problem"); note.id = `media-detail-name-${++fieldIds}`;
  note.setAttribute("aria-live", "polite"); name.setAttribute("aria-describedby", note.id);
  const suggest = button("", () => { name.value = suggest.dataset.name!; paint(); name.focus(); }, "text-button media-detail__suggest");
  suggest.hidden = true;
  const tidied = node("p", "media-library__hint");
  const forward = input("Keep the old address working", "checkbox");
  const choice = node("div", "media-detail__forward");
  choice.append(check("Keep the old address working", forward,
    githubPages ? GITHUB_PAGES_REDIRECT_NOTE : "Links from other sites to the old name forward to the new one, on hosts that read the site's _redirects file."));
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
