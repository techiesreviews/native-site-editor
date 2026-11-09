// Share preview in the editor's boot code (slice 35; CONTEXT.md "Preview link"): the
// project menu's port. The rest (src/preview-later.ts: src/preview-control.ts and the menu's
// items, src/components/preview-menu.ts) loads a moment after the first paint, when the editor
// has a preview Worker, so the editor's start carries almost nothing of it; a link this
// browser keeps is served from then on. The menu's items talk to the loaded control itself.

import type { PreviewSharePorts } from "./preview-control";
import type { PreviewMenuPort } from "./components/repository-menu";

/** How long after the first paint the rest loads. */
const LATER_MS = 3_000;

export function createPreviewShare(ports: PreviewSharePorts) {
  let later = false, made: ReturnType<typeof import("./preview-later").createPreviewControl> | undefined;
  let loaded: Promise<typeof import("./preview-later")> | undefined;
  const load = () => loaded ??= import("./preview-later").then((rest) => { made = rest.createPreviewControl(ports); return rest; });
  const port: Pick<PreviewMenuPort, "available" | "draw"> & { sync(): void; painted(): void } = {
    available: () => made ? made.available() : ports.enabled() && Boolean(ports.workspace()?.host),
    draw: (actionClass, root) => load().then(({ previewItems }) => previewItems(made!, actionClass, root)),
    /** After a load or a paint: the link of the site shown is served, and another site's is not. */
    sync: () => made?.sync(),
    /** The site's page was drawn: the rest loads a moment later (not on the way to the first paint), so the menu has it. */
    painted() {
      made?.sync();
      if (!later && ports.enabled()) later = Boolean(setTimeout(() => void load().then(() => made!.sync()), LATER_MS));
    },
  };
  return port;
}
