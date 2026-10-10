/** A refusal stays announced even when its nearby control is hidden. */
export interface RefusalNear {
  anchor?: HTMLElement;
  history?: "undo" | "redo";
  pointer?: { x: number; y: number };
  /** A flash or drop label already displays this reason. */
  visible?: HTMLElement;
}
interface Rect { left: number; top: number; width: number; height: number }

/** Pure presentation rules; the DOM adapter supplies only visible anchors. */
export function refusalNotePlan(input: {
  viewport: { width: number; height: number };
  size: { width: number; height: number };
  anchor?: Rect;
  editBar?: Rect;
  canvas?: Rect;
  pointer?: { x: number; y: number };
  visible?: boolean;
  age?: number;
  action?: boolean;
}) {
  const { viewport, size, pointer } = input;
  const anchor = input.anchor ?? input.editBar ?? input.canvas;
  const x = pointer ? pointer.x + 14 : (anchor?.left ?? 8);
  const bottom = pointer ? pointer.y + 10 : anchor ? anchor.top + (anchor === input.canvas ? 0 : anchor.height) + 8 : 8;
  const above = pointer ? pointer.y - size.height - 10 : (anchor?.top ?? 8) - size.height - 8;
  const clamp = (value: number, total: number, length: number) => Math.max(8, Math.min(value, total - length - 8));
  return {
    show: !input.visible && !input.action && (input.age ?? 0) < 4000,
    left: clamp(x, viewport.width, size.width),
    top: clamp(bottom + size.height <= viewport.height - 8 ? bottom : above, viewport.height, size.height),
    duration: Math.max(0, 4000 - (input.age ?? 0)),
  };
}

/** Whether two boxes overlap: a reason shown under the edit bar is not readable there. */
export function overlaps(a: Rect, b: Rect) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

let dismiss: (() => void) | undefined;
/** Dismiss the current note after an action forwarded by the preview link. */
export function dismissRefusalNote() { dismiss?.(); }

let said = 0;
/** How many refusals were said so far: a caller can tell whether a step it ran said one. */
export const refusalsSaid = () => said;
function visibleRect(element: HTMLElement | undefined): DOMRect | undefined {
  if (!element?.isConnected || element.closest("[hidden]")) return undefined;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.visibility !== "hidden" && style.display !== "none" ? rect : undefined;
}
function firstVisible(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(element => visibleRect(element));
}

/** Announce and show a non-interactive note; the next action replaces/dismisses it. */
export function refuse(reason: string, near: RefusalNear = {}) {
  said++;
  // Rules/controllers also run without a DOM in unit tests.
  if (typeof document === "undefined" || typeof window === "undefined" || !document.body?.append) return;
  dismiss?.();
  const status = document.getElementById("status");
  if (status) status.textContent = reason;
  const existing = near.visible;
  const bar = visibleRect(firstVisible('.edit-bar[role="toolbar"]'));
  const shown = visibleRect(existing);
  // A reason already on screen, unless the edit bar covers it.
  const readable = Boolean(shown && !(bar && overlaps(shown, bar)));
  const note = readable ? undefined : document.createElement("div");
  if (note) {
    note.className = "refusal-note";
    note.textContent = reason;
    // #status is the single announcement; the note is a visual duplicate.
    note.setAttribute("aria-hidden", "true");
    document.body.append(note);
    const plan = refusalNotePlan({
      viewport: { width: innerWidth, height: innerHeight },
      size: { width: note.offsetWidth, height: note.offsetHeight },
      anchor: visibleRect(near.anchor ?? (near.history ? firstVisible(`.code-editor__${near.history}`) : undefined)),
      editBar: bar,
      canvas: visibleRect(firstVisible(".native-preview-pane, #main")),
      pointer: near.pointer,
      visible: readable,
    });
    if (!plan.show) note.remove();
    Object.assign(note.style, { left: `${plan.left}px`, top: `${plan.top}px` });
  }
  const onAction = () => clear();
  const clear = () => {
    clearTimeout(timer);
    note?.remove();
    window.removeEventListener("pointerdown", onAction, true);
    window.removeEventListener("keydown", onAction, true);
    if (dismiss === clear) dismiss = undefined;
  };
  const timer = window.setTimeout(onAction, refusalNotePlan({ viewport: { width: innerWidth, height: innerHeight }, size: { width: 0, height: 0 } }).duration);
  dismiss = clear;
  window.addEventListener("pointerdown", onAction, true);
  window.addEventListener("keydown", onAction, true);
}
