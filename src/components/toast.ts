import "./toast.css";
import { TOAST_MS, toastLift, toastResume } from "./toast-rules";

// The editor's one visible confirmation (media-manager slice 105): one line
// naming what was done, at most one action (Undo), bottom-centre on a
// computer and tablet, full width less 8 px on a phone. It stays 6 s, held
// while hovered or focused; a newer toast replaces it, and it goes as soon
// as the #status live region says something else (a refusal, another page).
// #status stays the one announcement; the toast is what the eye sees.
//
// It is a manual popover, so it shows over the explorer and dialogs. It
// lives inside the topmost open modal dialog or popover: outside it, a modal
// would make it inert and a click on it would close the explorer.

export interface ToastAction { label: string; run(): void }

let toast: HTMLElement | undefined, words: HTMLElement, button: HTMLButtonElement;
let shown = "", action: ToastAction | undefined, timer: number | undefined, ends = 0, held = 0;
let returnFocus: HTMLElement | undefined;

// Keep out from under these: a pinned action row (data-toast-avoid) and any primary button.
const AVOID = "[data-toast-avoid], .primary";

function build() {
  toast = document.createElement("div");
  toast.className = "editor-toast";
  toast.popover = "manual";
  words = document.createElement("span");
  words.className = "editor-toast__text";
  button = document.createElement("button");
  button.type = "button";
  button.className = "button editor-toast__action";
  button.addEventListener("click", () => { const chosen = action; dismissToast(); chosen?.run(); });
  toast.append(words, button);
  toast.addEventListener("pointerenter", hold);
  toast.addEventListener("pointerleave", release);
  toast.addEventListener("focusin", (event) => {
    if (!toast!.contains(event.relatedTarget as Node | null)) {
      returnFocus = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : undefined;
      hold();
    }
  });
  toast.addEventListener("focusout", (event) => { if (!toast!.contains(event.relatedTarget as Node | null)) release(); });
  toast.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); dismissToast(); } });
  // A layer opened over the toast takes it in (else it sits under it, and a click on it would
  // close it); a layer that held it closed hands it to the next one down.
  const moved = (event: Event) => {
    const target = event.target, host = toast!.parentElement;
    if (!(target instanceof HTMLElement) || target === toast || !host || !toast!.matches(":popover-open")) return;
    if (target.matches(":popover-open, dialog:modal") ? !host.contains(target) : target.contains(host)) place();
  };
  document.addEventListener("toggle", moved, true);
  document.addEventListener("close", moved, true);
  const status = document.getElementById("status");
  if (status) new MutationObserver(() => { if (status.textContent !== shown) dismissToast(); }).observe(status, { childList: true, characterData: true, subtree: true });
}

/** The topmost open modal dialog, else the topmost open auto popover, else the page. */
function layer(): HTMLElement {
  const open = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
    .filter(element => element !== toast && element.getAttribute("popover") !== "manual" && !element.closest("[hidden]"));
  return open("dialog:modal").at(-1) ?? open("[popover]:popover-open").at(-1) ?? document.body;
}

/** Into the topmost layer, shown, then lifted above anything it would cover. */
function place() {
  const into = layer();
  if (toast!.parentElement !== into) {
    if (toast!.matches(":popover-open")) toast!.hidePopover();
    into.append(toast!);
  }
  toast!.style.removeProperty("--toast-lift");
  if (!toast!.matches(":popover-open")) toast!.showPopover();
  const box = toast!.getBoundingClientRect();
  // Only the layer's own buttons: what it covers is out of sight anyway.
  const obstacles = [...into.querySelectorAll<HTMLElement>(AVOID)]
    .filter(element => !toast!.contains(element) && element.checkVisibility())
    .map(element => element.getBoundingClientRect());
  const lift = toastLift(box, obstacles, innerHeight);
  if (lift) toast!.style.setProperty("--toast-lift", `${Math.round(lift)}px`);
}

function schedule(ms: number) {
  clearTimeout(timer);
  ends = performance.now() + ms;
  timer = window.setTimeout(dismissToast, ms);
}
function hold() {
  if (!held++) clearTimeout(timer);
}
function release() {
  if (held && !--held) schedule(toastResume(ends - performance.now()));
}

/** Shows `text` as the toast, replacing any other, with `next` as its one action. */
export function showToast(text: string, next?: ToastAction) {
  if (!text.trim()) return;
  if (!toast) build();
  shown = text;
  action = next;
  words.textContent = text;
  button.textContent = next?.label ?? "";
  button.hidden = !next;
  // Replaced under the pointer or the focus, it is held; its focus goes back if its button went.
  const focused = toast!.contains(document.activeElement);
  held = (toast!.matches(":hover") ? 1 : 0) + (focused && next ? 1 : 0);
  if (focused && !next) returnFocus?.focus();
  place();
  if (!held) schedule(TOAST_MS);
}

/** Says `text` in the #status live region and shows it as the toast. */
export function say(text: string, next?: ToastAction) {
  const status = document.getElementById("status");
  if (status) status.textContent = text;
  showToast(text, next);
}

/** Hides the toast; the focus it held goes back where it came from. */
export function dismissToast() {
  clearTimeout(timer);
  if (!toast?.matches(":popover-open")) return;
  const focused = toast.contains(document.activeElement);
  toast.hidePopover();
  held = 0;
  if (focused && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = undefined;
}
