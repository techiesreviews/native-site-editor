// A synced session guest's edit bar (TOOLS-185): the editor's own bar over the guest's copy of the page,
// by the selection on a computer and docked at the foot on a phone. On a picture it offers the editor's Media
// button: the image popup (shape, focus and crop), whose Replace opens the editor's Media picker with the site's
// pictures and the guest's own; on a link, its address; on text, the editor's heading level, text size and bold.
// Text is still edited in place, as before. Nothing here writes: each change goes to Lex's tab
// (src/live-session.ts), which writes it as his own unsaved change, and the next render shows it. A change his
// tab refused shows why on the bar. Save, publish, files, settings and agents do not exist on this page.
import { createEditBar, type EditBarControl, type SelectionRect } from "./components/edit-bar";
import type { createPreviewLink } from "./components/preview-link";
import type { GuestContext } from "./components/native-preview";
import type { MediaControllerPorts } from "./controllers/media-controller";
import type { ImagePopupHost } from "./page-builder/image-popup";
import type { MediaPickerHost } from "./page-builder/media-picker";
import { createGuestAsks } from "./guest-asks";
import { GUEST_NOT_KEPT, GUEST_OTHER_PAGE, GUEST_UPLOAD_BYTES, guestPhoto, type GuestChange } from "./guest-changes";
import { blobOfDataUrl } from "./data-url-blob";
import { nativeKindLabel } from "./native-structure";
import type { TextSizeScale } from "./native-text-size";
import { TEXT_LINE_TAGS } from "./page-builder/rules/text-level";
import { createGuestTextEdits } from "./guest-text-edits";
import { GUEST_PICTURES_MAX, type GuestMessage, type HostMessage } from "./live-session";

type FrameLink = ReturnType<typeof createPreviewLink>;
type Target = { path: string; node: number[] };
interface Selected extends Target { tag: string; link: string | undefined; rect: SelectionRect }

/** The picker lists the site's pictures as Lex's Replace does; a guest may add photos only, as a drawing (SVG) can
 * carry a script (src/guest-changes.ts), so another added file is refused when it is used. */
const ACCEPT = "image/*";
const NOT_A_PHOTO = "Only a photo can be added here.";
const SOURCES_MS = 10_000;
const MEASURE_MS = 8_000;
const WANT_MS = 15_000;
const key = (target: Target | undefined) => target ? `${target.path}#${target.node.join(".")}` : "";

function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** The element at `target` in these sources, with its source. */
async function elementAt(files: Record<string, string> | undefined, target: Target) {
  const source = files?.[target.path];
  if (source === undefined) return undefined;
  const { locateNativeElementRange } = await import("./native-source-location");
  const range = locateNativeElementRange(source, target.node);
  return range && { source, range };
}

/** The picture's start tag at `target` in these sources, as written (a crop is made on that tag). */
async function pictureTagAt(files: Record<string, string> | undefined, target: Target) {
  const found = await elementAt(files, target);
  return found?.range.tag.name === "img" ? found.source.slice(found.range.tag.start, found.range.tag.end) : undefined;
}

/** The site picture an image of `path` shows, read from the page's source as the image popup reads it. */
async function pictureAt(files: Record<string, string>, target: Target) {
  const [text, { startTags, startTagAttribute }, { decodeHtmlEntities }, { mediaResolvePath }, { NATIVE_CONFIG_PATH, nativeSitePrefix }] = await Promise.all([
    pictureTagAt(files, target), import("../shared/html-source"), import("./page-builder/html-entities"), import("./page-builder/media-references"), import("../shared/native-project"),
  ]);
  const tag = text === undefined ? undefined : startTags(text)[0], src = tag && startTagAttribute(text!, tag, "src");
  if (!src) return undefined;
  const value = decodeHtmlEntities(src.value, true);
  return mediaResolvePath(value, target.path, undefined, nativeSitePrefix(files[NATIVE_CONFIG_PATH])) ?? value;
}

export interface GuestEditBarOptions {
  canvas: HTMLElement;
  frame: HTMLIFrameElement;
  frameLink: FrameLink;
  send: (message: GuestMessage) => void;
  /** This guest's id: answers carry it. */
  me: string;
  /** A picture the page has been sent, as an address the image popup can show. */
  picture(path: string): string | undefined;
}

export function createGuestEditBar(options: GuestEditBarOptions) {
  const { canvas, frame, frameLink, send, me } = options;
  const bar = createEditBar(canvas, frame, undefined, undefined, (dy) => frameLink.send({ type: "scroll-by", dy }));
  let context: GuestContext | undefined;
  let selected: Selected | undefined;
  let closed = false;
  // The site pictures' small copies, when those not yet come were asked for, and the picker's tiles waiting for them.
  const thumbnails = new Map<string, string>();
  const wanted = new Map<string, number>();
  const waiting = new Map<string, Set<(url: string | undefined) => void>>();
  let thumbnailRetry: ReturnType<typeof setInterval> | undefined;
  // Each request waiting for its answer from Lex's tab, by number.
  const asks = createGuestAsks(send);
  // The address typed into the link's field, sent when the field closes (one Undo step for Lex).
  let draft: string | undefined;
  let popup: { cancel(): void } | undefined;
  let popupOpening = false;
  // Closes the Media picker as its Cancel does, once Replace has loaded it: the session's end closes it.
  let closePicker: (() => void) | undefined;
  // The number of the last render from Lex's tab, and of the one the selection was last reported on: a change names
  // the render it was made on, so Lex's tab can refuse it when that element has moved since.
  let seen = 0;
  let selectedSeen = 0;
  // Why the last change on the selected element was not written, shown on the bar until the next one or another selection.
  let refused: string | undefined;
  // A refusal is read out too: the bar's warning is one more button in the toolbar.
  const status = document.createElement("p");
  status.className = "live-guest__said";
  status.setAttribute("role", "status");
  canvas.append(status);

  // How long each change waits is the asks' (src/guest-asks.ts): a slow upload that keeps arriving is waited for.
  const write = (change: GuestChange, on = selectedSeen) => asks.change(change, on);
  const sources = () => asks.ask<Record<string, string>>((ask) => ({ t: "sources", ask }), SOURCES_MS);
  /** The selected element still is `target`, on the page Lex shows. */
  const still = (target: Target) => !closed && key(selected) === key(target) && context?.path === target.path;
  /** Why a change for `target` can no longer be sent: Lex's editor shows another page, or the selection moved. */
  const stale = (target: Target) => context?.path !== target.path ? GUEST_OTHER_PAGE : still(target) ? undefined : GUEST_NOT_KEPT;
  /** A change's answer for `target`: why it was not written shows on the bar; a written one clears the last refusal. */
  const answered = (target: Target, reason: string | undefined) => {
    if (closed || key(selected) !== key(target) || reason === refused) return;
    refused = reason;
    status.textContent = reason ?? "";
    render();
  };

  const textEdits = createGuestTextEdits({
    read: async (target, scale: TextSizeScale | undefined) => {
      const [files, { currentTextSize, textSizeable }, { wholeWrapper }] = await Promise.all([
        sources(), import("./native-text-size"), import("./whole-wrapper"),
      ]);
      const found = await elementAt(files, target);
      const tag = found?.range.tag.name.toLowerCase(), close = found?.range.close;
      if (!found || !close || tag !== target.tag) return undefined;
      return {
        size: scale && textSizeable(tag) ? currentTextSize(found.source, found.range.tag, scale) : undefined,
        bold: TEXT_LINE_TAGS.has(tag) ? Boolean(wholeWrapper(found.source.slice(found.range.tag.end, close.start), ["strong", "b"])) : undefined,
      };
    },
    write, changed: render,
    answered: (reason) => { if (selected) answered(selected, reason); },
  });

  // A small copy asked for and never come (none could be made, or the message was lost) is asked for again later.
  function want(paths: string[]) {
    const now = Date.now();
    const missing = paths.filter((path) => !thumbnails.has(path) && !(now - (wanted.get(path) ?? -Infinity) < WANT_MS));
    for (let at = 0; at < missing.length; at += GUEST_PICTURES_MAX) {
      const batch = missing.slice(at, at + GUEST_PICTURES_MAX);
      batch.forEach((path) => wanted.set(path, now));
      send({ t: "want", paths: batch });
    }
  }
  /** Keep a tile's read open for a late copy; retry a lost request until the picker closes. */
  function thumbnail(path: string) {
    const known = thumbnails.get(path);
    if (known) return Promise.resolve<string | undefined>(known);
    return new Promise<string | undefined>((resolve) => {
      const list = waiting.get(path) ?? new Set();
      waiting.set(path, list);
      const done = (url: string | undefined) => {
        list.delete(done);
        if (!list.size && waiting.get(path) === list) waiting.delete(path);
        if (!waiting.size) { clearInterval(thumbnailRetry); thumbnailRetry = undefined; }
        resolve(url);
      };
      list.add(done);
      thumbnailRetry ??= setInterval(() => want([...waiting.keys()]), WANT_MS);
      want([path]);
    });
  }

  function stopThumbnails() {
    clearInterval(thumbnailRetry);
    thumbnailRetry = undefined;
    for (const list of [...waiting.values()]) for (const done of [...list]) done(undefined);
  }

  /** Sends `file` for `target`, unless `cancelled` (the picker's Cancel) turned true while it was read, or `gone` (the
   * picker's picture no longer selected) says why it is no change any more. */
  async function upload(target: Target, file: File | undefined, on = selectedSeen, cancelled = () => false,
    gone = (at: Target): string | undefined => context?.path !== at.path ? GUEST_OTHER_PAGE : undefined): Promise<string | undefined> {
    if (!file) return undefined;
    if (!guestPhoto(file.name, file.type)) return NOT_A_PHOTO;
    if (file.size > GUEST_UPLOAD_BYTES) return `That picture is over ${GUEST_UPLOAD_BYTES / 1024 / 1024} MB.`;
    // Lex's tab keeps the render the upload names while its bytes travel.
    send({ t: "hold", seen: on });
    const data = await base64(file);
    if (closed || cancelled()) return undefined;
    const why = gone(target);
    if (why) return why;
    return await write({ kind: "upload", ...target, name: file.name, type: file.type, data }, on);
  }

  // The Media picker lent the site's pictures as Lex's tab offers them, read-only: a guest's choice is the only thing
  // that reaches the site, as their change. A file added in the picker stays on this page until it is chosen.
  const NO_ACCESS = "Only the site owner can change the site's media.";
  const library: MediaPickerHost = {
    load: async () => ({ key: "guest", collections: [], items: (context?.pictures ?? []).map((path) => ({ path })), metadata: {}, usage: {} }),
    blob: async (path) => {
      // A picture sent as a data: address, as bytes: the page may not fetch data: or blob: addresses (public/_headers).
      const held = options.picture(path), url = held?.startsWith("data:") ? held : await thumbnail(path);
      const blob = url && blobOfDataUrl(url);
      if (!blob) throw new Error("That picture could not be shown.");
      return blob;
    },
    metadata: () => Promise.reject(new Error(NO_ACCESS)),
    collections: () => Promise.reject(new Error(NO_ACCESS)),
    rename: () => Promise.reject(new Error(NO_ACCESS)),
    remove: () => Promise.reject(new Error(NO_ACCESS)),
    import: async () => [],
    openPage: () => Promise.reject(new Error(NO_ACCESS)),
  };

  /** The image popup's Replace: the editor's Media picker, under the same place words as Lex's. Use sends the choice
   * (a site picture, or the guest's file as an upload) and closes once Lex's tab wrote it; else it stays open saying why. */
  async function replace(target: Target, place: string) {
    if (!still(target)) return;
    want(context?.pictures ?? []);
    const { openMediaPicker, closeMediaPicker } = await import("./page-builder/media-picker");
    closePicker = () => closeMediaPicker();
    if (!still(target)) return;
    await openMediaPicker({
      adapter: library, accept: ACCEPT, place, chooseOnly: true,
      onClose: stopThumbnails,
      onPick: async (image, cancelled, held) => {
        // The change names the render the choice was made on.
        const on = selectedSeen, file = held?.chosen?.()?.request.file;
        const check = () => { const why = stale(target); if (why) throw new Error(why); };
        check();
        if (!file) {
          // The picture already there is no change.
          const now = await sources().then((files) => files && pictureAt(files, target)).catch(() => undefined);
          if (cancelled()) return;
          if (now === image.path) { stopThumbnails(); return; }
        }
        if (cancelled()) return;
        check();
        const reason = file ? await upload(target, file, on, cancelled, stale) : await write({ kind: "picture", ...target, file: image.path }, on);
        if (cancelled()) return;
        if (reason) throw new Error(reason);
        answered(target, undefined);
        stopThumbnails();
      },
    });
  }

  // The image popup lent what a guest's page has: the sources Lex's tab sends, the frame's measurements and
  // look, and the pictures the page holds. Its write goes to Lex's tab (`guest`).
  const host: ImagePopupHost = {
    image: () => {
      const at = bar.selection(), box = frame.getBoundingClientRect();
      return at && { top: box.top + at.top, left: box.left + at.left, bottom: box.top + at.bottom, right: box.left + at.right };
    },
    bar: () => bar.element,
    frame: () => frame.getBoundingClientRect(),
    look: (target, look) => frameLink.send({ type: "image-look", request: look ? target : null, look }),
    scroll: (dy) => frameLink.send({ type: "scroll-by", dy }),
    picture: async (path) => options.picture(path),
  };
  async function measure(path: string, node: number[], image: { width?: number; height?: number }, slot?: string, style?: string) {
    const size = image.width && image.height ? { image: { width: image.width, height: image.height } } : {};
    const answer = await frameLink.ask({ type: "measure-image", request: { path, node, ...size, ...slot === undefined ? {} : { slot }, ...style === undefined ? {} : { style } } }, MEASURE_MS);
    if (!answer || "error" in answer.report) return undefined;
    return { firstScreen: false, large: false, images: [], boxes: answer.report.facts.map(({ viewport, width, height, fit }) => ({ viewport, width, height, fit })) };
  }

  /** The Media button, as on Lex's bar: the image popup on the picture, or (pressed again) closing it. */
  async function openPopup(target: Target) {
    if (popup) { popup.cancel(); return; }
    if (popupOpening) return;
    popupOpening = true;
    refused = undefined;
    render();
    try {
      // The render is noted before the sources are asked for, so they are never older than the render the crop names.
      const opened = selectedSeen;
      const [{ openImagePopup }, files] = await Promise.all([import("./page-builder/image-popup"), sources()]);
      const openedTag = await pictureTagAt(files, target);
      if (!files || !openedTag || !still(target)) return;
      // The crop is made on the picture as the popup opened on it. It names the render it opened on, or, while the
      // same picture stays selected with the same tag on Lex's page now, the latest render: Lex's tab keeps only
      // recent renders, and a change elsewhere meanwhile keeps the crop. A picture replaced meanwhile refuses it.
      const live = () => still(target);
      const proof = async () => {
        const latest = selectedSeen;
        if (latest === opened || !still(target)) return opened;
        return (await pictureTagAt(await sources(), target)) === openedTag ? latest : opened;
      };
      // Only what the popup reads and calls on a guest's page (no files, no history, no saving).
      const ports = {
        source: (path: string) => files[path], openFile: () => target.path, stamp: () => ({ holds: live, changed: () => undefined }),
        generation: () => 0, viewingVersion: () => false, announce: () => undefined, error: () => undefined, measureImage: measure,
      } as unknown as MediaControllerPorts;
      const session = await openImagePopup({
        ports, host, target, live,
        workspaceContext: () => Promise.reject(new Error("A guest has no files.")),
        load: () => Promise.reject(new Error("A guest has no media library.")),
        closed: () => {
          popup = undefined;
          if (!closed) render();
        },
        guest: {
          write: (edit, recrop) => {
            void proof().then((on) => closed ? undefined : write({ kind: "crop", ...target, edit, recrop }, on))
              .then((reason) => answered(target, reason));
          },
          replace: (place) => { void replace(target, place); },
        },
      });
      if (session && still(target)) popup = session;
      else session?.cancel();
    } finally {
      popupOpening = false;
      if (!closed) render();
    }
  }

  function render() {
    const at = selected;
    if (!at || closed) { bar.hide(); return; }
    const controls: EditBarControl[] = [];
    // Only the page Lex shows takes changes (he may have moved on to another).
    const here = context?.path === at.path;
    if (here && at.tag === "img") {
      controls.push({
        kind: "button", label: "Media", leading: "image", className: "edit-bar__media", names: true,
        title: "Picture: shape, focus and Replace", expanded: Boolean(popup) || popupOpening,
        onPress: () => { void openPopup(at); },
      });
    } else if (here && context && at.tag === "a") {
      const value = draft ?? at.link ?? "";
      controls.push({
        kind: "address", label: "Address", icon: "link", value, warning: refused ?? (value.trim() ? undefined : "No address"),
        placeholder: "A page, or https://…", suggestions: context.links,
        onInput: (next) => { draft = next; refused = undefined; },
        onClose: () => {
          const href = draft;
          draft = undefined;
          if (href === undefined || href.trim() === (at.link ?? "")) return;
          void write({ kind: "link", ...at, href: href.trim() }).then((reason) => {
            if (reason && !closed && key(selected) === key(at)) draft ??= href;
            answered(at, reason);
          });
        },
      });
    }
    if (here && at.tag !== "img") controls.push(...textEdits.controls());
    // Why the last change was not written, on the bar itself (a link says it on its address); pressing it hides it.
    if (refused && at.tag !== "a") controls.push({
      kind: "button", label: refused, ariaLabel: `${refused} (dismiss)`, title: refused, className: "edit-bar__warning",
      onPress: () => { refused = undefined; status.textContent = ""; render(); },
    });
    bar.show({ kind: nativeKindLabel(at.tag), controls }, at.rect);
  }

  function select(next: Selected | undefined) {
    const moved = key(next) !== key(selected);
    if (moved) {
      // What was open on the last selection is kept first (the popup's crop, a typed address), then the bar moves.
      popup?.cancel();
      bar.hide();
      draft = undefined;
      refused = undefined;
      status.textContent = "";
    }
    selected = next;
    selectedSeen = seen;
    textEdits.select(next);
  }

  const stops = [
    frameLink.on("select", (message) => {
      const { path, node, tag, rect } = message;
      select(path && node && tag && rect ? { path, node: [...node], tag: tag.toLowerCase(), link: message.link, rect } : undefined);
    }),
    frameLink.on("selection-rect", (message) => {
      if (!selected) return;
      selected.rect = message.rect;
      bar.move(message.rect);
    }),
    // A double-click on a picture opens its image popup, as in the editor.
    frameLink.on("image-edit", (message) => {
      if (key(selected) === key(message) && context?.path === message.path) void openPopup(selected!);
    }),
    // A file dropped on a picture replaces it; a refused one says why on the bar.
    frameLink.on("image-drop", (message) => {
      if (context?.path !== message.path) return;
      const target = { path: message.path, node: [...message.node] };
      void upload(target, message.files[0], seen).catch(() => "That picture could not be added.").then((reason) => answered(target, reason));
    }),
  ];

  return {
    /** A message from Lex's tab for the bar; false when it is not one. */
    receive(message: HostMessage) {
      // A render is the page's (src/live-guest.ts); the bar only notes its number.
      if (message.t === "render") {
        if (Number.isInteger(message.n)) seen = message.n;
        const typed = message.typed && typeof message.typed[me] === "number" ? message.typed[me] : 0;
        textEdits.rendered(message.n, typed);
        return false;
      }
      if (message.t === "context") {
        context = message.context;
        textEdits.context(context);
      } else if (message.t === "answer") {
        if (message.to === me) asks.answer(message.ask, { done: message.done, why: message.why });
      } else if (message.t === "sources") {
        if (message.to === me) asks.answer(message.ask, message.sources);
      } else if (message.t === "got") {
        if (message.to === me) asks.heard();
      } else if (message.t === "pictures") {
        if (message.to !== me || !message.pictures || typeof message.pictures !== "object") return true;
        for (const [path, url] of Object.entries(message.pictures)) {
          wanted.delete(path);
          if (typeof url !== "string" || !url.startsWith("data:image/")) continue;
          thumbnails.set(path, url);
          for (const done of [...waiting.get(path) ?? []]) done(url);
          waiting.delete(path);
        }
      } else return false;
      return true;
    },
    /** The guest typed: letter `seq` (their frame's numbering) went to Lex's tab. */
    typing(seq: number) { textEdits.typing(seq); },
    close() {
      closed = true;
      textEdits.close();
      // Tiles still waiting for a small copy get none.
      stopThumbnails();
      status.remove();
      stops.forEach((stop) => stop());
      popup?.cancel();
      closePicker?.();
      asks.close();
      bar.destroy();
    },
  };
}
