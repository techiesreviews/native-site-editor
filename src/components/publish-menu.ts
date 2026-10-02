import { button, link, node } from "../ui/dom";
import { mountDropdown } from "./dropdown";
import { draftKey, draftStore, type DraftScope, type SavedDraft } from "../drafts";
import { EMPTY_COMMIT, type PublishFile, type PublishResult } from "../../shared/types";
import { diffCounts, diffHunks, sideBySideRows, type SideCell } from "../text-diff";
import { CHANGE_WORDS, listChanges, publishFiles, type FileChange } from "../file-changes";
import { formatBytes, postUpload, sendUploads, uploadBytes } from "../uploads";
import "./publish-menu.css";

// Paths a save was refused for, by draft key: GitHub changed them (or
// deleted them, `gone`) since their drafts began. Each is said until its
// draft is discarded or moves on from the blob it was sent with (kept over
// GitHub's version, kept as a new file, found equal to it).
const refused = new Map<string, { path: string; baseSha: string | null; gone: boolean }>();
function refusedIn(scope: DraftScope) {
  const store = draftStore();
  const out: { path: string; gone: boolean }[] = [];
  for (const [key, entry] of refused) {
    if (key !== draftKey(scope, entry.path)) continue;
    const draft = store.get(scope, entry.path);
    if (!draft || draft.baseSha !== entry.baseSha) refused.delete(key);
    else out.push(entry);
  }
  return out;
}
/** What the refused paths still waiting in `scope` need, or nothing. */
function refusedNotice(scope: DraftScope) {
  const waiting = refusedIn(scope);
  const changed = waiting.filter((entry) => !entry.gone).map((entry) => entry.path);
  const gone = waiting.filter((entry) => entry.gone).map((entry) => entry.path);
  if (!waiting.length) return "";
  return [
    changed.length ? `GitHub changed these files: ${changed.join(", ")}. Refresh and review the latest version before publishing.` : "",
    gone.length ? `GitHub deleted these files since your drafts began: ${gone.join(", ")}. Discard those drafts or keep them as new files in Save to GitHub.` : "",
    "Your drafts are kept.",
  ].filter(Boolean).join(" ");
}

export function createPublishMenu(options: {
  scope: DraftScope;
  currentPath: string;
  onPublished: (result: PublishResult, submitted: SavedDraft[]) => void;
  onExpired: () => void;
  /** Native projects word the progress as saving to GitHub; the Change status shows in the top bar (components/site-actions.ts). */
  saveLabels?: boolean;
  /** Restores a deletion or moves a renamed file back (the caller also puts back what went with it). */
  onDiscardChange?: (change: FileChange) => void;
  /** Whether the draft at `path` is an edit of a file GitHub deleted since it began: it cannot be saved as it is. */
  deletedUpstream?: (path: string) => boolean;
  /** Settles such a draft: Discard draft, or Keep as new file (`keep`). */
  onSettleDeleted?: (path: string, keep: boolean) => void;
  /** The branch's head as the tab last saw it, sent so a lagging GitHub read is not taken for it. */
  head?: () => string | undefined;
  /** GitHub refused some files as changed or deleted since their drafts began. */
  onRefused?: () => void;
}) {
  // Publish commits the selected changes to the branch in one go; hovering it shows them.
  const pendingText = options.saveLabels ? "Saving to GitHub…" : "Publishing to GitHub…";
  const root = node("div", "publish-menu");
  const panel = node("div", "publish-menu__panel");
  panel.id = "publish-files";
  panel.setAttribute("aria-label", "Changes to publish");
  const trigger = node("button", "button primary");
  trigger.type = "button";
  // The button names its progress while a publish runs, then goes back to Publish.
  const label = node("span", "publish-menu__label", "Publish");
  trigger.append(label);
  let labelTimer: ReturnType<typeof setTimeout> | undefined;
  function showProgress(text: string, settle = false) {
    clearTimeout(labelTimer);
    label.textContent = text;
    count.hidden = text !== "Publish";
    if (settle) labelTimer = setTimeout(() => showProgress("Publish"), 2000);
  }
  // How many changes wait; the button keeps its name, the count is seen.
  const count = node("span", "publish-menu__count");
  count.setAttribute("aria-hidden", "true");
  trigger.append(count);
  // The grand total of the selected changes, unfolding to the changes themselves.
  const total = node("details", "publish-menu__total");
  const totalSummary = node("summary", "publish-menu__total-summary");
  const list = node("div", "publish-menu__files");
  total.append(totalSummary, list);
  const message = node("p", "muted publish-menu__message");
  message.setAttribute("role", "status");
  panel.append(total, message);
  root.append(trigger, panel);
  const dropdown = mountDropdown({ trigger, panel, anchor: "--publish-files", onClick: () => void send() });
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
    // A refusal is said until every file it named is settled.
    const notice = refusedNotice(options.scope);
    if (notice) message.textContent = notice;
    else if (resetMessage || refusing) message.textContent = "";
    refusing = Boolean(notice);
  }
  let refusing = false;
  // The text a change compares, GitHub's before the draft's; none for a
  // deletion, an upload, a copy or a rename with no other edit.
  function comparison(change: FileChange) {
    const [draft] = change.drafts;
    if (gone(change) || change.kind === "D" || draft.opaque || draft.upload) return null;
    if (change.kind === "R" && draft.content === draft.original) return null;
    return { before: draft.baseSha === null ? "" : draft.original, after: draft.content };
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
    trigger.title = n ? `Publish ${changesWord} to ${options.scope.branch}` : "Nothing selected to publish";
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
    if (options.onDiscardChange) row.append(discardButton("Discard", `Discard the changes to ${change.path}`, () => options.onDiscardChange?.(change)));
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
      // A refusal still waiting on other files stays said.
      if (!refusing) message.textContent = `${label}: done.`;
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
    const chosen = listChanges(draftStore().list(options.scope)).filter(selected);
    const submitted: SavedDraft[] = chosen.flatMap(change => change.drafts);
    if (pending) return;
    if (!submitted.length) { message.textContent = "Nothing selected to publish."; return; }
    pending = true; trigger.disabled = true;
    list.querySelectorAll("input").forEach(input => input.disabled = true);
    message.textContent = pendingText;
    showProgress(options.saveLabels ? "Saving…" : "Publishing…");
    // Uploaded files go up first; the button says so, then goes back to saving.
    const upload = async (blob: Blob, sha: string) => {
      showProgress("Uploading…");
      try { return await postUpload(options.scope.repo, blob, sha); }
      finally { showProgress(options.saveLabels ? "Saving…" : "Publishing…"); }
    };
    // One commit of `files` on top of `base`; resolves to nothing when the
    // session expired or GitHub changed files (said in the menu).
    async function post(files: PublishFile[], base: string | undefined): Promise<PublishResult | undefined> {
      // Gzipped, a commit of many pages stays a small request.
      const body = await gzip(JSON.stringify({ branch: options.scope.branch, ...(base ? { head: base } : {}), files }));
      const response = await fetch(`/api/publish?${new URLSearchParams({ repo: options.scope.repo })}`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
        body,
      });
      if (response.status === 401) { options.onExpired(); return undefined; }
      const data = await response.json();
      if (response.status === 409 && Array.isArray(data.conflicts) && data.conflicts.length) {
        const gone = new Set<string>(Array.isArray(data.gone) ? data.gone : []);
        for (const path of data.conflicts as string[]) {
          const sent = submitted.find((draft) => draft.path === path);
          if (sent) refused.set(draftKey(options.scope, path), { path, baseSha: sent.baseSha, gone: gone.has(path) });
        }
        options.onRefused?.();
        if (refusedNotice(options.scope)) return undefined;
      }
      if (!response.ok) throw new Error(data.error ?? "Publishing failed. Your drafts are kept.");
      return data as PublishResult;
    }
    try {
      const head = options.head?.();
      const files = publishFiles(chosen);
      let data: PublishResult | undefined;
      if (head === EMPTY_COMMIT) {
        // An empty repository: GitHub makes its first commit from one text
        // file (worker/publish.ts), the home page when it is chosen; the
        // rest, uploads included, follow on top of it.
        const first =
          files.find((file) => file.path === "index.html" && !file.sha && !file.delete) ??
          files.find((file) => !file.sha && !file.delete && file.baseSha === null);
        if (!first) throw new Error("The first save to an empty repository needs a new text file, such as index.html. Select one too.");
        const started = await post([first], head);
        if (!started) return;
        const rest = files.filter((file) => file !== first);
        // When the rest is not saved, the first commit stands: its file is GitHub's now.
        const keepFirst = () => options.onPublished(started, chosen.filter((change) => change.path === first.path).flatMap((change) => change.drafts));
        if (!rest.length) data = started;
        else {
          try {
            await sendUploads(uploadBytes(), options.scope, submitted, upload);
            const after = await post(rest, started.commit);
            if (!after) { keepFirst(); return; }
            data = { ...after, files: [...started.files, ...after.files], deleted: after.deleted ?? [] };
          } catch (error) {
            keepFirst();
            throw error;
          }
        }
      } else {
        // Uploaded files become GitHub blobs first; the commit names them.
        await sendUploads(uploadBytes(), options.scope, submitted, upload);
        data = await post(files, head);
        if (!data) return;
      }
      // Reconcile even if the user navigated away while the request was in flight.
      options.onPublished(data as PublishResult, submitted);
      if (disposed) return;
      showProgress(options.saveLabels ? "Saved" : "Published", true);
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
      if (label.textContent !== "Saved" && label.textContent !== "Published") showProgress("Publish");
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
  return { root, refresh, destroy() { disposed = true; clearTimeout(labelTimer); if (dialog.open) dialog.close(); dropdown.destroy(); } };
}

/** Text as gzip bytes. */
export function gzip(text: string): Promise<Blob> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
}
