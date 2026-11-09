// Edit together in the project menu (slice 30, ticket 58; mock-up 16, variant B), loaded on the menu's first open
// (src/workspace-shares.ts, src/shares-later.ts) and drawn into it (src/components/repository-menu.ts).
import "./person-chip.css";
import { initialOf } from "../person-name";
import type { ShareState } from "../share-control";
import { node } from "../ui/dom";
import { markTile, shareRow, type RowDot, type RowView } from "./share-row";

/** The session control the row drives (src/share-control.ts `createShareControl`). */
export interface ShareControlPort {
  state(): ShareState;
  /** Whether a site is shown to share (or a session is open): the row is pressable only then. */
  available(): boolean;
  watch(listener: (state: ShareState) => void): () => void;
  /** Starts sharing (or keeps the session open): its link, or undefined when there is nothing to share. */
  start(): Promise<string | undefined>;
  stop(): void;
}

/** How many guests show by initial at the row's end before a "+N". */
const GUESTS_SHOWN = 3;

/** The dot of an open session: grey while it reconnects, green with a guest in, else orange. */
function onDot(state: Extract<ShareState, { sharing: true }>): RowDot {
  return state.reconnecting ? "busy" : state.guests.length ? "on" : "wait";
}

/** The guests by initial, at most three and a "+N", each in the colour Lex's tab gave them. */
function chips(guests: Extract<ShareState, { sharing: true }>["guests"]) {
  const list = node("span", "share-row__people");
  list.setAttribute("aria-hidden", "true");
  const shown = guests.slice(0, GUESTS_SHOWN), rest = guests.slice(shown.length);
  list.append(...shown.map((guest) => {
    const chip = node("span", "person-chip", initialOf(guest.name));
    chip.dataset.colour = guest.colour;
    return chip;
  }), ...rest.length ? [node("span", "person-chip person-chip--more", `+${rest.length}`)] : []);
  return list;
}

/**
 * Edit together (ticket 58): one row, as Connect to MCP. Pressed with no session, it starts one and copies its link
 * ("Link copied"); then it waits for a collaborator ("Waiting for collaborator"), or names who joined ("Editing with
 * Anna, Ben") with their initials at the row's end. Pressed while sharing, it stops. A copy icon over the row's end
 * copies the link again. Dimmed while no site is shown.
 */
export function shareItems(port: ShareControlPort, actionClass: string, root: HTMLElement) {
  root.classList.add("share-rows");
  root.dataset.share = "edit";
  root.hidden = false;
  // A failed start, said on the row until the next press or a session opens.
  let failed: string | undefined;
  let destroyed = false;
  const view = (): RowView => {
    const state = port.state();
    if (!state.sharing) {
      if (!port.available()) return { label: "Edit together", dot: "idle", disabled: true };
      if (state.starting) return { label: "Making a link…", dot: "busy", disabled: true };
      return failed ? { label: failed, dot: "bad" } : { label: "Edit together", dot: "idle" };
    }
    const link = state.link, dot = onDot(state);
    if (dot === "busy") return { label: "Reconnecting…", dot, link };
    if (dot === "wait") return { label: "Waiting for collaborator", dot, link };
    return { label: `Editing with ${state.guests.map((guest) => guest.name).join(", ")}`, dot, link, end: [chips(state.guests)] };
  };
  const row = shareRow("Edit together", actionClass, view, () => {
    failed = undefined;
    if (port.state().sharing) { port.stop(); return; }
    port.start().then((link) => { if (link && !destroyed) return row.copy(link); }, (error: unknown) => {
      if (destroyed) return;
      // Signed out: signing in again is the way on. Anything else (no access any more, no connection): try again.
      failed = (error as { status?: unknown } | null)?.status === 401 ? "Sign in to share" : "Couldn't make a link · try again";
      row.draw();
    });
  });
  root.replaceChildren(row.root);
  const unwatch = port.watch((state) => { if (state.sharing) failed = undefined; row.draw(); });
  return { refresh: row.draw, destroy() { destroyed = true; unwatch(); row.destroy(); } };
}

/** The project tile's dot follows the session. Returns the way to mark the tile again (a new tile). */
export function editTile(port: Pick<ShareControlPort, "state" | "watch">, tile: () => HTMLElement | undefined) {
  const mark = () => { const state = port.state(); markTile(tile(), "edit", state.sharing ? onDot(state) : undefined); };
  port.watch(mark);
  mark();
  return mark;
}
