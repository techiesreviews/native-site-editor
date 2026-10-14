// The Image button's lazy half (build slice 39): its badge and its one image popup at a time.
// Loaded with the first image selected, so the editor's boot carries none of it.
import type { MediaControllerPorts, MediaModule } from "../controllers/media-controller";
import type { MediaRecords } from "../../shared/media-records";
import type { MediaWorkspaceContext } from "./media-workspace";
import { placeBadge } from "./image-popup-rules";

export interface ImagePopupsDeps {
  ports: MediaControllerPorts;
  workspaceContext: () => Promise<MediaWorkspaceContext>;
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
      return { badge: placeBadge(tag, deps.records(), page), open: popup?.path === page && popup.node === key(node) };
    },
    /** The Image button: the popup, or (pressed again) closing it unchanged. */
    async edit(target: { path: string; node: number[] }) {
      const was = popup;
      was?.cancel();
      if (was && was.path === target.path && was.node === key(target.node)) return;
      if (/^components\//i.test(target.path) || !ports.imagePopup) { await deps.chooseImage(target); return; }
      // The press owns the popup at once: a later press, another repository or a changed page supersedes it.
      const stamp = ports.stamp(), source = ports.source(target.path);
      const release = () => { if (popup === entry) { popup = undefined; ports.refreshDescriptions(); } };
      const entry = { path: target.path, node: key(target.node), cancel: release };
      popup = entry;
      const live = () => popup === entry && stamp.holds() && ports.source(target.path) === source;
      const { openImagePopup } = await import("./image-popup");
      if (!live()) { release(); return; }
      const session = await openImagePopup({ ports, host: ports.imagePopup, workspaceContext: deps.workspaceContext, load: deps.load, target, live, closed: release });
      if (!session || popup !== entry) { session?.cancel(); release(); return; }
      entry.cancel = session.cancel;
      ports.refreshDescriptions();
    },
  };
}
