// A synced session guest's edit bar (TOOLS-185): the editor's own bar over the guest's copy of the page,
// by the selection on a computer and docked at the foot on a phone. On a picture it offers Replace (the
// site's pictures, or one the guest uploads) and Focus and crop (the editor's image popup); on a link, its
// address. Text is still edited in place, as before. Nothing here writes: each change goes to Lex's tab
// (src/live-session.ts), which writes it as his own unsaved change, and the next render shows it. Save,
// publish, files, settings and agents do not exist on this page.
import { createEditBar, type EditBarControl, type PicturesControl, type SelectionRect } from "./components/edit-bar";
import { createPicturesPanel } from "./components/edit-bar-pictures";
import type { createPreviewLink } from "./components/preview-link";
import type { GuestContext } from "./components/native-preview";
import type { MediaControllerPorts } from "./controllers/media-controller";
import type { ImagePopupHost } from "./page-builder/image-popup";
import { createGuestAsks } from "./guest-asks";
import { GUEST_UPLOAD_BYTES, guestPhoto, type GuestChange } from "./guest-changes";
import { guestPhotoTypes } from "../shared/media-kinds";
import { nativeKindLabel } from "./native-structure";
import { GUEST_PICTURES_MAX, type GuestMessage, type HostMessage } from "./live-session";

type FrameLink = ReturnType<typeof createPreviewLink>;
type Target = { path: string; node: number[] };
interface Selected extends Target { tag: string; link: string | undefined; rect: SelectionRect }

/** Photos only: a drawing (SVG) can carry a script (src/guest-changes.ts). */
const ACCEPT = [...new Set(Object.values(guestPhotoTypes))].join(",");
/** How long a change waits for Lex's tab to write it, counted from the last part of its upload his tab said arrived
 * (TOOLS-385): a slow upload that keeps arriving is waited for. */
const ANSWER_MS = 60_000;
/** How long a change waits for its first part to arrive: the time for one 512 KiB part (src/live-wire.ts) at about 3 KB/s. */
const FIRST_PART_MS = 180_000;
const SOURCES_MS = 10_000;
const MEASURE_MS = 8_000;
const WANT_MS = 15_000;

const key = (target: Target | undefined) => target ? `${target.path}#${target.node.join(".")}` : "";
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

/** The picture's start tag at `target` in these sources, as written (a crop is made on that tag). */
async function pictureTagAt(files: Record<string, string> | undefined, target: Target) {
  const source = files?.[target.path];
  if (source === undefined) return undefined;
  const { locateNativeElementRange } = await import("./native-source-location");
  const range = locateNativeElementRange(source, target.node);
  return range?.tag.name === "img" ? source.slice(range.tag.start, range.tag.end) : undefined;
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
  const bar = createEditBar(canvas, frame, undefined, undefined, (dy) => frameLink.send({ type: "scroll-by", dy }), createPicturesPanel);
  let context: GuestContext | undefined;
  let selected: Selected | undefined;
  let closed = false;
  // The site pictures' small copies, and when those not yet come were asked for.
  const thumbnails = new Map<string, string>();
  const wanted = new Map<string, number>();
  // Each request waiting for its answer from Lex's tab, by number.
  const asks = createGuestAsks(send);
  // The address typed into the link's field, sent when the field closes (one Undo step for Lex).
  let draft: string | undefined;
  // The picture the selected image shows (its tile is ticked), once read.
  let current: string | undefined;
  let crop: { cancel(): void } | undefined;
  let cropOpening = false;
  // The number of the last render from Lex's tab, and of the one the selection was last reported on: a change names
  // the render it was made on, so Lex's tab can refuse it when that element has moved since.
  let seen = 0;
  let selectedSeen = 0;
  // Why a picture change was refused, for the picture panel it opens; and why the link's address was not changed.
  let refused: string | undefined;
  let refusedLater: string | undefined;
  let linkRefused: string | undefined;

  const write = async (change: GuestChange, on = selectedSeen) =>
    (await asks.ask<boolean>((ask) => ({ t: "change", change, ask, seen: on }), ANSWER_MS, FIRST_PART_MS)) === true;
  const sources = () => asks.ask<Record<string, string>>((ask) => ({ t: "sources", ask }), SOURCES_MS);
  /** The selected element still is `target`, on the page Lex shows. */
  const still = (target: Target) => !closed && key(selected) === key(target) && context?.path === target.path;
  /** A refused picture change: the picture panel opens on it saying why (once Focus and crop is closed, if it is open). */
  const refuse = (target: Target, reason: string | undefined) => {
    if (!reason || closed || key(selected) !== key(target)) return;
    if (crop || cropOpening) { refusedLater = reason; return; }
    refused = reason;
    render(true);
    refused = undefined;
  };
  // Lex's tab refuses a guest's change once the page changed after the guest saw it (his typing too).
  const NOT_KEPT = "The page changed meanwhile. Try again.";

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

  async function upload(target: Target, file: File | undefined, on = selectedSeen): Promise<string | undefined> {
    if (!file) return undefined;
    if (!guestPhoto(file.name, file.type)) return "That file is not a picture";
    if (file.size > GUEST_UPLOAD_BYTES) return `That picture is over ${GUEST_UPLOAD_BYTES / 1024 / 1024} MB`;
    // Lex's tab keeps the render the upload names while its bytes travel.
    send({ t: "hold", seen: on });
    const data = await base64(file);
    return await write({ kind: "upload", ...target, name: file.name, type: file.type, data }, on) ? undefined : "That picture could not be added";
  }

  function picturesControl(target: Target, open: boolean): PicturesControl {
    const pictures = context?.pictures ?? [], names = pictures.map(fileName);
    // A name two pictures share is told apart by its folder.
    const shared = new Set(names.filter((name, at) => names.indexOf(name) !== at));
    return {
      kind: "pictures", label: "Replace", ariaLabel: "Replace the picture", title: "Site pictures", current, open, refused,
      items: pictures.map((path, at) => ({ value: path, label: shared.has(names[at]) ? path : names[at], url: thumbnails.get(path) })),
      upload: { label: "Upload…", accept: ACCEPT, onFiles: (files) => upload(target, files[0]) },
      onOpen: () => {
        want(context?.pictures ?? []);
        void sources().then((files) => files && pictureAt(files, target)).then((path) => {
          if (path === current || !still(target)) return;
          current = path;
          render();
        }).catch(() => undefined);
      },
      onPick: (file) => { if (file !== current) void write({ kind: "picture", ...target, file }).then((done) => refuse(target, done ? undefined : NOT_KEPT)); },
    };
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

  async function openCrop(target: Target) {
    if (crop) { crop.cancel(); return; }
    if (cropOpening) return;
    cropOpening = true;
    render();
    try {
      const [{ openImagePopup }, files] = await Promise.all([import("./page-builder/image-popup"), sources()]);
      const opened = selectedSeen, openedTag = await pictureTagAt(files, target);
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
        load: () => Promise.reject(new Error("A guest has no media picker.")),
        closed: () => {
          crop = undefined;
          const later = refusedLater;
          refusedLater = undefined;
          if (later) refuse(target, later);
          else if (!closed) render();
        },
        guest: {
          write: (edit, recrop) => {
            void proof().then((on) => closed ? true : write({ kind: "crop", ...target, edit, recrop }, on))
              .then((done) => refuse(target, done ? undefined : NOT_KEPT));
          },
          replace: () => { if (still(target)) render(true); },
        },
      });
      if (session && still(target)) crop = session;
      else session?.cancel();
    } finally {
      cropOpening = false;
      if (!closed) render();
    }
  }

  function render(openPictures = false) {
    const at = selected;
    if (!at || closed) { bar.hide(); return; }
    const controls: EditBarControl[] = [];
    // Only the page Lex shows takes changes (he may have moved on to another).
    if (context?.path === at.path && at.tag === "img") {
      controls.push(picturesControl(at, openPictures), {
        kind: "button", label: "Focus and crop", leading: "image", className: "edit-bar__media", expanded: Boolean(crop) || cropOpening,
        onPress: () => { void openCrop(at); },
      });
    } else if (context?.path === at.path && at.tag === "a") {
      const value = draft ?? at.link ?? "";
      controls.push({
        kind: "address", label: "Address", icon: "link", value, warning: linkRefused ?? (value.trim() ? undefined : "No address"),
        placeholder: "A page, or https://…", suggestions: context.links,
        onInput: (next) => { draft = next; linkRefused = undefined; },
        onClose: () => {
          const href = draft;
          draft = undefined;
          if (href === undefined || href.trim() === (at.link ?? "")) return;
          void write({ kind: "link", ...at, href: href.trim() }).then((done) => {
            if (done || closed || key(selected) !== key(at)) return;
            draft ??= href;
            linkRefused = "Not changed, try again";
            render();
          });
        },
      });
    }
    bar.show({ kind: nativeKindLabel(at.tag), controls }, at.rect);
  }

  function select(next: Selected | undefined) {
    if (key(next) !== key(selected)) {
      // What was open on the last selection is kept first (the popup's crop, a typed address), then the bar moves.
      crop?.cancel();
      bar.hide();
      draft = undefined;
      current = undefined;
      linkRefused = undefined;
      refusedLater = undefined;
    }
    // The runtime reports the selection again after each render it draws: its node is that render's.
    selected = next;
    selectedSeen = seen;
    render();
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
    // A double-click on a picture opens its focus and crop, as in the editor.
    frameLink.on("image-edit", (message) => {
      if (key(selected) === key(message) && context?.path === message.path) void openCrop(selected!);
    }),
    // A file dropped on a picture replaces it; a refused one opens the picture panel saying why.
    frameLink.on("image-drop", (message) => {
      if (context?.path !== message.path) return;
      const target = { path: message.path, node: [...message.node] };
      void upload(target, message.files[0], seen).catch(() => "That picture could not be added").then((reason) => refuse(target, reason));
    }),
  ];

  return {
    /** A message from Lex's tab for the bar; false when it is not one. */
    receive(message: HostMessage) {
      // A render is the page's (src/live-guest.ts); the bar only notes its number.
      if (message.t === "render") {
        if (Number.isInteger(message.n)) seen = message.n;
        return false;
      }
      if (message.t === "context") {
        context = message.context;
        render();
      } else if (message.t === "answer" || message.t === "sources") {
        if (message.to === me) asks.answer(message.ask, message.t === "answer" ? message.done : message.sources);
      } else if (message.t === "got") {
        if (message.to === me) asks.heard();
      } else if (message.t === "pictures") {
        if (message.to !== me || !message.pictures || typeof message.pictures !== "object") return true;
        for (const [path, url] of Object.entries(message.pictures)) {
          wanted.delete(path);
          if (typeof url === "string" && url.startsWith("data:image/")) thumbnails.set(path, url);
        }
        if (selected?.tag === "img") render();
      } else return false;
      return true;
    },
    close() {
      closed = true;
      stops.forEach((stop) => stop());
      crop?.cancel();
      asks.close();
      bar.destroy();
    },
  };
}
