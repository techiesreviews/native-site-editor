import { button, link, node } from "../ui/dom";
import { mountDropdown } from "./dropdown";
import { draftStore, type DraftScope, type SavedDraft } from "../drafts";
import type { PublishResult } from "../../shared/types";
import { diffCounts, diffHunks, sideBySideRows, type SideCell } from "../text-diff";
import { CHANGE_WORDS, listChanges, publishFiles, type FileChange } from "../file-changes";
import { formatBytes, postUpload, sendUploads, uploadBytes } from "../uploads";
import "./publish-menu.css";

export function createPublishMenu(options: {
  scope: DraftScope;
  currentPath: string;
  onPublished: (result: PublishResult, submitted: SavedDraft[]) => void;
  onExpired: () => void;
  /** Native projects relabel the menu as "Save to GitHub"; the Change status shows in the top bar (components/site-actions.ts). */
  saveLabels?: boolean;
  /** Restores a deletion or moves a renamed file back (the caller also puts back what went with it). */
  onDiscardChange?: (change: FileChange) => void;
  /** Whether the draft at `path` is an edit of a file GitHub deleted since it began: it cannot be saved as it is. */
  deletedUpstream?: (path: string) => boolean;
  /** Settles such a draft: Discard draft, or Keep as new file (`keep`). */
  onSettleDeleted?: (path: string, keep: boolean) => void;
}) {
  const labels = options.saveLabels
    ? {
        trigger: "Save to GitHub",
        panelAria: "Save files to GitHub",
        heading: `Save to ${options.scope.branch}`,
        submit: "Save",
        idle: "Selected files are committed together. A connected host may deploy this commit automatically.",
        pending: "Saving to GitHub…",
      }
    : {
        trigger: "Publish",
        panelAria: "Publish files",
        heading: `Publish to ${options.scope.branch}`,
        submit: "Publish",
        idle: "Selected files are committed together. Site deployment requires a connected build pipeline.",
        pending: "Publishing to GitHub…",
      };
  const root = node("div", "publish-menu");
  const panel = node("div", "publish-menu__panel");
  panel.id = "publish-files";
  panel.setAttribute("aria-label", labels.panelAria);
  const trigger = node("button", "button primary", labels.trigger);
  trigger.type = "button";
  // How many changes wait; the button keeps its name, the count is seen.
  const count = node("span", "publish-menu__count");
  count.setAttribute("aria-hidden", "true");
  trigger.append(count);
  const heading = node("strong", "", labels.heading);
  const list = node("div", "publish-menu__files");
  // The grand total of the selected changes; unfolded, every one of their differences.
  const total = node("details", "publish-menu__total");
  const totalSummary = node("summary", "publish-menu__total-summary");
  const totalBody = node("div", "publish-menu__total-body");
  total.append(totalSummary, totalBody);
  total.addEventListener("toggle", () => { panel.classList.toggle("is-wide", total.open); if (total.open) renderTotal(); });
  const message = node("p", "muted publish-menu__message");
  message.setAttribute("role", "status");
  const submit = button(labels.submit, () => void send(), "button primary");
  panel.append(heading, list, total, message, submit);
  root.append(trigger, panel);
  const dropdown = mountDropdown({ trigger, panel, anchor: "--publish-files" });
  // Every change is selected unless it was unticked here.
  const unticked = new Set<string>();
  let records: FileChange[] = [];
  let pending = false, disposed = false;
  const selected = (change: FileChange) =>
    !gone(change) && !unticked.has(change.path) && !(change.from !== undefined && unticked.has(change.from));
  function refresh(resetMessage = true) {
    if (pending) return;
    records = listChanges(draftStore().list(options.scope));
    trigger.disabled = records.length === 0;
    count.textContent = records.length ? String(records.length) : "";
    list.replaceChildren();
    for (const change of records) {
      const label = node("label", "publish-menu__file");
      const checkbox = node("input"); checkbox.type = "checkbox";
      // A rename is selected as a whole, by its new path or its old one.
      checkbox.checked = selected(change);
      // An edit of a file GitHub deleted waits until it is settled; the rest can be saved.
      checkbox.disabled = gone(change);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) { unticked.delete(change.path); if (change.from) unticked.delete(change.from); }
        else unticked.add(change.path);
        updateTotal();
      });
      const status = node("span", `publish-menu__status is-${change.kind}`);
      status.title = CHANGE_WORDS[change.kind];
      const letter = node("span", "", change.kind);
      letter.setAttribute("aria-hidden", "true");
      status.append(letter, node("span", "sr-only", `${CHANGE_WORDS[change.kind]}:`));
      const name = node("span", "publish-menu__path", change.from ? `${change.from} → ${change.path}` : change.path);
      label.append(checkbox, status, name);
      list.append(label, changes(change));
    }
    updateTotal();
    if (resetMessage) message.textContent = labels.idle;
  }
  // The text a change compares, GitHub's before the draft's; none for a
  // deletion, an upload, a copy or a rename with no other edit.
  function comparison(change: FileChange) {
    const [draft] = change.drafts;
    if (gone(change) || change.kind === "D" || draft.opaque || draft.upload) return null;
    if (change.kind === "R" && draft.content === draft.original) return null;
    const isNew = draft.baseSha === null;
    return { before: isNew ? "" : draft.original, after: draft.content, isNew };
  }
  function updateTotal() {
    const chosen = records.filter(selected);
    let added = 0, removed = 0;
    for (const change of chosen) {
      const text = comparison(change);
      if (!text) continue;
      const counts = diffCounts(text.before, text.after);
      added += counts.added; removed += counts.deleted;
    }
    const n = chosen.length;
    const changesWord = `${n} ${n === 1 ? "change" : "changes"}`;
    totalSummary.textContent = `${n === records.length ? `All ${changesWord}` : `${changesWord} of ${records.length}`} · ${added} added, ${removed} removed`;
    total.hidden = records.length === 0;
    submit.textContent = `${labels.submit} ${changesWord}`;
    submit.disabled = n === 0;
    if (total.open) renderTotal();
  }
  // Unfolded, the total lists each selected change with its differences in one column.
  function renderTotal() {
    totalBody.replaceChildren();
    for (const change of records.filter(selected)) {
      const section = node("section", "publish-menu__total-file");
      const head = node("h3", "publish-menu__total-path");
      const status = node("span", `publish-menu__status is-${change.kind}`, change.kind);
      status.title = CHANGE_WORDS[change.kind];
      head.append(status, node("span", "", change.from ? `${change.from} → ${change.path}` : change.path));
      section.append(head);
      const text = comparison(change);
      const [draft] = change.drafts;
      if (text) section.append(unifiedView(text.before, text.after, "publish-menu__total-diff"));
      else section.append(node("p", "publish-menu__note",
        change.kind === "D" ? "Deleted"
          : change.kind === "R" ? "Renamed, no other changes"
          : draft.upload ? `Uploaded, ${formatBytes(draft.upload.size)}`
          : "New file, a copy"));
      totalBody.append(section);
    }
  }
  const gone = (change: FileChange) => change.kind === "M" && Boolean(options.deletedUpstream?.(change.path));
  // What the commit would change in a file, as counts; the button opens the
  // comparison, so a stray edit is seen before it reaches the branch. A
  // deletion and a rename say so, with Restore or Move back; an edit of a
  // file GitHub deleted, with Discard draft and Keep as new file.
  function changes(change: FileChange) {
    const row = node("div", "publish-menu__changes");
    const [draft] = change.drafts;
    if (gone(change)) {
      row.append(node("span", "publish-menu__note", "Deleted on GitHub"));
      if (options.onSettleDeleted) {
        row.append(
          discardButton("Discard draft", `Discard the draft of ${change.path}`, () => options.onSettleDeleted?.(change.path, false)),
          discardButton("Keep as new file", `Keep ${change.path} as a new file`, () => options.onSettleDeleted?.(change.path, true)),
        );
      }
      return row;
    }
    if (change.kind === "D") {
      row.append(node("span", "publish-menu__note", "Deleted"));
      if (options.onDiscardChange) row.append(discardButton("Restore", `Restore ${change.path}`, () => options.onDiscardChange?.(change)));
      return row;
    }
    if (change.kind === "R") {
      const edited = !draft.opaque && draft.content !== draft.original;
      if (edited) row.append(showButton(change.path, draft.original, draft.content));
      else row.append(node("span", "publish-menu__note", "Renamed, no other changes"));
      if (options.onDiscardChange) row.append(discardButton("Move back", `Move ${change.path} back to ${change.from}`, () => options.onDiscardChange?.(change)));
      return row;
    }
    const isNew = draft.baseSha === null;
    if (isNew && draft.upload) {
      row.append(node("span", "publish-menu__note", `Uploaded, ${formatBytes(draft.upload.size)}`));
      if (options.onDiscardChange) row.append(discardButton("Discard", `Discard ${change.path}`, () => options.onDiscardChange?.(change)));
      return row;
    }
    if (isNew && draft.opaque) {
      row.append(node("span", "publish-menu__note", "New file, a copy"));
      return row;
    }
    row.append(showButton(draft.path, isNew ? "" : draft.original, draft.content, isNew));
    return row;
  }
  function showButton(path: string, before: string, after: string, isNew = false) {
    const { added, deleted } = diffCounts(before, after);
    const summary = isNew ? `New file, ${after.split("\n").length} lines` : `${added} added, ${deleted} removed`;
    const show = button(summary, () => openComparison(path, before, after, show), "publish-menu__show-changes");
    show.setAttribute("aria-label", `${summary}. Show changes in ${path}`);
    show.setAttribute("aria-haspopup", "dialog");
    show.dataset.path = path;
    return show;
  }
  function discardButton(text: string, label: string, run: () => void) {
    const discard = button(text, () => {
      run();
      refresh(false);
      message.textContent = `${label}: done.`;
    }, "publish-menu__show-changes publish-menu__discard");
    discard.setAttribute("aria-label", label);
    return discard;
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
  function openComparison(path: string, before: string, after: string, from: HTMLButtonElement) {
    opener = from;
    dialogTitle.textContent = path;
    dialogBody.replaceChildren(splitView(before, after), unifiedView(before, after));
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
  function unifiedView(before: string, after: string, className = "publish-diff__unified") {
    const pre = node("pre", `publish-menu__diff ${className}`);
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
    const chosen = listChanges(draftStore().list(options.scope)).filter(selected);
    const submitted: SavedDraft[] = chosen.flatMap(change => change.drafts);
    if (pending || !submitted.length) return;
    pending = true; trigger.disabled = true; submit.disabled = true;
    list.querySelectorAll("input").forEach(input => input.disabled = true);
    message.textContent = labels.pending;
    try {
      // Uploaded files become GitHub blobs first; the commit names them.
      await sendUploads(uploadBytes(), options.scope, submitted, (blob, sha) => postUpload(options.scope.repo, blob, sha));
      const response = await fetch(`/api/publish?${new URLSearchParams({ repo: options.scope.repo })}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: options.scope.branch, files: publishFiles(chosen) }),
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
            ? " Its status shows in the top bar."
            : " The status in the top bar follows the build.",
        ),
      );
    } catch (error) {
      if ((error as { status?: number }).status === 401) { options.onExpired(); return; }
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
