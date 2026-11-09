// Share to edit's items in the project menu (slice 30; mock-up 14), loaded on the menu's first open
// (src/workspace-shares.ts, src/shares-later.ts) and drawn into it (src/components/repository-menu.ts).
import { setIcon } from "../icons";
import { initialOf } from "../person-name";
import type { ShareState } from "../share-control";
import { button, node } from "../ui/dom";
import { COPIED_MS } from "./repository-menu";

/** The session control the items drive (src/share-control.ts `createShareControl`). */
export interface ShareControlPort {
  state(): ShareState;
  /** Whether a site is shown to share: the items show only then. */
  available(): boolean;
  watch(listener: (state: ShareState) => void): () => void;
  /** Starts sharing (or keeps the session open): its link, or undefined when there is nothing to share. */
  start(): Promise<string | undefined>;
  stop(): void;
}

/** How many guests show by initial beside the project tile before a "+N". */
const GUESTS_SHOWN = 3;

/**
 * Share to edit (slice 30; mock-up 14): "Share to edit" starts a synced session and copies its link; while it lasts,
 * "Copy edit link" and "Stop sharing". A copied link says so on the item itself for a moment ("Link copied"), read out
 * to screen readers; a copy the browser refuses shows the link to copy by hand. Who joined shows beside the project
 * tile, by initial, at most three and a "+N". The items show only while a site is shown.
 */
export function shareItems(port: ShareControlPort, actionClass: string) {
  const root = node("div", "repository-menu__share");
  const main = node("button", `${actionClass} repository-menu__share-item`);
  main.type = "button";
  main.dataset.keepOpen = "";
  // Each item leads with its icon (mock-up 14): live for Share to edit, copy, a check once copied, stop.
  const mark = node("span", "repository-menu__share-icon");
  mark.setAttribute("aria-hidden", "true");
  const label = node("span", "repository-menu__share-label");
  label.setAttribute("aria-live", "polite");
  main.append(mark, label);
  const stop = button("Stop sharing", () => port.stop(), actionClass);
  const stopMark = node("span", "repository-menu__share-icon");
  stopMark.setAttribute("aria-hidden", "true");
  setIcon(stopMark, "stop", 16);
  stop.prepend(stopMark);
  const field = node("input", "repository-menu__share-link");
  field.readOnly = true;
  field.setAttribute("aria-label", "Edit link");
  field.addEventListener("focus", () => field.select());
  root.append(main, field, stop);
  const people = node("ul", "repository-menu__people");
  people.setAttribute("aria-label", "Editing with you");
  let copied: "yes" | "failed" | undefined;
  // A refusal said on the item for a moment: signed out, or anything else.
  let refused: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const draw = () => {
    const state = port.state();
    root.hidden = !port.available();
    const word = refused ?? (state.sharing
      ? copied === "yes" ? "Link copied" : copied === "failed" ? "Copy the link below" : "Copy edit link"
      : state.starting ? "Sharing…" : "Share to edit");
    if (label.textContent !== word) label.textContent = word;
    main.classList.toggle("is-done", copied === "yes");
    const icon = copied === "yes" ? "check" : state.sharing ? "copy" : "broadcast";
    if (mark.dataset.icon !== icon) { mark.dataset.icon = icon; setIcon(mark, icon, 16); }
    // Not `disabled`: a focused button that is disabled drops the keyboard's focus out of the menu.
    main.setAttribute("aria-disabled", String(!state.sharing && Boolean(state.starting)));
    stop.hidden = !state.sharing;
    field.hidden = !(state.sharing && copied === "failed");
    if (state.sharing) field.value = state.link;
    const guests = state.sharing ? state.guests : [];
    people.hidden = !guests.length;
    const shown = guests.slice(0, GUESTS_SHOWN);
    const rest = guests.slice(shown.length);
    people.replaceChildren(...shown.map((guest) => {
      const item = node("li", "person-chip", initialOf(guest.name));
      item.title = `${guest.name} (guest)`;
      item.setAttribute("aria-label", `${guest.name}, a guest`);
      item.dataset.colour = guest.colour;
      return item;
    }), ...rest.length ? [(() => {
      const more = node("li", "person-chip person-chip--more", `+${rest.length}`);
      more.title = rest.map((guest) => guest.name).join(", ");
      more.setAttribute("aria-label", `and ${rest.map((guest) => guest.name).join(", ")}, guests`);
      return more;
    })()] : []);
  };
  const later = (then: () => void) => { clearTimeout(timer); timer = setTimeout(() => { if (!destroyed) then(); }, COPIED_MS); };
  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); copied = "yes"; }
    catch { copied = "failed"; }
    if (destroyed) return;
    draw();
    if (copied === "failed") { clearTimeout(timer); field.focus(); return; }
    later(() => { copied = undefined; draw(); });
  };
  main.addEventListener("click", () => {
    const state = port.state();
    if (state.sharing) { void copy(state.link); return; }
    if (state.starting) return;
    port.start().then((link) => { if (link && !destroyed) return copy(link); }, (error: unknown) => {
      if (destroyed) return;
      // Signed out: signing in again is the way on. Anything else (no access any more, no connection): said as such.
      refused = (error as { status?: unknown } | null)?.status === 401 ? "Sign in to share" : "Couldn't share";
      draw();
      later(() => { refused = undefined; draw(); });
    });
  });
  const unwatch = port.watch((state) => { if (!state.sharing) { copied = undefined; } draw(); });
  draw();
  return { root, people, refresh: draw, destroy() { destroyed = true; unwatch(); clearTimeout(timer); } };
}
