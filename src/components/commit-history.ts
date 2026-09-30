import type { CommitFile, CommitFiles, HistoryCommit, HistoryPage, RestoreResult } from "../../shared/types";
import { button, node } from "../ui/dom";
import { setIcon } from "../icons";
import { avatar, initial } from "./repository-menu";
import { createRowMenu } from "./row-menu";
import "./commit-history.css";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];

/** "2 hr. ago", "just now": how long ago a commit was, for a glance. */
function ago(date: Date) {
  const seconds = (date.getTime() - Date.now()) / 1000;
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

/** The day a commit is grouped under: Today, Yesterday, or its date. */
function day(date: Date) {
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(date)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: days < 7 ? "long" : undefined,
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/**
 * A file's history, as the version histories of Linear, Notion or Fibery
 * show it: commits grouped by day, each with its time, message and author,
 * the file's current version marked. Choosing a commit shows that version
 * (`onView`: the preview and the code pane show it, and a bar offers Back
 * to latest and Restore); the version on show is tinted. A commit's ⋯
 * holds Restore, View on GitHub and Copy commit link; Restore asks first
 * and creates a new commit.
 *
 * The Whole site tab lists every commit on the branch instead, as GitBook
 * and Replit do: choosing one unfolds the files it changed, and choosing
 * a file opens it as it was then (`onOpenFile`).
 */
export function createCommitHistory(options: {
  repo: string;
  branch: string;
  /** The open file, for This file; none for the site's history. */
  path?: string;
  scope: "file" | "site";
  onScope(scope: "file" | "site"): void;
  onOpenFile(path: string, commit: HistoryCommit, head: string): void;
  isCurrent(): boolean;
  hasDraft(): boolean;
  onRestored(result: RestoreResult): Promise<void>;
  onExpired(): void;
  /** Show this commit's version (`latest`: the file's current one, to go back). */
  onView(commit: HistoryCommit, head: string, latest: boolean): void;
  /** The commit whose version is on show, if not the current one. */
  viewing(): string | undefined;
}) {
  const root = node("section", "commit-history");
  const header = node("div", "commit-history__header");
  const reload = button("", () => void load(1), "commit-history__refresh");
  setIcon(reload, "arrows-clockwise");
  reload.setAttribute("aria-label", "Refresh history");
  reload.title = "Refresh history";
  header.append(node("h2", "changes-window__title", "History"), reload);
  const site = options.scope === "site";
  const scopes = node("div", "commit-history__scopes");
  scopes.setAttribute("role", "tablist");
  scopes.setAttribute("aria-label", "History of");
  for (const [scope, label] of [["file", "This file"], ["site", "Whole site"]] as const) {
    const tab = button(label, () => { if (scope !== options.scope) options.onScope(scope); }, "commit-history__scope");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(scope === options.scope));
    tab.disabled = scope === "file" && !options.path;
    scopes.append(tab);
  }
  const location = node("p", "commit-history__location", `${site ? options.repo.split("/").pop() : options.path} · ${options.branch}`);
  const list = node("ul", "commit-history__list");
  const message = node("p", "muted commit-history__message");
  message.setAttribute("role", "status");
  const more = button("Load older commits", () => { if (nextPage) void load(nextPage); }, "button secondary");
  more.hidden = true;
  const confirmation = node("div", "commit-history__confirmation");
  confirmation.hidden = true;
  root.append(header, scopes, location, list, more, confirmation, message);
  const menu = createRowMenu(root);

  let head: string | undefined;
  let currentFileCommit: string | undefined;
  let nextPage: number | null = null;
  let loading = false;
  let restoring = false;
  let disposed = false;
  let request = 0;
  let lastDay = "";
  const seen = new Set<string>();
  const rows = new Map<string, HTMLLIElement>();
  const active = () => !disposed && options.isCurrent();
  const blocked = "Publish or discard this file’s draft before restoring. Other files’ drafts are kept.";

  function refresh() {
    if (!active()) return;
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
  /** Why a commit cannot be restored now, if it cannot. */
  function unavailable(commit: HistoryCommit) {
    if (commit.sha === currentFileCommit) return "This is the file’s current version.";
    if (options.hasDraft()) return blocked;
    if (loading || restoring) return "Wait for the history to finish loading.";
    return undefined;
  }
  function showConfirmation(commit: HistoryCommit, opener: HTMLElement) {
    if (!active() || unavailable(commit)) { refresh(); return; }
    confirmation.replaceChildren(
      node("h3", "", "Restore this file?"),
      node("p", "", `Restore ${options.path ?? ""} on ${options.branch} to ${commit.sha.slice(0, 7)} (${commit.message}). This creates a new commit. Other files stay unchanged.`),
    );
    const confirm = button("Restore file", () => void restore(commit, confirm, cancel), "button primary");
    const cancel = button("Cancel", () => {
      confirmation.hidden = true;
      list.hidden = false;
      more.hidden = nextPage === null;
      if (opener.isConnected) opener.focus();
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
  function openMenu(commit: HistoryCommit, opener: HTMLButtonElement) {
    if (menu.isOpen() && menu.opener === opener) { menu.close(true); return; }
    menu.open(opener, [
      ...(site ? [] : [{ label: "Restore this version…", run: () => showConfirmation(commit, opener), disabled: unavailable(commit) }]),
      { label: "View on GitHub", run: () => void window.open(commit.url, "_blank", "noopener,noreferrer") },
      {
        label: "Copy commit link",
        run: () => {
          void navigator.clipboard.writeText(commit.url).then(
            () => { if (active()) message.textContent = "Commit link copied."; },
            () => { if (active()) message.textContent = "The link could not be copied."; },
          );
        },
      },
    ]);
  }
  /** Tints the version on show: the one viewed, else the current one. */
  function mark(sha = site ? undefined : options.viewing() ?? currentFileCommit) {
    for (const [key, item] of rows) {
      item.classList.toggle("is-shown", key === sha);
      const view = item.querySelector(".commit-history__view");
      if (key === sha) view?.setAttribute("aria-current", "true");
      else view?.removeAttribute("aria-current");
    }
  }
  function row(commit: HistoryCommit) {
    const date = new Date(commit.date);
    const known = !Number.isNaN(date.getTime());
    const group = known ? day(date) : "Unknown date";
    if (group !== lastDay) {
      lastDay = group;
      list.append(node("li", "commit-history__day", group));
    }
    const item = node("li", "commit-history__item");
    const current = commit.sha === currentFileCommit;
    item.classList.toggle("is-current", current);
    const files = node("ul", "commit-history__files");
    files.hidden = true;
    const view = button("", () => {
      if (!active() || !head) return;
      if (site) { void unfold(commit, view, files); return; }
      options.onView(commit, head, current);
      mark(current ? currentFileCommit : commit.sha);
    }, "commit-history__view");
    view.title = site ? "Show the files this commit changed" : current ? "Show the current version" : "Show this version in the preview";
    const line = node("span", "commit-history__line");
    if (site) {
      view.setAttribute("aria-expanded", "false");
      const twisty = node("span", "commit-history__twisty");
      setIcon(twisty, "caret-right", 12);
      line.append(twisty);
    }
    const time = node("time", "commit-history__time", known ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—");
    if (known) {
      time.dateTime = date.toISOString();
      time.title = date.toLocaleString();
    }
    line.append(time);
    if (known) line.append(node("span", "commit-history__ago", ago(date)));
    if (current) line.append(node("span", "commit-history__badge", site ? "Latest" : "Current"));
    const actions = button("", () => openMenu(commit, actions), "commit-history__more");
    setIcon(actions, "dots-three");
    actions.setAttribute("aria-label", `Actions for ${commit.message || commit.sha.slice(0, 7)}`);
    actions.setAttribute("aria-haspopup", "menu");
    actions.setAttribute("aria-expanded", "false");
    const author = node("span", "commit-history__author");
    author.append(commit.avatar ? avatar(commit.author, commit.avatar) : initial(commit.author), node("span", "", commit.author));
    view.append(line, node("span", "commit-history__subject", commit.message || "Untitled commit"), author);
    item.append(view, actions);
    if (site) item.append(files);
    rows.set(commit.sha, item);
    return item;
  }
  /** A site commit's changed files, read once, under it; each opens that file as it was then. */
  async function unfold(commit: HistoryCommit, view: HTMLButtonElement, files: HTMLUListElement) {
    const open = view.getAttribute("aria-expanded") !== "true";
    view.setAttribute("aria-expanded", String(open));
    setIcon(view.querySelector(".commit-history__twisty")!, open ? "caret-down" : "caret-right", 12);
    files.hidden = !open;
    if (!open || files.dataset.loaded) return;
    files.dataset.loaded = "1";
    files.replaceChildren(node("li", "commit-history__files-note", "Loading files…"));
    try {
      const data = await read<CommitFiles>(`/api/commit?${new URLSearchParams({ repo: options.repo, sha: commit.sha })}`);
      if (!active()) return;
      files.replaceChildren(...data.files.map((file) => fileRow(file, commit)));
      if (!data.files.length) files.append(node("li", "commit-history__files-note", "No files changed."));
      if (data.truncated) files.append(node("li", "commit-history__files-note", "GitHub lists the first 300 files."));
    } catch (error) {
      delete files.dataset.loaded;
      if (active()) files.replaceChildren(node("li", "commit-history__files-note", error instanceof Error ? error.message : "The files could not be loaded."));
    }
  }
  function fileRow(file: CommitFile, commit: HistoryCommit) {
    const item = node("li");
    const open = button("", () => { if (active() && head) options.onOpenFile(file.path, commit, head); }, "commit-history__file");
    const kind = node("span", `file-status is-${file.kind}`, file.kind);
    kind.setAttribute("aria-label", { A: "Added", M: "Modified", D: "Deleted", R: "Renamed" }[file.kind]);
    open.append(kind, node("span", "commit-history__file-path", file.from ? `${file.from} → ${file.path}` : file.path));
    if (file.kind === "D") {
      open.disabled = true;
      open.title = "Deleted in this commit";
    } else open.title = `Open ${file.path} as it was then`;
    item.append(open);
    return item;
  }
  async function load(page: number) {
    if (!active() || loading || restoring) return;
    const id = ++request;
    loading = true;
    menu.close(false);
    confirmation.hidden = true;
    list.hidden = false;
    message.textContent = "Loading commits…";
    if (page === 1) {
      list.replaceChildren(); seen.clear(); rows.clear(); lastDay = "";
      head = undefined; currentFileCommit = undefined; nextPage = null; more.hidden = true;
    }
    refresh();
    try {
      const query = new URLSearchParams({ repo: options.repo, branch: options.branch, page: String(page) });
      if (!site && options.path) query.set("path", options.path);
      if (head) query.set("head", head);
      const data = await read<HistoryPage>(`/api/history?${query}`);
      if (!active() || id !== request) return;
      head = data.head;
      if (page === 1) currentFileCommit = data.commits[0]?.sha;
      for (const commit of data.commits) {
        if (seen.has(commit.sha)) continue;
        seen.add(commit.sha);
        list.append(row(commit));
      }
      mark();
      nextPage = data.nextPage;
      more.hidden = nextPage === null;
      message.textContent = seen.size ? "" : site ? "No commits found on this branch." : "No commits found for this file.";
    } catch (error) {
      if (active() && id === request) message.textContent = error instanceof Error ? error.message : "History could not be loaded. Try again.";
    } finally {
      if (id === request) { loading = false; refresh(); }
    }
  }
  root.addEventListener("focusin", refresh);
  void load(1);
  return {
    root,
    refresh,
    /** The version on show changed outside the list (Back to latest, another file). */
    mark: () => mark(),
    destroy() { disposed = true; request++; menu.close(false); },
  };
}
