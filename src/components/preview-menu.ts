// Preview link in the project menu (slice 35, ticket 58; mock-up 16, variant B), loaded after the editor's first paint
// (src/preview-share.ts) and drawn when the menu first opens (src/components/repository-menu.ts).
import type { PreviewState } from "../preview-control";
import { markTile, shareRow, type RowDot, type RowView } from "./share-row";

/** The preview control the row drives (src/preview-control.ts `createPreviewControl`). */
export interface PreviewControlPort {
  state(): PreviewState;
  /** Whether a site is shown to share (or a link is on): the row is pressable only then. */
  available(): boolean;
  watch(listener: (state: PreviewState) => void): () => void;
  /** Makes a link (or keeps the one on) and resolves its address; throws with the refusal's `status`. */
  start(): Promise<string | undefined>;
  /** Turns the link off; throws when the editor could not. */
  stop(): Promise<void>;
}

/** The dot of a link that is on: grey while it reconnects or stops, green while someone watches, else orange. */
function onDot(state: Extract<PreviewState, { on: true }>): RowDot {
  return state.stopping || state.reconnecting ? "busy" : state.watching ? "on" : "wait";
}

/**
 * Preview link (ticket 58): one row, as Connect to MCP. Pressed with no link, it makes one and copies it ("Link copied");
 * then it waits for a customer ("Waiting for customer"), or counts them ("1 watching"). Pressed while on, it turns the
 * link off. A copy icon over the row's end copies the link again. Dimmed while no site is shown.
 */
export function previewItems(port: PreviewControlPort, actionClass: string, root: HTMLElement) {
  root.classList.add("link-rows");
  root.dataset.share = "preview";
  root.hidden = false;
  // A failed make or turn-off, said on the row until the next press or the link changes.
  let failed: string | undefined;
  let wasOn = port.state().on;
  let destroyed = false;
  const view = (): RowView => {
    const state = port.state();
    if (!state.on) {
      if (!port.available()) return { label: "Preview link", dot: "idle", disabled: true };
      if (state.starting) return { label: "Making a link…", dot: "busy", disabled: true };
      return failed ? { label: failed, dot: "bad" } : { label: "Preview link", dot: "idle" };
    }
    const link = state.link;
    if (state.stopping) return { label: "Stopping…", dot: "busy", disabled: true, link };
    if (failed) return { label: failed, dot: "bad", link };
    if (state.reconnecting) return { label: "Reconnecting…", dot: "busy", link };
    if (state.watching) return { label: `${state.watching} watching`, dot: "on", link };
    return { label: "Waiting for customer", dot: "wait", link };
  };
  const row = shareRow("Preview link", actionClass, view, () => {
    failed = undefined;
    const state = port.state();
    if (state.on) {
      // Said only on the link it was for: another project's kept link may show by the time the turn-off fails.
      port.stop().catch(() => {
        const now = port.state();
        if (destroyed || !now.on || now.link !== state.link) return;
        failed = "Couldn't stop · try again";
        row.draw();
      });
      return;
    }
    port.start().then((link) => { if (link && !destroyed) return row.copy(link); }, (error: unknown) => {
      // Another project's link may be on by now: the refusal was not about it.
      if (destroyed || port.state().on) return;
      failed = (error as { status?: unknown } | null)?.status === 401 ? "Sign in to share" : "Couldn't make a link · try again";
      row.draw();
    });
  });
  root.replaceChildren(row.root);
  const unwatch = port.watch((state) => {
    if (state.on !== wasOn) failed = undefined;
    wasOn = state.on;
    row.draw();
  });
  return { refresh: row.draw, destroy() { destroyed = true; unwatch(); row.destroy(); } };
}

/** The project tile's dot follows the preview link, menu open or not (the control serves a kept link by itself).
 * Returns the way to mark the tile again (a new tile). */
export function previewTile(port: Pick<PreviewControlPort, "state" | "watch">, tile: () => HTMLElement | undefined) {
  const mark = () => { const state = port.state(); markTile(tile(), "preview", state.on ? onDot(state) : undefined); };
  port.watch(mark);
  mark();
  return mark;
}
