import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
// The Media button's lazy half (build slices 39 and 119): a picture's badge, and one popup at a time,
// the Image popup on a picture and the Media popup on a video, audio, a download or an Online video.
// An empty picture spot opens the Media picker to add. Loaded with the first media spot selected, so
// the editor's boot carries none of it.
import type { MediaControllerPorts, MediaModule } from "../controllers/media-controller";
import type { MediaRecords } from "../../shared/media-records";
import type { MediaWorkspaceContext } from "./media-workspace";
import { componentFrame, componentPicture } from "./component-shapes";
import { frameBadge } from "./image-popup-rules";
import { locateNativeElementRange } from "../native-source-location";
import { mediaAttribute } from "./media-attributes";
import { startTags } from "../../shared/html-source";

export interface ImagePopupsDeps {
  ports: MediaControllerPorts;
  workspaceContext: (include?: (path: string) => boolean) => Promise<MediaWorkspaceContext>;
  load: () => Promise<MediaModule>;
  /** The picker without the popup: a component template's fallback picture has no popup. */
  chooseImage(target: { path: string; node: number[] }): Promise<void>;
  /** The site's media records when read (they name trimmed copies). */
  records(): MediaRecords | undefined;
}

export function createImagePopups(deps: ImagePopupsDeps) {
  const { ports } = deps;
  let popup: { path: string; node: string; cancel(): void } | undefined;
  const key = (node: number[]) => node.join(".");
  return {
    /** The badge ("Square", "Trimmed") and whether the popup is open on this image. */
    placeFrame(page: string, node: number[], tag: string) {
      const source = ports.source(page);
      const component = source === undefined ? undefined : componentPicture(source, node, path => ports.source(path));
      return { badge: frameBadge(componentFrame(tag, deps.records(), page, component, nativeSitePrefix(ports.source(NATIVE_CONFIG_PATH)))), open: popup?.path === page && popup.node === key(node) };
    },
    /** Whether a popup is open on this spot (its Media button shows it). */
    open: (page: string, node: number[]) => popup?.path === page && popup.node === key(node),
    /** The Media button: the spot's popup, or (pressed again) closing it unchanged. */
    async edit(target: { path: string; node: number[] }) {
      const was = popup;
      was?.cancel();
      if (was && was.path === target.path && was.node === key(target.node)) return;
      const source = ports.source(target.path);
      const range = source === undefined ? undefined : (ports.locateElement ?? locateNativeElementRange)(source, target.node);
      const picture = range?.tag.name === "img";
      // A picture spot with nothing in it yet adds media: the picker (pictures, and videos in a spot).
      const tag = picture ? source!.slice(range.tag.start, range.tag.end) : "";
      const empty = picture && !["src", "srcset"].some(name => mediaAttribute(tag, startTags(tag)[0], name)?.value.trim());
      if (picture && (empty || /^components\//i.test(target.path)) || !ports.imagePopup) { if (picture) await deps.chooseImage(target); return; }
      // The press owns the popup at once: a later press, another repository or a changed page supersedes it.
      const stamp = ports.stamp();
      const release = () => { if (popup === entry) { popup = undefined; ports.refreshDescriptions(); } };
      const entry = { path: target.path, node: key(target.node), cancel: release };
      popup = entry;
      // The Image popup writes on Done from the page it opened on; the Media popup writes each change at once.
      const live = picture ? () => popup === entry && stamp.holds() && ports.source(target.path) === source : () => popup === entry && stamp.holds();
      const options = { ports, host: ports.imagePopup, workspaceContext: deps.workspaceContext, load: deps.load, chooseImage: (spot: { path: string; node: number[] }) => deps.chooseImage(spot), target, live, closed: release };
      const open = picture ? (await import("./image-popup")).openImagePopup : (await import("./media-spot-popup")).openMediaSpotPopup;
      if (!live()) { release(); return; }
      const session = await open(options);
      if (!session || popup !== entry) { session?.cancel(); release(); return; }
      entry.cancel = session.cancel;
      ports.refreshDescriptions();
    },
  };
}
