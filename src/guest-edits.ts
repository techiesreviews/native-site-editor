// A synced session guest's edit bar on Lex's tab (TOOLS-185): what the bar offers (the site's pictures, pages
// and text sizes), the files its image popup reads, small pictures for its picker, and the guest's picture,
// upload, crop, link, heading level, text size and bold changes written as Lex's own unsaved changes, each one
// Undo step of his. A change not written says why, for the guest.
import { withSitePrefix } from "../shared/site-path-prefix";
import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../shared/native-project";
import { MEDIA_RECORDS_PATH } from "../shared/media-records-path";
import { setAttributeEdit } from "./native-structure";
import { locateNativeElementRange } from "./native-source-location";
import { nativeLinkSuggestions } from "./native-pages";
import { textSizeEdit, textSizeScale, textSizeable } from "./native-text-size";
import { TEXT_LINE_TAGS } from "./page-builder/rules/text-level";
import { wholeWrapper, type WholeWrapper } from "./whole-wrapper";
import { GUEST_NOT_KEPT, type GuestHeadingLevel } from "./guest-changes";
import type { ElementRange } from "../shared/html-source";
import type { GuardedEdits, PlanResult, Reads, Stamp } from "./guarded-edit";
import type { GuestEditHandlers } from "./components/native-preview";
import type { ImagePopupApply } from "./page-builder/image-popup";
import type { WorkspaceMountPorts } from "./workspace-mount";

/** At most this many site pictures are offered to a guest's picker. */
export const GUEST_PICTURE_CHOICES = 200;
const THUMBNAIL = 240;
type Locate = (source: string, node: number[]) => (Pick<ElementRange, "tag"> & Partial<Pick<ElementRange, "close">>) | undefined;
type Whole = (inner: string, tags: string[]) => WholeWrapper | undefined;
const MOVED = (what: string) => `The ${what} changed before your change arrived.`;

export interface GuestEditsPorts {
  site(): { routes: Record<string, string> } | undefined;
  source(path: string): string | undefined;
  sources(): Record<string, string>;
  edits: Pick<GuardedEdits, "run" | "stamp">;
  routeTitle(route: string): string | undefined;
  /** The site's pictures (branch and drafts). */
  pictures(): string[];
  /** A reader of pictures' bytes (Media's own) that leaves the page's pictures as they are, so the mirror sends guests none of them. */
  pictureReader(): Promise<(path: string) => Promise<Blob>>;
  /** The image popup's write with no window: a focus and crop, another picture, or an upload saved with its place.
   * `proof`: the load and page the change was checked against; anything newer refuses. Resolves to whether it was
   * written, or why not. */
  image(target: { path: string; node: number[] }, change: ImagePopupApply, proof: { stamp: Stamp; source: string }): Promise<boolean | string>;
  /** The shared stylesheets of the page on show, as the host bar's Text size reads them. */
  styles(): string[];
  /** A small copy of a picture (a canvas on Lex's tab). */
  thumbnail?: (url: string) => Promise<string | undefined>;
  /** The element at `node` of a source (the page's own reader by default). */
  locate?: Locate;
  /** The host bar's "the whole element is bold" (its own by default). */
  wholeWrapper?: Whole;
}

/** Whether the `name` element at `node` of `now` is still the one a guest saw at `node` of `seen`: the same start tag,
 * standing where it stood among its like. A page changed elsewhere keeps it; one whose elements moved does not. */
export function sameGuestElement(seen: string, now: string, node: number[], name: string, locate: Locate = locateNativeElementRange) {
  const before = locate(seen, node)?.tag, after = locate(now, node)?.tag;
  if (before?.name !== name || after?.name !== name) return false;
  if (seen === now) return true;
  const tag = seen.slice(before.start, before.end);
  if (now.slice(after.start, after.end) !== tag) return false;
  const earlier = (text: string, end: number) => {
    let count = 0;
    for (let at = text.indexOf(tag); at !== -1 && at < end; at = text.indexOf(tag, at + 1)) count++;
    return count;
  };
  return earlier(seen, before.start) === earlier(now, after.start);
}

/** The link at `node` of `path` going to `href` (the site's prefix added to a site address), as one step; refused
 * when it is not the link the guest saw on the page `seen`. */
export function guestLinkPlan(path: string, node: number[], href: string, seen: string, locate: Locate = locateNativeElementRange) {
  return (r: Reads): PlanResult => {
    const source = r.source(path);
    const tag = source === undefined ? undefined : locate(source, node)?.tag;
    if (source === undefined || tag?.name !== "a") return { refuse: "The link could not be found in the source." };
    if (!sameGuestElement(seen, source, node, "a", locate)) return { refuse: MOVED("link") };
    const edit = setAttributeEdit(source, tag, "href", withSitePrefix(href, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH))));
    return { edits: new Map([[path, [edit]]]), done: "Link changed", undone: "Undid the link change" };
  };
}

/** The element at `node` of `path` that `fits`, with its close tag, when it is still the one the guest saw on `seen`
 * (its whole source unchanged, so two lines with the same start tag that swapped places are told apart); else why
 * not, naming it as `what`. */
function seenElement(r: Reads, path: string, node: number[], seen: string, locate: Locate, what: string, fits: (name: string) => boolean):
  { refuse: string } | { source: string; tag: ElementRange["tag"]; close: NonNullable<ElementRange["close"]> } {
  const source = r.source(path);
  const range = source === undefined ? undefined : locate(source, node);
  if (source === undefined || !range?.close || !fits(range.tag.name)) return { refuse: `The ${what} could not be found in the source.` };
  const before = locate(seen, node);
  if (!sameGuestElement(seen, source, node, range.tag.name, locate) || !before?.close
    || seen.slice(before.tag.start, before.close.end) !== source.slice(range.tag.start, range.close.end)) return { refuse: MOVED(what) };
  return { source, tag: range.tag, close: range.close };
}

/** The heading at `node` of `path` made a `level` heading, both its tags renamed as the host bar's Heading level does. */
export function guestHeadingPlan(path: string, node: number[], level: GuestHeadingLevel, seen: string, locate: Locate = locateNativeElementRange) {
  return (r: Reads): PlanResult => {
    const found = seenElement(r, path, node, seen, locate, "heading", name => /^h[1-6]$/.test(name));
    if ("refuse" in found) return found;
    const { tag, close } = found;
    if (tag.name === level) return { refuse: "That heading is that level already." };
    const edits = [
      { start: tag.start + 1, end: tag.nameEnd, text: level },
      { start: close.start + 2, end: close.start + 2 + tag.name.length, text: level },
    ];
    return { edits: new Map([[path, edits]]), done: `Heading level ${level.toUpperCase()}`, undone: "Undid the heading level" };
  };
}

/** The text at `node` of `path` given `size` ("default" for none) from the page's own sizes in `stylePaths`, as the host
 * bar's Text size writes it. */
export function guestSizePlan(path: string, node: number[], size: string, seen: string, stylePaths: string[], locate: Locate = locateNativeElementRange) {
  return (r: Reads): PlanResult => {
    const found = seenElement(r, path, node, seen, locate, "text", textSizeable);
    if ("refuse" in found) return found;
    const scale = textSizeScale(stylePaths.map(sheet => r.source(sheet) ?? ""));
    const chosen = scale.sizes.find(item => item.value === size);
    if (!chosen && size !== "default") return { refuse: "That size is not one of the site's." };
    const edit = textSizeEdit(found.source, found.tag, scale, size);
    if (!edit) return { refuse: "That text is that size already." };
    return { edits: new Map([[path, [edit]]]), done: chosen ? `Text size ${chosen.label}` : "Default text size", undone: "Undid the text size" };
  };
}

/** The whole text at `node` of `path` made bold or not, as the host bar's B does with no text selected. */
export function guestBoldPlan(path: string, node: number[], on: boolean, seen: string, whole: Whole = wholeWrapper, locate: Locate = locateNativeElementRange) {
  return (r: Reads): PlanResult => {
    const found = seenElement(r, path, node, seen, locate, "text", name => TEXT_LINE_TAGS.has(name));
    if ("refuse" in found) return found;
    const { source, tag, close } = found;
    const inner = source.slice(tag.end, close.start), wrapper = whole(inner, ["strong", "b"]);
    if (on && wrapper) return { refuse: "That text is bold already." };
    if (!on && !wrapper) return { refuse: "That text is not bold." };
    const edits = (wrapper
      ? [{ start: wrapper.open, end: wrapper.openEnd, text: "" }, { start: wrapper.closeAt, end: wrapper.closeEnd, text: "" }]
      : [{ start: 0, end: 0, text: "<strong>" }, { start: inner.length, end: inner.length, text: "</strong>" }])
      .map(edit => ({ ...edit, start: tag.end + edit.start, end: tag.end + edit.end }));
    return { edits: new Map([[path, edits]]), done: on ? "Bold on" : "Bold off", undone: on ? "Undid Bold on" : "Undid Bold off" };
  };
}

/** Where a guest's upload goes: the folder holding most of the site's pictures, else `images`. */
export function guestUploadFolder(pictures: string[]) {
  const counts = new Map<string, number>();
  for (const path of pictures) {
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (folder) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "images";
}

/** The files a guest's image popup reads for `path`: the page, its components, the media records and site settings. */
export function guestSourcePaths(path: string, all: string[]) {
  return [path, MEDIA_RECORDS_PATH, NATIVE_CONFIG_PATH, ...all.filter(file => /^components\//i.test(file))];
}

async function canvasThumbnail(url: string): Promise<string | undefined> {
  const image = new Image();
  image.src = url;
  try { await image.decode(); } catch { return undefined; }
  const scale = Math.min(1, THUMBNAIL / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || THUMBNAIL) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || THUMBNAIL) * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.8);
}

export function createGuestEdits(ports: GuestEditsPorts): GuestEditHandlers {
  const thumbnail = ports.thumbnail ?? canvasThumbnail;
  // The page's text sizes, read again only when a stylesheet changed (each render Lex's tab mirrors asks for them).
  let scale: { sheets: string[]; sizes: ReturnType<typeof textSizeScale> } | undefined;
  const sizesOf = (sheets: string[]) => {
    if (!scale || scale.sheets.length !== sheets.length || scale.sheets.some((sheet, at) => sheet !== sheets[at])) scale = { sheets, sizes: textSizeScale(sheets) };
    return scale.sizes;
  };
  return {
    context() {
      const site = ports.site();
      const links = site ? nativeLinkSuggestions(Object.keys(site.routes), route => ports.routeTitle(route), nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH))) : [];
      const sources = ports.sources();
      const sizes = sizesOf(ports.styles().map(sheet => sources[sheet] ?? ports.source(sheet) ?? ""));
      return { links, pictures: ports.pictures().slice(0, GUEST_PICTURE_CHOICES), sizes };
    },
    sources(path) {
      const sources = ports.sources();
      return Object.fromEntries(guestSourcePaths(path, Object.keys(sources)).flatMap(file => {
        const text = sources[file] ?? ports.source(file);
        return text === undefined ? [] : [[file, text]];
      }));
    },
    async pictures(paths) {
      const known = new Set(ports.pictures()), found: Record<string, string> = {}, wanted = paths.filter(path => known.has(path));
      const read = wanted.length ? await ports.pictureReader().catch(() => undefined) : undefined;
      if (!read) return found;
      for (const path of wanted) {
        const blob = await read(path).catch(() => undefined), url = blob && URL.createObjectURL(blob);
        try {
          const small = url && await thumbnail(url).catch(() => undefined);
          if (small) found[path] = small;
        } finally {
          if (url) URL.revokeObjectURL(url);
        }
      }
      return found;
    },
    // `seen`: the page as the guest's copy showed it when they made the change.
    async change(change, seen) {
      const target = { path: change.path, node: [...change.node] }, locate = ports.locate ?? locateNativeElementRange;
      // Each plan is passed to the edits as written, so the read guard (tests/guarded-edit-reads.test.ts) sees it.
      const written = (outcome: Awaited<ReturnType<typeof ports.edits.run>>) => outcome.ok ? true as const : outcome.message;
      const anchor = { anchor: change.path };
      if (change.kind === "link") return ports.edits.run(guestLinkPlan(change.path, target.node, change.href, seen, locate), anchor).then(written);
      if (change.kind === "heading") return ports.edits.run(guestHeadingPlan(change.path, target.node, change.level, seen, locate), anchor).then(written);
      if (change.kind === "size") return ports.edits.run(guestSizePlan(change.path, target.node, change.size, seen, ports.styles(), locate), anchor).then(written);
      if (change.kind === "bold") return ports.edits.run(guestBoldPlan(change.path, target.node, change.on, seen, ports.wholeWrapper ?? wholeWrapper, locate), anchor).then(written);
      // The picture's change is checked against the page now, and written only on that page and load.
      const now = ports.source(change.path);
      if (now === undefined || !sameGuestElement(seen, now, target.node, "img", locate)) return MOVED("picture");
      const proof = { stamp: ports.edits.stamp(), source: now };
      const image = async (apply: ImagePopupApply) => {
        const written = await ports.image(target, apply, proof);
        return written === true ? true as const : written || GUEST_NOT_KEPT;
      };
      if (change.kind === "crop") return image({ edit: change.edit, recrop: change.recrop });
      if (change.kind === "picture") return ports.pictures().includes(change.file) ? image({ file: change.file }) : "That picture is not one of the site's.";
      return image({ upload: change.file, folder: guestUploadFolder(ports.pictures()) });
    },
  };
}

/** Guests' edits from the workspace's own parts (src/workspace-mount.ts): its site, its guarded writes, its pictures and image popup. */
export function workspaceGuestEdits({ runtime, guardedEdits, preview, media }: Pick<WorkspaceMountPorts, "runtime" | "guardedEdits" | "preview" | "media">) {
  return createGuestEdits({
    site: () => runtime.site, source: path => runtime.source(path), sources: () => runtime.sources(), edits: guardedEdits,
    routeTitle: route => preview.nativeRouteInfo(route).title, pictures: () => media.nativeImagePaths(),
    pictureReader: async () => { const context = await media.mediaController.workspaceContext(); return path => context.blob(path); },
    image: (target, change, proof) => media.mediaController.guestImage(target, change, proof),
    styles: () => preview.nativePageStyles(),
  });
}
