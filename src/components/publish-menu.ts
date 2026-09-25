import { button, link, node } from "../ui/dom";
import { mountDropdown } from "./dropdown";
import { draftStore, type DraftScope, type SavedDraft } from "../drafts";
import type { PublishResult } from "../../shared/types";
import { diffCounts, diffHunks, sideBySideRows, type SideCell } from "../text-diff";
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
  // What the commit would change in a file, as counts; the button opens the
  // comparison, so a stray edit is seen before it reaches the branch.
  function changes(draft: SavedDraft) {
    const row = node("div", "publish-menu__changes");
    const isNew = draft.baseSha === null;
    const { added, deleted } = diffCounts(isNew ? "" : draft.original, draft.content);
    const summary = isNew ? `New file, ${draft.content.split("\n").length} lines` : `${added} added, ${deleted} removed`;
    const show = button(summary, () => openComparison(draft, show), "publish-menu__show-changes");
    show.setAttribute("aria-label", `${summary}. Show changes in ${draft.path}`);
    show.setAttribute("aria-haspopup", "dialog");
    show.dataset.path = draft.path;
    row.append(show);
    return row;
  }
  // The comparison dialog lives inside the panel, so the panel (an auto
  // popover) is its popover ancestor and stays open while the modal shows.
  const dialog = node("dialog", "publish-diff");
  dialog.setAttribute("aria-labelledby", "publish-diff-title");
  const dialogTitle = node("h2", "publish-diff__title");
  dialogTitle.id = "publish-diff-title";
  const dialogBody = node("div", "publish-diff__body");
  const closeDialog = button("Close", () => dialog.close(), "button secondary");
  const dialogHeader = node("header", "publish-diff__header");
  dialogHeader.append(dialogTitle, closeDialog);
  dialog.append(dialogHeader, dialogBody);
  panel.append(dialog);
  let opener: HTMLButtonElement | null = null;
  // Escape closes the dialog only; the dropdown would otherwise close the panel too.
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialogBody.replaceChildren();
    // The list may have been rebuilt meanwhile: fall back to the same file's button.
    const target = opener?.isConnected ? opener
      : [...list.querySelectorAll<HTMLButtonElement>(".publish-menu__show-changes")].find(item => item.dataset.path === opener?.dataset.path);
    opener = null;
    target?.focus();
  });
  function openComparison(draft: SavedDraft, from: HTMLButtonElement) {
    const before = draft.baseSha === null ? "" : draft.original;
    opener = from;
    dialogTitle.textContent = draft.path;
    dialogBody.replaceChildren(splitView(before, draft.content), unifiedView(before, draft.content));
    dialog.showModal();
    dialogBody.scrollTop = 0;
  }
  // GitHub's version on the left, the draft on the right.
  function splitView(before: string, after: string) {
    const table = node("table", "publish-diff__split");
    const head = node("thead"), headRow = node("tr");
    const leftHead = node("th", "", "GitHub"), rightHead = node("th", "", "Draft");
    leftHead.colSpan = rightHead.colSpan = 2;
    leftHead.scope = rightHead.scope = "col";
    // Fixed layout takes its widths from the columns: narrow numbers, even code halves.
    const columns = node("colgroup");
    for (const kind of ["num", "code", "num", "code"]) columns.append(node("col", `publish-diff__col-${kind}`));
    table.append(columns);
    headRow.append(leftHead, rightHead);
    head.append(headRow);
    const body = node("tbody");
    const cells = (cell: SideCell | null) => {
      const number = node("td", "publish-diff__num", cell ? String(cell.line) : "");
      const code = node("td", `publish-diff__code is-${cell?.kind ?? "empty"}`);
      if (cell) code.append(node("span", "publish-diff__sign", cell.kind === "add" ? "+" : cell.kind === "del" ? "−" : " "), node("span", "", cell.text));
      return [number, code];
    };
    for (const row of sideBySideRows(before, after)) {
      const tr = node("tr", `publish-diff__row is-${row.kind}`);
      if (row.kind === "gap") {
        const cell = node("td", "publish-diff__gap", `${row.count} unchanged ${row.count === 1 ? "line" : "lines"}`);
        cell.colSpan = 4;
        tr.append(cell);
      } else tr.append(...cells(row.left), ...cells(row.right));
      body.append(tr);
    }
    table.append(head, body);
    return table;
  }
  // The narrow fallback: the changed lines in one column.
  function unifiedView(before: string, after: string) {
    const pre = node("pre", "publish-menu__diff publish-diff__unified");
    diffHunks(before, after, 3).forEach((hunk, index) => {
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
    return pre;
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
  return { root, refresh, destroy() { disposed = true; if (dialog.open) dialog.close(); dropdown.destroy(); } };
}
