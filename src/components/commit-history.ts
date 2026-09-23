import type { HistoryCommit, HistoryPage, RestoreResult } from "../../shared/types";
import { button, link, node } from "../ui/dom";
import "./commit-history.css";

/** File history owns loading, pagination and the explicit restore confirmation. */
export function createCommitHistory(options: {
  repo: string;
  branch: string;
  path: string;
  isCurrent(): boolean;
  hasDraft(): boolean;
  onDrafts(): void;
  onRestored(result: RestoreResult): Promise<void>;
  onExpired(): void;
}) {
  const root = node("section", "commit-history");
  const heading = node("h2", "changes-window__title", "History");
  const location = node("p", "commit-history__location", `${options.path} · ${options.branch}`);
  const navigation = node("nav", "commit-history__navigation");
  navigation.setAttribute("aria-label", "History views");
  const reload = button("Refresh history", () => void load(1), "text-button");
  navigation.append(button("Draft changes", options.onDrafts, "text-button"), reload);
  const notice = node("p", "muted commit-history__notice");
  const list = node("ul", "commit-history__list");
  const message = node("p", "muted commit-history__message");
  message.setAttribute("role", "status");
  const more = button("Load older commits", () => { if (nextPage) void load(nextPage); }, "button secondary");
  more.hidden = true;
  const confirmation = node("div", "commit-history__confirmation");
  confirmation.hidden = true;
  root.append(heading, location, navigation, notice, list, more, confirmation, message);

  let head: string | undefined;
  let currentFileCommit: string | undefined;
  let nextPage: number | null = null;
  let loading = false;
  let restoring = false;
  let disposed = false;
  let request = 0;
  const restoreButtons = new Map<HTMLButtonElement, HistoryCommit>();
  const seen = new Set<string>();
  const active = () => !disposed && options.isCurrent();
  const blocked = "Publish or discard this file’s draft before restoring. Other files’ drafts are kept.";

  function refresh() {
    if (!active()) return;
    const dirty = options.hasDraft();
    notice.textContent = dirty ? blocked : "Restore an earlier version of this file. Each restore creates a new commit.";
    for (const [control, commit] of restoreButtons)
      control.disabled = dirty || loading || restoring || commit.sha === currentFileCommit;
    reload.disabled = loading || restoring;
    more.disabled = loading || restoring;
  }
  async function read<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && active()) options.onExpired();
      throw new Error(data.error ?? "GitHub could not complete the request. Try again.");
    }
    return data as T;
  }
  function showConfirmation(commit: HistoryCommit) {
    if (!active() || loading || restoring) return;
    if (options.hasDraft()) { refresh(); return; }
    confirmation.replaceChildren(
      node("h3", "", "Restore this file?"),
      node("p", "", `Restore ${options.path} on ${options.branch} to ${commit.sha.slice(0, 7)} (${commit.message}). This creates a new commit. Other files stay unchanged.`),
    );
    const confirm = button("Restore file", () => void restore(commit, confirm, cancel), "button primary");
    const cancel = button("Cancel", () => {
      confirmation.hidden = true;
      list.hidden = false;
      more.hidden = nextPage === null;
      restoreButtons.forEach((value, control) => { if (value.sha === commit.sha) control.focus(); });
    }, "button secondary");
    const actions = node("div", "commit-history__actions");
    actions.append(confirm, cancel);
    confirmation.append(actions);
    confirmation.hidden = false;
    list.hidden = more.hidden = true;
    message.textContent = "";
    cancel.focus();
  }
  async function restore(commit: HistoryCommit, confirm: HTMLButtonElement, cancel: HTMLButtonElement) {
    if (!active() || restoring || !head) return;
    if (options.hasDraft()) { message.textContent = blocked; refresh(); return; }
    restoring = true;
    confirm.disabled = cancel.disabled = true;
    refresh();
    message.textContent = "Restoring file…";
    try {
      const result = await read<RestoreResult>(`/api/restore?${new URLSearchParams({ repo: options.repo })}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: options.branch, path: options.path, target: commit.sha, expectedHead: head }),
      });
      if (!active()) return;
      await options.onRestored(result);
    } catch (error) {
      if (active()) message.textContent = error instanceof Error ? error.message : "Restore failed. Your files are unchanged.";
    } finally {
      restoring = false;
      if (active()) { confirm.disabled = cancel.disabled = false; refresh(); }
    }
  }
  async function load(page: number) {
    if (!active() || loading || restoring) return;
    const id = ++request;
    loading = true;
    confirmation.hidden = true;
    list.hidden = false;
    message.textContent = "Loading commits…";
    if (page === 1) {
      list.replaceChildren(); seen.clear(); restoreButtons.clear();
      head = undefined; currentFileCommit = undefined; nextPage = null; more.hidden = true;
    }
    refresh();
    try {
      const query = new URLSearchParams({ repo: options.repo, branch: options.branch, path: options.path, page: String(page) });
      if (head) query.set("head", head);
      const data = await read<HistoryPage>(`/api/history?${query}`);
      if (!active() || id !== request) return;
      head = data.head;
      if (page === 1) currentFileCommit = data.commits[0]?.sha;
      for (const commit of data.commits) {
        if (seen.has(commit.sha)) continue;
        seen.add(commit.sha);
        const item = node("li", "commit-history__item");
        item.append(node("strong", "commit-history__subject", commit.message || "Untitled commit"));
        const meta = node("div", "muted commit-history__meta");
        const date = new Date(commit.date);
        const time = node("time", "", Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString());
        if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
        const commitLink = link(commit.sha.slice(0, 7), `https://github.com/${options.repo}/commit/${commit.sha}`, "text-link");
        commitLink.target = "_blank"; commitLink.rel = "noopener noreferrer";
        meta.append(node("span", "", commit.author), time, commitLink);
        const action = button("Restore this version", () => showConfirmation(commit), "text-button");
        if (commit.sha === currentFileCommit) action.textContent = "Current version";
        restoreButtons.set(action, commit);
        item.append(meta, action);
        list.append(item);
      }
      nextPage = data.nextPage;
      more.hidden = nextPage === null;
      message.textContent = seen.size ? "" : "No commits found for this file.";
    } catch (error) {
      if (active() && id === request) message.textContent = error instanceof Error ? error.message : "History could not be loaded. Try again.";
    } finally {
      if (id === request) { loading = false; refresh(); }
    }
  }
  root.addEventListener("focusin", refresh);
  void load(1);
  return { root, refresh, destroy() { disposed = true; request++; } };
}
