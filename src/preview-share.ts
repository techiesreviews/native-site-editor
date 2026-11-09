// Share preview in the editor's boot code (slice 35; CONTEXT.md "Preview link"): the
// project menu's port. The rest (src/shares-later.ts: src/preview-control.ts and the menu's
// items, src/components/preview-menu.ts) loads a moment after the first paint, when the editor
// has a preview Worker, so the editor's start carries almost nothing of it; a link this
// browser keeps is served from then on. The menu's items talk to the loaded control itself.

import type { PreviewSharePorts } from "./preview-control";
import type { SharesMenuPort } from "./components/repository-menu";

/** How long after the first paint the rest loads. */
const LATER_MS = 3_000;

export function createPreviewShare(ports: PreviewSharePorts) {
  let later = false, made: ReturnType<typeof import("./shares-later").createPreviewControl> | undefined;
  let loaded: Promise<typeof import("./shares-later")> | undefined;
  // The project tile, and the way to mark it once the rest has loaded: its dot follows the link, menu open or not.
  let tile: HTMLElement | undefined, mark: (() => void) | undefined;
  const load = () => loaded ??= import("./shares-later").then((rest) => {
    made = rest.createPreviewControl(ports);
    mark = rest.previewTile(made, () => tile);
    return rest;
  });
  const port: SharesMenuPort & { sync(): void; painted(): void } = {
    offered: () => ports.enabled(),
    draw: (actionClass, root) => load().then(({ previewItems }) => previewItems(made!, actionClass, root)),
    tile(trigger) { tile = trigger; mark?.(); },
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
