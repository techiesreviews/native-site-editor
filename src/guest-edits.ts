// A synced session guest's edit bar on Lex's tab (TOOLS-185): what the bar offers (the site's pictures and
// pages), the files its image popup reads, small pictures for its picture panel, and the guest's picture,
// upload, crop and link changes written as Lex's own unsaved changes, each one Undo step of his.
import { withSitePrefix } from "../shared/site-path-prefix";
import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../shared/native-project";
import { MEDIA_RECORDS_PATH } from "../shared/media-records-path";
import { setAttributeEdit } from "./native-structure";
import { locateNativeElementRange } from "./native-source-location";
import { nativeLinkSuggestions } from "./native-pages";
import type { ElementRange } from "../shared/html-source";
import type { GuardedEdits, PlanResult, Reads, Stamp } from "./guarded-edit";
import type { GuestEditHandlers } from "./components/native-preview";
import type { ImagePopupApply } from "./page-builder/image-popup";
import type { WorkspaceMountPorts } from "./workspace-mount";

/** At most this many site pictures are offered to a guest's picture panel. */
export const GUEST_PICTURE_CHOICES = 200;
const THUMBNAIL = 240;
type Locate = (source: string, node: number[]) => Pick<ElementRange, "tag"> | undefined;

export interface GuestEditsPorts {
  site(): { routes: Record<string, string> } | undefined;
  source(path: string): string | undefined;
  sources(): Record<string, string>;
  edits: Pick<GuardedEdits, "run" | "stamp">;
  routeTitle(route: string): string | undefined;
  /** The site's pictures (branch and drafts). */
  pictures(): string[];
  /** A picture's bytes as an address (the image popup's own reader). */
  picture(path: string): Promise<string | undefined>;
  /** The image popup's write with no window: a focus and crop, another picture, or an upload saved with its place.
   * `proof`: the load and page the change was checked against; anything newer refuses. */
  image(target: { path: string; node: number[] }, change: ImagePopupApply, proof: { stamp: Stamp; source: string }): Promise<boolean>;
  /** A small copy of a picture (a canvas on Lex's tab). */
  thumbnail?: (url: string) => Promise<string | undefined>;
  /** The element at `node` of a source (the page's own reader by default). */
  locate?: Locate;
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
    if (!sameGuestElement(seen, source, node, "a", locate)) return { refuse: "The link changed before the guest's change arrived." };
    const edit = setAttributeEdit(source, tag, "href", withSitePrefix(href, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH))));
    return { edits: new Map([[path, [edit]]]), done: "Link changed", undone: "Undid the link change" };
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
  return {
    context() {
      const site = ports.site();
      const links = site ? nativeLinkSuggestions(Object.keys(site.routes), route => ports.routeTitle(route), nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH))) : [];
      return { links, pictures: ports.pictures().slice(0, GUEST_PICTURE_CHOICES) };
    },
    sources(path) {
      const sources = ports.sources();
      return Object.fromEntries(guestSourcePaths(path, Object.keys(sources)).flatMap(file => {
        const text = sources[file] ?? ports.source(file);
        return text === undefined ? [] : [[file, text]];
      }));
    },
    async pictures(paths) {
      const known = new Set(ports.pictures()), found: Record<string, string> = {};
      for (const path of paths.filter(path => known.has(path))) {
        const url = await ports.picture(path).catch(() => undefined);
        const small = url && await thumbnail(url).catch(() => undefined);
        if (small) found[path] = small;
      }
      return found;
    },
    // `seen`: the page as the guest's copy showed it when they made the change.
    async change(change, seen) {
      const target = { path: change.path, node: [...change.node] }, locate = ports.locate ?? locateNativeElementRange;
      if (change.kind === "link") return (await ports.edits.run(guestLinkPlan(change.path, target.node, change.href, seen, locate), { anchor: change.path })).ok;
      // The picture's change is checked against the page now, and written only on that page and load.
      const now = ports.source(change.path);
      if (now === undefined || !sameGuestElement(seen, now, target.node, "img", locate)) return false;
      const proof = { stamp: ports.edits.stamp(), source: now };
      if (change.kind === "crop") return await ports.image(target, { edit: change.edit, recrop: change.recrop }, proof);
      if (change.kind === "picture") return ports.pictures().includes(change.file) && await ports.image(target, { file: change.file }, proof);
      return await ports.image(target, { upload: change.file, folder: guestUploadFolder(ports.pictures()) }, proof);
    },
  };
}

/** Guests' edits from the workspace's own parts (src/workspace-mount.ts): its site, its guarded writes, its pictures and image popup. */
export function workspaceGuestEdits({ runtime, guardedEdits, preview, media }: Pick<WorkspaceMountPorts, "runtime" | "guardedEdits" | "preview" | "media">) {
  return createGuestEdits({
    site: () => runtime.site, source: path => runtime.source(path), sources: () => runtime.sources(), edits: guardedEdits,
    routeTitle: route => preview.nativeRouteInfo(route).title, pictures: () => media.nativeImagePaths(),
    picture: async path => await media.mediaPorts.imagePopup?.picture(path),
    image: (target, change, proof) => media.mediaController.guestImage(target, change, proof),
  });
}
