// One sharing row in the project menu (ticket 58; mock-up 16, variant B): Preview link (src/components/preview-menu.ts)
// and Edit together (src/components/share-menu.ts) each draw one, as Connect to MCP is drawn
// (src/components/agent-menu.ts): a leading dot that is the only status, then the label. The row is the only control;
// while a link is on, a copy icon fades in over the row's end. Loaded with the items (src/shares-later.ts).
import "./share-row.css";
import { setIcon } from "../icons";
import { node } from "../ui/dom";

/** How long "Link copied" (and the copy icon's check) stays before the row reads as before. */
const COPIED_MS = 2500;

/** The dot: grey at rest, pulsing grey while busy, pulsing orange while waiting, green with someone there, red for a problem. */
export type RowDot = "idle" | "busy" | "wait" | "on" | "bad";
export interface RowView {
  label: string;
  dot: RowDot;
  /** Not pressable now (making a link, no site open): `aria-disabled`, so the keyboard's focus stays. */
  disabled?: boolean;
  /** The link while it is on: the copy icon shows, and the label "Link copied" a moment after copying. */
  link?: string;
  /** Shown at the row's end (the guests' chips). */
  end?: readonly Node[];
}

/**
 * A sharing row named `name` (its idle label). `view` says what it shows now; `press` runs on a click, Enter or Space
 * when it is pressable. `copy` copies a link and says so on the row; a copy the browser refuses leaves the copy icon
 * showing, focused, to press again (a fresh press the browser allows).
 */
export function shareRow(name: string, actionClass: string, view: () => RowView, press: () => void) {
  const root = node("div", "link-row");
  const main = node("button", `${actionClass} link-row__main`);
  main.type = "button";
  main.dataset.keepOpen = "";
  // Read before the label when it does not name the row itself ("Waiting for customer" says nothing of which link).
  const which = node("span", "sr-only");
  const label = node("span", "link-row__label");
  label.setAttribute("aria-live", "polite");
  const end = node("span", "link-row__end");
  main.append(which, label, end);
  // Layered over the row's end (no room kept for it): the faded background, then the button.
  const action = node("span", "link-row__action");
  const copyButton = node("button", "link-row__copy");
  copyButton.type = "button";
  copyButton.dataset.keepOpen = "";
  copyButton.setAttribute("aria-label", "Copy link");
  const mark = node("span", "link-row__copy-icon");
  mark.setAttribute("aria-hidden", "true");
  copyButton.append(mark);
  action.append(copyButton);
  root.append(main, action);

  // `note`: what the last copy did, said on the label for a moment. `blocked`: the browser refused it, so the copy icon
  // stays shown until a copy works or the link is off.
  let note: "copied" | "blocked" | undefined, blocked = false, destroyed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const forget = () => { note = undefined; blocked = false; clearTimeout(timer); };
  const draw = () => {
    const now = view();
    const on = now.link !== undefined;
    if (!on) forget();
    root.dataset.dot = now.dot;
    // A note never hides a state that matters more: busy (making, reconnecting, stopping), a problem, or not pressable.
    const said = note && !now.disabled && (now.dot === "wait" || now.dot === "on") ? note : undefined;
    const copied = said === "copied";
    const word = copied ? "Link copied" : said === "blocked" ? "Link ready · copy it" : now.label;
    if (label.textContent !== word) label.textContent = word;
    const context = word === name ? "" : `${name}: `;
    if (which.textContent !== context) which.textContent = context;
    main.setAttribute("aria-disabled", String(Boolean(now.disabled)));
    if (on && !now.disabled) main.setAttribute("aria-description", "Press to stop the link");
    else main.removeAttribute("aria-description");
    end.replaceChildren(...copied ? [] : now.end ?? []);
    end.hidden = !end.firstChild;
    // Not while the link is stopping: it would hand out a link that is being turned off.
    action.hidden = !on || Boolean(now.disabled);
    root.classList.toggle("is-done", copied || blocked);
    copyButton.classList.toggle("is-done", copied);
    const icon = copied ? "check" : "copy";
    if (mark.dataset.icon !== icon) { mark.dataset.icon = icon; setIcon(mark, icon, 16); }
  };
  const copy = async (link: string) => {
    let done = true;
    try { await navigator.clipboard.writeText(link); } catch { done = false; }
    if (destroyed || view().link !== link) return;
    note = done ? "copied" : "blocked";
    blocked = !done;
    clearTimeout(timer);
    timer = setTimeout(() => { note = undefined; if (!destroyed) draw(); }, COPIED_MS);
    draw();
    if (!done) copyButton.focus();
  };
  main.addEventListener("click", () => {
    if (main.getAttribute("aria-disabled") === "true") return;
    // A press makes or stops the link: what the last copy did no longer applies.
    forget();
    press();
  });
  copyButton.addEventListener("click", () => { const link = view().link; if (link !== undefined) void copy(link); });
  draw();
  return { root, draw, copy, destroy() { destroyed = true; clearTimeout(timer); } };
}

const tiles = new WeakMap<HTMLElement, Partial<Record<"preview" | "edit", RowDot>>>();
/**
 * The project tile's dot (`data-shared` on its trigger): shown while either link is on, green with someone there,
 * else orange while one waits, else grey (reconnecting, stopping). `dot` is undefined once that link is off.
 */
export function markTile(tile: HTMLElement | undefined, which: "preview" | "edit", dot: RowDot | undefined) {
  if (!tile) return;
  const marks = { ...tiles.get(tile), [which]: dot };
  tiles.set(tile, marks);
  const dots = Object.values(marks).filter(Boolean);
  const shown = dots.includes("on") ? "on" : dots.includes("wait") ? "wait" : dots.length ? "busy" : undefined;
  if (shown) tile.dataset.shared = shown;
  else delete tile.dataset.shared;
}
