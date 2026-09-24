import { button, link, node } from "../ui/dom";
import { mountDropdown } from "./dropdown";
import { draftStore, type DraftScope, type SavedDraft } from "../drafts";
import type { PublishResult } from "../../shared/types";
import { diffHunks } from "../text-diff";
import "./publish-menu.css";

export function createPublishMenu(options: {
  scope: DraftScope;
  currentPath: string;
  onPublished: (result: PublishResult, submitted: SavedDraft[]) => void;
  onExpired: () => void;
  /** Native projects relabel the menu as "Save to GitHub" and do not track deployment status. */
  saveLabels?: boolean;
}) {
  const labels = options.saveLabels
    ? {
        trigger: "Save to GitHub",
        panelAria: "Save files to GitHub",
        heading: `Save to ${options.scope.branch}`,
        submit: "Save selected files",
        idle: "Selected files are committed together. A connected host may deploy this commit automatically.",
        pending: "Saving to GitHub…",
      }
    : {
        trigger: "Publish",
        panelAria: "Publish files",
        heading: `Publish to ${options.scope.branch}`,
        submit: "Publish selected files",
        idle: "Selected files are committed together. Site deployment requires a connected build pipeline.",
        pending: "Publishing to GitHub…",
      };
  const root = node("div", "publish-menu");
  const panel = node("div", "publish-menu__panel");
  panel.id = "publish-files";
  panel.setAttribute("aria-label", labels.panelAria);
  const trigger = node("button", "button primary", labels.trigger);
  trigger.type = "button";
  const heading = node("strong", "", labels.heading);
  const list = node("div", "publish-menu__files");
  const message = node("p", "muted publish-menu__message");
  message.setAttribute("role", "status");
  const submit = button(labels.submit, () => void send(), "button primary");
  panel.append(heading, list, message, submit);
  root.append(trigger, panel);
  const dropdown = mountDropdown({ trigger, panel, anchor: "--publish-files" });
  const selection = new Set([options.currentPath]);
  let pending = false, disposed = false;
  function refresh(resetMessage = true) {
    if (pending) return;
    const records = draftStore().list(options.scope);
    trigger.disabled = records.length === 0;
    list.replaceChildren();
    for (const draft of records) {
      const label = node("label", "publish-menu__file");
      const checkbox = node("input"); checkbox.type = "checkbox";
      checkbox.checked = selection.has(draft.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selection.add(draft.path); else selection.delete(draft.path);
        submit.disabled = !records.some(record => selection.has(record.path));
      });
      label.append(checkbox, node("span", "", draft.path));
      list.append(label, changes(draft));
    }
    submit.disabled = !records.some(record => selection.has(record.path));
    if (resetMessage) message.textContent = labels.idle;
  }
  // What the commit would change in a file: the changed lines with one line
  // of context, so a stray edit is seen before it reaches the branch.
  function changes(draft: SavedDraft) {
    const details = node("details", "publish-menu__changes");
    const summary = node("summary");
    const hunks = draft.baseSha === null ? [] : diffHunks(draft.original, draft.content);
    let added = 0, deleted = 0;
    for (const hunk of hunks) for (const line of hunk.lines) {
      if (line.kind === "add") added++;
      else if (line.kind === "del") deleted++;
    }
    if (draft.baseSha === null) {
      summary.textContent = `New file, ${draft.content.split("\n").length} lines`;
      details.append(summary);
      return details;
    }
    summary.textContent = `${added} added, ${deleted} removed`;
    details.append(summary);
    details.open = true;
    const pre = node("pre", "publish-menu__diff");
    hunks.forEach((hunk, index) => {
      if (index) pre.append(node("span", "publish-menu__diff-gap", "⋯\n"));
      for (const line of hunk.lines) {
        const row = node("span", `publish-menu__diff-line is-${line.kind}`);
        row.append(
          node("span", "publish-menu__diff-number", String(line.line)),
          node("span", "publish-menu__diff-sign", line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "),
          node("span", "publish-menu__diff-text", line.text),
          "\n",
        );
        pre.append(row);
      }
    });
    details.append(pre);
    return details;
  }
  async function send() {
    const submitted = draftStore().list(options.scope).filter(draft => selection.has(draft.path));
    if (pending || !submitted.length) return;
    pending = true; trigger.disabled = true; submit.disabled = true;
    list.querySelectorAll("input").forEach(input => input.disabled = true);
    message.textContent = labels.pending;
    try {
      const response = await fetch(`/api/publish?${new URLSearchParams({ repo: options.scope.repo })}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: options.scope.branch, files: submitted.map(({ path, baseSha, content }) => ({ path, baseSha, content })) }),
      });
      if (response.status === 401) { options.onExpired(); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Publishing failed. Your drafts are kept.");
      // Reconcile even if the user navigated away while the request was in flight.
      options.onPublished(data as PublishResult, submitted);
      if (disposed) return;
      message.replaceChildren(node("span", "", "Saved to GitHub. "));
      const commit = link("View commit ↗", data.url, "text-link");
      commit.target = "_blank"; commit.rel = "noopener noreferrer";
      message.append(
        commit,
        node(
          "span",
          "",
          options.saveLabels
            ? " Deployment status is not tracked by this editor."
            : " The status in the top bar follows the build.",
        ),
      );
    } catch (error) {
      if (!disposed) message.textContent = error instanceof Error ? error.message : "Publishing failed. Your drafts are kept.";
    } finally {
      pending = false;
      if (!disposed) {
        refresh(false);
      }
    }
  }
  trigger.addEventListener("pointerenter", () => refresh());
  trigger.addEventListener("focus", () => refresh());
  // Native toggle fires after shared hover/click handling; do not rebuild during a publish.
  panel.addEventListener("beforetoggle", event => { if ((event as ToggleEvent).newState === "open") refresh(); });
  refresh();
  return { root, refresh, destroy() { disposed = true; dropdown.destroy(); } };
}
