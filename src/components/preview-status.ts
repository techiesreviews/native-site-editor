import "./preview-status.css";
import { node } from "../ui/dom";

// A compact, always-visible read-out of the draft-preview build lifecycle,
// shown in the topbar so the editor knows what the preview is doing while a
// class or structural edit rebuilds. It mirrors the real controller lifecycle
// (pending → building → ready, or failed) and never starts a build itself; the
// optional Retry control simply asks the caller to re-run the last attempt.
//
// This is a separate channel from the sr-only preview summary (which selection
// announcements overwrite) and from the GitHub publish/change status.
export type PreviewStatusKind = "waiting" | "building" | "loading" | "ready" | "failed";

export function createPreviewStatus(host: HTMLElement, onRetry?: () => void) {
  const root = node("div", "preview-status");
  root.hidden = true;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  const dot = node("span", "preview-status__dot");
  dot.setAttribute("aria-hidden", "true");
  const label = node("span", "preview-status__label");
  const detail = node("span", "preview-status__detail");
  const retry = node("button", "preview-status__retry", "Retry");
  retry.type = "button";
  retry.hidden = true;
  retry.addEventListener("click", () => onRetry?.());
  root.append(dot, label, detail, retry);
  host.append(root);

  function set(kind: PreviewStatusKind, text: string, withRetry = false, detailText = "") {
    root.hidden = false;
    root.dataset.kind = kind;
    label.textContent = text;
    detail.textContent = detailText;
    detail.hidden = !detailText;
    retry.hidden = !withRetry;
    retry.textContent = withRetry ? "Retry" : "";
    root.title = detailText ? `${text} — ${detailText}` : text;
  }

  return {
    root,
    waiting() {
      set("waiting", "Waiting to rebuild…");
    },
    building() {
      set("building", "Building preview…");
    },
    // The build finished but the iframe has not completed its editable handshake.
    loading() {
      set("loading", "Loading preview…");
    },
    ready() {
      set("ready", "Preview ready");
    },
    // `reason` is a human-readable message; the compact label stays short and
    // the full reason is available via the title and, truncated, in the label.
    failed(reason?: string, withRetry = Boolean(onRetry)) {
      set("failed", "Preview failed", withRetry && Boolean(onRetry), reason ?? "");
    },
    hide() {
      root.hidden = true;
      retry.hidden = true;
      retry.textContent = "";
      detail.hidden = true;
    },
  };
}
