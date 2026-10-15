// The media popup's frame (slice 109): the window a media spot's popup lives in, so the Image
// popup and the Media popup for video, audio, downloads and Online videos (slice 119) look and behave alike.
// A head (title, file name, tools, ✕), a line for notes, compact rows (label left on computer,
// above on phones) and a bottom strip: one quiet message line beside Done on computer, above the
// buttons on phones. Beside the selected spot, level with the edit bar, its nub towards the bar's
// button; a bottom sheet on phones; opened from a button inside a dialog (Settings' Social image),
// a centred layer above that dialog on its surface. It does not trap Tab (as Brizy's). Escape, ✕,
// a press outside or the bar moving on cancel it; the content decides what Done means.
import { node } from "../ui/dom";
import { icon } from "../icons";
import { placePopup, type PopupRect } from "./image-popup-rules";

export interface MediaPopupHost {
  /** The selected spot's box in the window, while the edit bar shows it. */
  image(): PopupRect | undefined;
  /** The edit bar (the popup stands level with it and follows it). */
  bar(): HTMLElement | null;
  /** The button that opened a popup outside the edit bar (Settings' Social image): a centred layer above its dialog. */
  button?(): HTMLElement | null;
}

export interface MediaPopupFrameOptions {
  title: string;
  /** The edit bar's button that opens this popup (its class); it shows the popup is open. */
  opener: string;
  className?: string;
  /** Leaving without Done: ✕, Escape, a press outside, the bar gone. */
  cancel(): void;
  /** ✕'s name: "Close without changes" unless each change already applied (the Media popup's). */
  closeLabel?: string;
  /** Escape inside the popup: true when the content used it (a menu closed). */
  escape?(): boolean;
  /** The window was resized or the bar moved: the content lays itself out again. */
  resized?(): void;
}

export const phonePopup = () => matchMedia("(max-width: 700px)").matches;

export function actionButton(className: string, action: () => void) {
  const item = node("button", className);
  item.type = "button";
  item.addEventListener("click", action);
  return item;
}

/** A row: its label, then its control (beside it on computer, under it on phones). */
export function popupRow(label: string, content: HTMLElement, className = "") {
  const item = node("div", `image-popup__row ${className}`.trim());
  item.append(node("span", "image-popup__label", label), content);
  return item;
}

export function mountMediaPopupFrame(host: MediaPopupHost, options: MediaPopupFrameOptions) {
  const root = node("div", `image-popup ${options.className ?? ""}`.trim());
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-labelledby", "image-popup-title");
  const nub = node("span", "image-popup__nub"); nub.setAttribute("aria-hidden", "true");
  const grab = node("span", "image-popup__grab"); grab.setAttribute("aria-hidden", "true");
  const title = node("b", "", options.title); title.id = "image-popup-title";
  const where = node("span", "image-popup__where");
  /** Icon tools before ✕ (the Image popup's Open large editor). */
  const tools = node("span", "image-popup__tools");
  const close = actionButton("image-popup__icon", () => options.cancel());
  const closeLabel = options.closeLabel ?? "Close without changes";
  close.append(icon("x", 18)); close.setAttribute("aria-label", closeLabel); close.title = `${closeLabel} (Esc)`;
  tools.append(close);
  const head = node("div", "image-popup__head"); head.append(title, where, tools);
  const notice = node("p", "image-popup__notice"); notice.setAttribute("role", "status"); notice.hidden = true;
  const rows = node("div", "image-popup__rows");
  const message = node("p", "image-popup__message"); message.setAttribute("role", "status");
  const foot = node("div", "image-popup__foot");
  const bottom = node("div", "image-popup__bottom"); bottom.append(message, foot);
  root.append(nub, grab, head, notice, rows, bottom);

  const openerButton = () => host.button ? host.button() : host.bar()?.querySelector<HTMLButtonElement>(options.opener) ?? null;
  // From a button in a dialog: its own modal layer above it (the dialog stays whole under the backdrop).
  const opened = host.button?.();
  const layer = opened ? node("dialog", "image-popup-layer") : undefined;
  if (layer) {
    layer.setAttribute("aria-labelledby", title.id);
    root.removeAttribute("role"); root.removeAttribute("aria-labelledby");
    layer.append(root);
    (opened!.closest("dialog") ?? document.body).append(layer);
    layer.addEventListener("cancel", event => { event.preventDefault(); options.cancel(); });
    layer.showModal();
  } else document.body.append(root);

  /** Beside the spot, level with the edit bar, its nub towards the bar's button; a sheet on phones; a layer centres itself. */
  function place() {
    if (layer || phonePopup()) { root.style.left = root.style.top = ""; return; }
    const image = host.image(), bar = host.bar(), barBox = bar && !bar.hidden ? bar.getBoundingClientRect() : undefined;
    if (!image || !barBox?.width) return;
    const size = { width: root.offsetWidth, height: root.offsetHeight };
    const at = placePopup(image, barBox, size, { width: document.documentElement.clientWidth, height: innerHeight });
    root.dataset.side = at.side;
    root.style.left = `${at.left}px`; root.style.top = `${at.top}px`;
    const target = (openerButton() ?? bar)!.getBoundingClientRect();
    const clamp = (value: number, high: number) => Math.round(Math.max(12, Math.min(high, value)));
    if (at.side === "below") root.style.setProperty("--nub-x", `${clamp(target.left + target.width / 2 - at.left - 7, size.width - 26)}px`);
    else root.style.setProperty("--nub-y", `${clamp(target.top + target.height / 2 - at.top - 7, size.height - 26)}px`);
  }

  // Escape with nothing focused (a press on the page left the focus nowhere) closes it too.
  const stray = (event: KeyboardEvent) => {
    if (event.key === "Escape" && (document.activeElement === document.body || !document.activeElement)) { event.preventDefault(); options.cancel(); }
  };
  document.addEventListener("keydown", stray);
  root.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    if (!options.escape?.()) options.cancel();
  });
  // Leaving the popup without Done changes nothing: a press elsewhere (a layer's backdrop), another selection, the bar gone.
  const outside = (event: PointerEvent) => {
    const target = event.target as Element;
    // Another dialog (the Media picker from Replace) keeps it.
    const dialog = target.closest?.("dialog");
    if (root.contains(target) || openerButton()?.contains(target) || target.closest?.(options.opener) || dialog && dialog !== (layer ?? root.closest("dialog"))) return;
    options.cancel();
  };
  document.addEventListener("pointerdown", outside, true);
  const still = () => { if (openerButton()?.getAttribute("aria-expanded") !== "true") options.cancel(); else place(); };
  const bar = host.button ? null : host.bar(), pane = bar?.parentElement;
  const watch = new MutationObserver(() => queueMicrotask(still));
  if (bar) watch.observe(bar, { childList: true });
  const moved = () => { place(); options.resized?.(); };
  pane?.addEventListener("edit-bar-layout", moved);
  addEventListener("resize", moved);
  openerButton()?.setAttribute("aria-expanded", "true");

  return {
    root, where, tools, notice, rows, message, foot, place,
    remove() {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", stray);
      watch.disconnect();
      pane?.removeEventListener("edit-bar-layout", moved);
      removeEventListener("resize", moved);
      const focused = root.contains(document.activeElement);
      if (layer) { layer.close(); layer.remove(); } else root.remove();
      const button = openerButton();
      button?.setAttribute("aria-expanded", "false");
      if (focused || layer) button?.focus({ preventScroll: true });
    },
  };
}
