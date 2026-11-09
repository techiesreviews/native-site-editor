// Share preview's items in the project menu (slice 35; mock-up 15), loaded after the editor's first paint
// (src/preview-share.ts) and drawn when the menu first opens (src/components/repository-menu.ts).
import "./preview-menu.css";
import eye from "@phosphor-icons/core/regular/eye.svg?raw";
import { setIcon, sizedSvg, svgElement } from "../icons";
import { node } from "../ui/dom";
import { COPIED_MS, type PreviewMenuPort } from "./repository-menu";

/**
 * Share preview (slice 35; mock-up 15): "Share preview" makes a link and copies it; while it is on, the link with Copy
 * (which says "Copied" on itself for a moment), when it ends, and "Turn preview off". A refusal says so on the item for a
 * moment. Shown only when the editor has a preview Worker and a site is shown.
 */
export function previewItems(port: PreviewMenuPort, actionClass: string, root: HTMLElement) {
  const iconOf = (name: "eye" | "stop") => {
    const mark = node("span", "repository-menu__share-icon");
    mark.setAttribute("aria-hidden", "true");
    if (name === "eye") mark.append(svgElement(sizedSvg(eye, 16)));
    else setIcon(mark, name, 16);
    return mark;
  };
  const share = node("button", `${actionClass} repository-menu__preview-item`);
  share.type = "button";
  share.dataset.keepOpen = "";
  const shareLabel = node("span", "repository-menu__preview-label");
  shareLabel.setAttribute("aria-live", "polite");
  share.append(iconOf("eye"), shareLabel);
  // The link while it is on: its heading, the address with Copy, and when it ends.
  const box = node("div", "repository-menu__preview-link");
  const heading = node("span", "repository-menu__preview-heading");
  heading.id = "repository-menu-preview-heading";
  heading.append(iconOf("eye"), node("span", "", "Preview link"));
  const row = node("div", "repository-menu__preview-row");
  const field = node("input", "repository-menu__preview-field");
  field.readOnly = true;
  field.setAttribute("aria-labelledby", heading.id);
  field.addEventListener("focus", () => field.select());
  const copyButton = node("button", "button secondary repository-menu__preview-copy");
  copyButton.type = "button";
  copyButton.dataset.keepOpen = "";
  const copyMark = node("span", "repository-menu__share-icon");
  copyMark.setAttribute("aria-hidden", "true");
  const copyLabel = node("span", "", "Copy");
  copyLabel.setAttribute("aria-live", "polite");
  copyButton.append(copyMark, copyLabel);
  row.append(field, copyButton);
  const ends = node("small", "repository-menu__preview-ends");
  box.append(heading, row, ends);
  const off = node("button", `${actionClass} repository-menu__preview-item`);
  off.type = "button";
  off.dataset.keepOpen = "";
  const offLabel = node("span", "repository-menu__preview-label");
  offLabel.setAttribute("aria-live", "polite");
  off.append(iconOf("stop"), offLabel);
  root.append(share, box, off);

  let copied = false;
  // A refusal said on the item for a moment.
  let refused: string | undefined, offRefused: string | undefined;
  // Each label's own return to its usual words, so one never cancels another's.
  const timers: Record<"copied" | "refused" | "offRefused", ReturnType<typeof setTimeout> | undefined> = { copied: undefined, refused: undefined, offRefused: undefined };
  let destroyed = false;
  const draw = () => {
    const state = port.state();
    root.hidden = !port.available();
    share.hidden = state.on;
    box.hidden = off.hidden = !state.on;
    const word = refused ?? (!state.on && state.starting ? "Making a link…" : "Share preview");
    if (shareLabel.textContent !== word) shareLabel.textContent = word;
    // Not `disabled`: a focused button that is disabled drops the keyboard's focus out of the menu.
    share.setAttribute("aria-disabled", String(!state.on && Boolean(state.starting)));
    const copyWord = copied ? "Copied" : "Copy";
    if (copyLabel.textContent !== copyWord) copyLabel.textContent = copyWord;
    copyButton.classList.toggle("is-done", copied);
    copyMark.hidden = !copied;
    if (copied && !copyMark.firstChild) setIcon(copyMark, "check", 16);
    if (!state.on) return;
    field.value = state.link;
    ends.textContent = `Works while your editor is open · ends ${new Date(state.ends).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
    offLabel.textContent = offRefused ?? (state.stopping ? "Turning off…" : "Turn preview off");
    off.setAttribute("aria-disabled", String(Boolean(state.stopping)));
  };
  const later = (which: keyof typeof timers, then: () => void) => {
    clearTimeout(timers[which]);
    timers[which] = setTimeout(() => { timers[which] = undefined; if (!destroyed) then(); }, COPIED_MS);
  };
  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); copied = true; }
    catch { copied = false; }
    if (destroyed) return;
    draw();
    // A copy the browser refused: the address is selected in its field, to copy by hand.
    if (!copied) { clearTimeout(timers.copied); field.focus(); return; }
    later("copied", () => { copied = false; draw(); });
  };
  share.addEventListener("click", () => {
    const state = port.state();
    if (state.on || state.starting) return;
    port.start().then((link) => {
      if (!link || destroyed) return;
      // The new link's Copy takes the focus from Share preview, which is gone.
      if (share.matches(":focus-within") || document.activeElement === share || document.activeElement === document.body) copyButton.focus();
      return copy(link);
    }, (error: unknown) => {
      if (destroyed) return;
      refused = (error as { status?: unknown } | null)?.status === 401 ? "Sign in to share" : "Couldn't share preview";
      draw();
      later("refused", () => { refused = undefined; draw(); });
    });
  });
  copyButton.addEventListener("click", () => { const state = port.state(); if (state.on) void copy(state.link); });
  off.addEventListener("click", () => {
    const state = port.state();
    if (!state.on || state.stopping) return;
    port.stop().then(() => { if (!destroyed && !port.state().on) share.focus(); }, () => {
      if (destroyed) return;
      offRefused = "Couldn't turn off";
      draw();
      later("offRefused", () => { offRefused = undefined; draw(); });
    });
  });
  const unwatch = port.watch((state) => { if (!state.on) copied = false; draw(); });
  draw();
  return { refresh: draw, destroy() { destroyed = true; unwatch(); for (const timer of Object.values(timers)) clearTimeout(timer); } };
}
