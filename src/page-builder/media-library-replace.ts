import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { cancellation } from "./media-busy-lock";
import { mediaFamilyOf } from "./media-families";
import { basename } from "./media-library-filter";
import { check, input } from "./media-library-fields";
import { openMediaPicker } from "./media-picker";
import { takeSheet, type LibrarySheet, type LibrarySheetContext } from "./media-library-sheet";
import { REPLACE_ACCEPT, replaceChoiceProblem, replaceNotice, replacedMessage, trimsOf } from "./media-replace-rules";
import { askToAddUnchanged, prepareMediaFile } from "./media-prepare";
import { mediaAddingSettings } from "./media-settings";
import { uploadImageType } from "../uploads";
import type { MediaReplaceRequest } from "./media-workspace";

/** Replace everywhere from File details (media build slice 54; ticket 15): the picker chooses the new
 * picture (one in Media, or one added there and prepared as at adding), then a screen says what will
 * happen and confirms. Slice 53's engine does the change in one Undo step. Loaded when asked for. */

export type ReplaceContext = LibrarySheetContext & {
  /** The Media pane; the picker opens inside the popover holding it, so the pane stays open. */
  dialog: HTMLElement;
  /** File details of `path`: Cancel and Back return there; after replacing it opens on the new picture. */
  details(path: string): Promise<void>;
};

interface NewPicture extends Pick<MediaReplaceRequest, "result" | "original"> {
  name: string; url: string; width?: number; height?: number;
  /** The picture is a file already in Media (it stays there too). */
  inMedia: boolean;
  release(): void;
}

/** Open the picker for the picture that takes `path`'s place. */
export async function replaceEverywhere(sheet: LibrarySheet, c: ReplaceContext, path: string) {
  await openMediaPicker({
    place: `Replace everywhere · ${basename(path)}`, accept: REPLACE_ACCEPT,
    within: c.dialog.closest<HTMLElement>("[popover]") ?? undefined,
    report: { announce: c.tell, error: error => c.tell(error instanceof Error ? error.message : String(error)) },
    onPick: async (image, cancelled, held) => {
      const chosen = held?.chosen?.();
      let next: NewPicture;
      if (chosen) {
        // A picture added in the picker: its prepared outputs become the file; it is never added on its own.
        const { request } = chosen, main = request.result?.outputs.find(output => output.variantWidth === undefined);
        if (!request.result || !main) throw new Error("This file is kept exactly as it is, so it cannot take the picture's place. Choose a photo or screenshot.");
        chosen.take();
        const url = URL.createObjectURL(main.blob);
        next = { result: request.result, ...request.original ? { original: request.original } : {}, name: request.file.name,
          url, width: main.width, height: main.height, inMedia: false, release: () => URL.revokeObjectURL(url) };
      } else {
        const library = c.library(), paths = library.items.map(item => item.path);
        const problem = replaceChoiceProblem(path, image.path, paths);
        if (problem) throw new Error(problem);
        // A picture already in Media is prepared again as at adding, with the site's settings, so it
        // brings its own responsive copies in one format; its kept original comes along as it is.
        const data = await c.cache.get(image.path), { image: quality, keepOriginal } = mediaAddingSettings(library.adding);
        const { request } = await prepareMediaFile(new File([data.blob], basename(image.path), { type: data.blob.type || uploadImageType(image.path) }),
          library.key, undefined, undefined, undefined, askToAddUnchanged, undefined, quality, keepOriginal);
        const main = request.result?.outputs.find(output => output.variantWidth === undefined);
        if (!request.result || !main) throw new Error(`${basename(image.path)} could not be prepared. Choose another picture.`);
        const kept = mediaFamilyOf(image.path, paths)?.originals[0];
        // Its kept original when it has one; else, with Keep original on, the one preparation kept.
        const original = kept ? { blob: await c.adapter.blob(kept), extension: kept.split(".").pop()!.toLowerCase() } : request.original;
        const url = URL.createObjectURL(main.blob);
        next = { result: request.result, ...original ? { original } : {}, name: basename(image.path), url,
          width: main.width, height: main.height, inMedia: true, release: () => URL.revokeObjectURL(url) };
      }
      if (cancelled()) { next.release(); return; }
      // The picker closes once Use resolves; the confirmation then takes the pane's sheet.
      setTimeout(() => confirmReplace(sheet, c, path, next), 0);
    },
  });
}

function confirmReplace(sheet: LibrarySheet, c: ReplaceContext, path: string, next: NewPicture) {
  if (!c.alive() || !c.library().items.some(item => item.path === path)) { next.release(); return; }
  takeSheet(sheet);
  const { element } = sheet, version = sheet.version;
  element.dataset.mode = "replace";
  const library = c.library(), paths = library.items.map(item => item.path);
  const pages = library.usage[path]?.pages.length ?? 0;
  const notice = replaceNotice({ path, pages, trims: trimsOf(path, paths, library.metadata), kept: Boolean(library.keep?.includes(path)),
    next: { name: next.name, extension: next.result!.outputs[0].extension, inMedia: next.inMedia } });
  const leave = () => { next.release(); void c.details(path); };
  const head = node("header", "media-detail__head");
  const back = button("", leave, "media-detail__back");
  back.setAttribute("aria-label", "Back"); back.append(icon("arrow-left", 20));
  const title = node("h3", "", notice.title); title.tabIndex = -1;
  head.append(back, title);
  const files = node("ul", "media-check__list media-remove__files media-replace__files");
  const row = (label: string, name: string, words: string, url: Promise<string> | string) => {
    const item = node("li", "media-check__row"), frame = node("span", "media-check__preview"), image = node("img");
    image.alt = ""; frame.append(image);
    void Promise.resolve(url).then(src => { if (c.alive()) image.src = src; }).catch(() => frame.replaceChildren(icon("file", 20)));
    const text = node("div", "media-check__text"), strong = node("strong", "", name); strong.title = name;
    text.append(node("span", "media-replace__label", label), strong, node("span", "media-library__muted", words));
    item.append(frame, text); return item;
  };
  files.append(
    row("Now", basename(path), pages ? `Used on ${pages} ${pages === 1 ? "page" : "pages"}` : "No page uses it", c.cache.get(path).then(data => data.url)),
    row("New", next.name, next.width && next.height ? `${next.width} × ${next.height}` : "", next.url),
  );
  element.append(head, files, ...notice.lines.map(line => node("p", "media-replace__line", line)));
  let keep: HTMLInputElement | undefined;
  if (notice.forward) {
    keep = input(notice.forward.label, "checkbox"); keep.checked = notice.forward.checked;
    element.append(check(notice.forward.label, keep), node("p", "media-library__hint", notice.forward.hint));
  }
  const actions = node("div", "media-remove__actions");
  actions.append(cancellation("Cancel", leave), button("Replace everywhere", () => void c.task(async () => {
    if (version !== sheet.version || element.dataset.mode !== "replace") { c.tell("This confirmation has expired. Open Replace everywhere again."); return; }
    // Slice 34: a replaced art-directed <picture> says so ("The new picture is now used on all screens.").
    const notices: string[] = [];
    const to = await c.adapter.replace!({ path, result: next.result, ...next.original ? { original: next.original } : {},
      ...keep ? { keepOldAddress: keep.checked } : {}, notice: text => notices.push(text) });
    next.release(); c.cache.clear(); await c.refresh();
    if (c.alive() && c.library().items.some(item => item.path === to)) await c.details(to);
    else if (c.alive() && version === sheet.version) { sheet.version++; element.hidden = true; delete element.dataset.mode; element.replaceChildren(); }
    c.tell([replacedMessage(to, pages), ...notices].join(" "));
  }), "button primary"));
  element.append(actions);
  title.focus();
}
