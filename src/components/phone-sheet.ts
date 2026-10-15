import "./phone-sheet-handle.css";
import { dragSize, firstSize, keySheet, readSheet, settleSheet, sheetBounds, type SheetState } from "./phone-sheet-rules";

// The phone sheet (phone-sheet.css; loaded only on a phone-wide window): Page
// structure and the code under the page, folded until pulled up. A tap or
// Enter/Space on the handle opens or folds it; a drag follows the finger and
// settles by distance or flick (phone-sheet-rules.ts); arrow keys, Home and
// End resize it. The state lasts for the session. Showing the structure or the
// code another way (the command palette) opens it.

const key = "ase.phone-sheet";
/** Release speed is read over the last this many ms of a drag. */
const sampleMs = 100;

export function mountPhoneSheet(workspace: HTMLElement, handle: HTMLButtonElement) {
  const sidebar = workspace.querySelector<HTMLElement>(":scope > .sidebar")!;
  const main = workspace.querySelector<HTMLElement>(":scope > main")!;
  const split = main.querySelector<HTMLElement>(":scope > .code-split")!;
  let state: SheetState = readSheet(sessionStorage.getItem(key)) ?? { open: false, size: 0 };
  // On a phone-wide window with a page on the canvas (phone-sheet.css shows the handle then).
  const active = () => getComputedStyle(handle).display !== "none";
  // The room the page and the open sheet share.
  const space = () => workspace.clientHeight - (workspace.querySelector<HTMLElement>(":scope > .block-rail")?.offsetHeight ?? 0) - handle.offsetHeight;
  const bounds = () => sheetBounds(space());
  const last = () => state.size || firstSize(space());
  const shown = () => {
    const { min, max } = bounds();
    return state.open ? Math.max(min, Math.min(max, state.size)) : 0;
  };
  function apply(size = shown()) {
    workspace.style.setProperty("--sheet-size", `${size}px`);
    workspace.classList.toggle("sheet-open", state.open);
    handle.setAttribute("aria-expanded", String(state.open));
    const inside = document.activeElement;
    if (!state.open && inside && (sidebar.contains(inside) || split.contains(inside))) handle.focus();
  }
  function set(next: SheetState) {
    state = { open: next.open, size: next.size > 0 ? next.size : firstSize(space()) };
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {}
    apply();
  }

  // A press that moved past 4 px is a drag; the click after it is not a tap.
  let drag: { y: number; size: number; samples: { y: number; t: number }[]; moved: boolean } | undefined;
  let dragged = false;
  handle.addEventListener("pointerdown", (event) => {
    dragged = false;
    if (event.button !== 0 || !active()) return;
    // Caught mid-way, the sheet goes on from where it is on screen.
    const now = Number.parseFloat(getComputedStyle(workspace).getPropertyValue("--sheet-size")) || 0;
    drag = { y: event.clientY, size: now, samples: [{ y: event.clientY, t: event.timeStamp }], moved: false };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientY - drag.y) < 4) return;
    drag.moved = true;
    workspace.classList.add("sheet-dragging");
    drag.samples.push({ y: event.clientY, t: event.timeStamp });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > sampleMs) drag.samples.shift();
    workspace.style.setProperty("--sheet-size", `${dragSize(drag.size + drag.y - event.clientY, bounds())}px`);
  });
  const release = (event: PointerEvent, done: boolean) => {
    const press = drag;
    drag = undefined;
    if (!press?.moved) return;
    dragged = true;
    workspace.classList.remove("sheet-dragging");
    if (!done) return apply();
    const first = press.samples[0];
    const time = event.timeStamp - first.t;
    // Upward is positive: the sheet opening.
    const velocity = time > 0 ? (first.y - event.clientY) / time : 0;
    const size = Math.max(0, press.size + press.y - event.clientY);
    set(settleSheet(size, velocity, last(), bounds()));
  };
  handle.addEventListener("pointerup", (event) => release(event, true));
  handle.addEventListener("pointercancel", (event) => release(event, false));
  handle.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    set({ open: !state.open, size: state.size });
  });
  handle.addEventListener("keydown", (event) => {
    const next = keySheet(event.key, { open: state.open, size: last() }, bounds());
    if (!next) return;
    event.preventDefault();
    set(next);
  });

  // Page structure or the code shown while folded (the palette's Show commands): open, so it is seen.
  let hidden = { structure: workspace.classList.contains("workspace--sidebar-collapsed"), code: main.classList.contains("code-collapsed") };
  const watch = new MutationObserver(() => {
    const now = { structure: workspace.classList.contains("workspace--sidebar-collapsed"), code: main.classList.contains("code-collapsed") };
    const reshown = (hidden.structure && !now.structure) || (hidden.code && !now.code);
    hidden = now;
    if (reshown && !state.open && active()) set({ open: true, size: state.size });
  });
  watch.observe(workspace, { attributes: true, attributeFilter: ["class"] });
  watch.observe(main, { attributes: true, attributeFilter: ["class"] });
  // The room changes with the window (and the top bar's rows): an open sheet keeps within it.
  const resize = new ResizeObserver(() => {
    if (!drag) apply();
  });
  resize.observe(workspace);
  apply();
}
