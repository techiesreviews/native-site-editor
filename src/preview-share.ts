// Share preview in the editor's boot code (slice 35; CONTEXT.md "Preview link"): the
// project menu's port. The rest (src/preview-later.ts: src/preview-control.ts and the menu's
// items, src/components/preview-menu.ts) loads a moment after the first paint, when the editor
// has a preview Worker, so the editor's start carries almost nothing of it; a link this
// browser keeps is served from then on.

import type { PreviewSharePorts, PreviewState } from "./preview-control";
import type { PreviewMenuPort } from "./components/repository-menu";

/** How long after the first paint the rest loads. */
const LATER_MS = 3_000;

export function createPreviewShare(ports: PreviewSharePorts) {
  let state: PreviewState = { on: false }, later = false;
  const listeners = new Set<(state: PreviewState) => void>();
  let loaded: Promise<{ made: ReturnType<typeof import("./preview-later").createPreviewControl>; draw: typeof import("./preview-later").previewItems }> | undefined;
  const load = () => loaded ??= import("./preview-later").then(({ createPreviewControl, previewItems }) => {
    const made = createPreviewControl(ports);
    made.watch((next) => { state = next; listeners.forEach((listener) => listener(next)); });
    return { made, draw: previewItems };
  });
  /** After a load or a paint: the link of the site shown is served, and another site's is not. */
  const sync = () => void loaded?.then(({ made }) => made.sync());
  const port: PreviewMenuPort & { sync(): void; painted(): void } = {
    state: () => state,
    available: () => state.on || (ports.enabled() && Boolean(ports.workspace()?.host)),
    watch(listener: (state: PreviewState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: async () => (await load()).made.start(),
    stop: async () => (await load()).made.stop(),
    draw: (actionClass: string, root: HTMLElement): Promise<{ refresh(): void; destroy(): void }> => load().then(({ draw }) => draw(port, actionClass, root)),
    sync,
    /** The site's page was drawn: the rest loads a moment later (not on the way to the first paint), so the menu has it. */
    painted() {
      sync();
      if (!later && ports.enabled()) later = Boolean(setTimeout(() => void load().then(({ made }) => made.sync()), LATER_MS));
    },
  };
  return port;
}
